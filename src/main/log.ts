// log.ts — PCT's ONE diagnostic log: a plain-text file the user can open and paste into a forum report.
//
// Why it exists: every expensive bug so far (plants not loading on Mac, photos missing for a dashed
// XREF name, a tooltip broken only on macOS) was expensive for the same reason — nobody could see what
// happened on the reporter's machine, so each one cost a round of "try this, tell me what you see".
// The log turns that first round into a paste.
//
// Two rules keep it from becoming the thing it is meant to prevent:
//
//   1. ONE SESSION, and nothing else. The file is opened with "w" at boot, so every launch TRUNCATES it.
//      There is no rotation, no `.1`/`.2` files, no date-stamped siblings to clean up. What you paste is
//      always the run you just did. (Launch PCT twice and the second run truncates the first's log —
//      inherent, harmless: the log is a report about the run you are having, not an archive.)
//   2. A HARD BYTE CEILING inside that session. "Truncate at boot" alone still lets one pathological
//      loop fill a disk over a long session, so writes stop dead at `maxBytes` after one final notice.
//      Bounded by construction, not by good behaviour upstream.
//
// It is never load-bearing: a log that cannot be opened or written degrades to a no-op, and no call site
// checks a return value. Nothing in PCT should fail because the diagnostics did.
//
// No Electron import — the file path and the home dir are passed in — so this unit-tests directly.
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import path from "node:path";

export const LOG_FILE_NAME = "pct.log";

/** Ceiling for ONE session's log (see rule 2). 1 MB is far more than a real session produces — a normal
 *  run lands in the low kilobytes — so hitting it means something is looping, which the notice says. */
export const DEFAULT_MAX_BYTES = 1_000_000;

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  /** Absolute path of the log file, "" when the log could not be opened. Shown in Settings. */
  readonly file: string;
  /** Untimestamped block — the boot header and the settings summary. Redacted and capped like any line. */
  banner(text: string): void;
  line(level: LogLevel, message: string): void;
  info(message: string): void;
  warn(message: string): void;
  /** `cause` is appended as `name: message` + stack, indented under the line. */
  error(message: string, cause?: unknown): void;
  close(): void;
}

export interface LogOptions {
  /** Home directory to hide behind `~` (pass os.homedir()). null disables redaction. */
  home?: string | null;
  /** Clock seam for tests. */
  now?: () => Date;
  maxBytes?: number;
}

/** The log is meant to be pasted in public, and on Windows every interesting path starts with the user's
 *  real name (`C:\Users\Juan Luis\…`). Hide the home PREFIX only: the part that actually diagnoses things
 *  — a OneDrive-redirected Documents, a dash in a folder name, the case of a path segment — is downstream
 *  of it and survives intact. Case-insensitive (Windows is), and both separators, since Node hands back
 *  `\` and our own joins sometimes carry `/`. */
export function redactHome(text: string, home: string | null | undefined): string {
  if (home === null || home === undefined || home.length === 0) return text;
  const variants = [home, home.replace(/\\/g, "/")];
  let out = text;
  for (const v of new Set(variants)) {
    out = out.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "~");
  }
  return out;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** `HH:MM:SS.mmm`, local time. The full date lives once in the boot header; per-line wall-clock time is
 *  what lets a PCT line be lined up against the sim's own tm.log entry for the same moment. */
function stamp(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

/** An unknown thrown value as text: stack when there is one (it already carries "name: message"). */
export function describeCause(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? `${cause.name}: ${cause.message}`;
  return String(cause);
}

const NOOP: Logger = {
  file: "",
  banner: () => {},
  line: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  close: () => {},
};

/** Open (and TRUNCATE) `file` and return a logger writing to it. Returns a no-op logger if the file
 *  cannot be opened — a missing log never blocks a launch. */
export function createLogger(file: string, opts: LogOptions = {}): Logger {
  const { home = null, now = (): Date => new Date(), maxBytes = DEFAULT_MAX_BYTES } = opts;

  let fd: number;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    fd = openSync(file, "w"); // "w" = create or TRUNCATE — this is rule 1, and it is the whole retention policy
  } catch {
    return NOOP;
  }

  let written = 0;
  let capped = false;
  let closed = false;

  /** Write raw text, honouring the ceiling. Never throws. */
  function put(text: string): void {
    if (closed || capped) return;
    try {
      const buf = Buffer.from(text, "utf8");
      if (written + buf.length > maxBytes) {
        capped = true;
        writeSync(
          fd,
          `\n— log capped at ${maxBytes} bytes; nothing further is recorded this session —\n`,
        );
        return;
      }
      writeSync(fd, buf);
      written += buf.length;
    } catch {
      /* a full disk, a yanked drive, a closed fd — diagnostics are never worth an exception */
    }
  }

  const logger: Logger = {
    get file(): string {
      return file;
    },
    banner(text) {
      put(`${redactHome(text, home)}\n`);
    },
    line(level, message) {
      // Continuation lines (a stack trace) are indented so one entry stays one visual block and a
      // line-oriented read of the file still works.
      const body = redactHome(message, home).replace(/\r?\n/g, "\n    ");
      put(`${stamp(now())}  ${level.padEnd(5)}  ${body}\n`);
    },
    info(message) {
      logger.line("info", message);
    },
    warn(message) {
      logger.line("warn", message);
    },
    error(message, cause) {
      logger.line("error", cause === undefined ? message : `${message}\n${describeCause(cause)}`);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        closeSync(fd);
      } catch {
        /* nothing useful to do at exit */
      }
    },
  };
  return logger;
}

// ── The boot header ──────────────────────────────────────────────────────────

export interface BootInfo {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string; // process.platform
  arch: string;
  osVersion: string; // app.getSystemVersion() — the marketing version, e.g. "10.0.26200"
  packaged: boolean;
  locale: string;
  userData: string;
  startedAt: Date;
}

/** The first block of every log. Everything here answers a question that otherwise costs a forum round
 *  trip — which PCT, which OS, dev build or installer. Pure, so its shape is asserted in the unit test. */
export function formatBootHeader(i: BootInfo): string {
  const d = i.startedAt;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${stamp(d)}`;
  return [
    `PCT ${i.appVersion} — diagnostic log`,
    `This file is rewritten from scratch every time PCT starts. Paths inside your home folder`,
    `are shown as ~. Nothing here is sent anywhere — it is yours to read, or to paste into a`,
    `bug report if you want help.`,
    ``,
    `started   ${date}`,
    `platform  ${i.platform} ${i.arch} (${i.osVersion})`,
    `runtime   electron ${i.electron} · chrome ${i.chrome} · node ${i.node}`,
    `build     ${i.packaged ? "packaged (installer)" : "dev (npm run dev / e2e)"}`,
    `locale    ${i.locale}`,
    `userData  ${i.userData}`,
    `${"─".repeat(78)}`,
  ].join("\n");
}

// ── Line formatters ──────────────────────────────────────────────────────────
// Kept here, pure and on PRIMITIVES (no Project import — log.ts stays dependency-free), so the shape of a
// line that has to be right can be asserted in a test instead of read in a review.

/** The export line. Takes `heightMode` as it is ON THE PROJECT, i.e. possibly absent.
 *
 *  The first version of this printed `project.heightMode` raw and the very first real log said
 *  "undefined mode" — because absent IS the default (mutate.setHeightMode deletes the key for "baked-asl"
 *  so saved projects stay byte-identical, and every other reader spells the `?? "baked-asl"` out). A log
 *  answering "which height mode did this export use?" with "undefined" answers nothing, and heights are
 *  exactly the class of question that otherwise costs a test flight. Resolve it here, once. */
export function formatExportSummary(i: {
  poiName: string;
  objects: number;
  heightMode: string | undefined;
  target: string;
  overwrite: boolean;
  baseElevation?: number;
}): string {
  return (
    `export "${i.poiName}" — ${i.objects} objects, ${i.heightMode ?? "baked-asl"} mode, ` +
    `target ${i.target}${i.overwrite ? " (overwrite)" : ""}` +
    `${i.baseElevation != null ? `, manual base ${i.baseElevation} m` : ""}`
  );
}

// ── The process-wide instance ────────────────────────────────────────────────
// Main opens it once at boot (initLog) and every module just imports `log`. Before initLog — and in the
// unit tests, which never boot Electron — `log` is the no-op, so importing a module that logs costs
// nothing and touches no disk.
let current: Logger = NOOP;

export function initLog(file: string, opts: LogOptions = {}): Logger {
  current.close();
  current = createLogger(file, opts);
  return current;
}

/** The live logger. A stable façade, so call sites can `import { log }` once at module load and still
 *  reach whatever initLog installed later. */
export const log: Logger = {
  get file(): string {
    return current.file;
  },
  banner: (text) => current.banner(text),
  line: (level, message) => current.line(level, message),
  info: (message) => current.info(message),
  warn: (message) => current.warn(message),
  error: (message, cause) => current.error(message, cause),
  close: () => current.close(),
};
