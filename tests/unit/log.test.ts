// log.test.ts — the two properties that make the session log safe to ship (main/log.ts): it is REWRITTEN
// at every launch, and it is BOUNDED inside a launch. Everything else about a logger can be judged by
// reading it; those two are what stop it becoming a file that quietly eats a user's disk.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createLogger,
  formatBootHeader,
  formatExportSummary,
  redactHome,
} from "../../src/main/log";

let tmp: string;
let file: string;
const at = (h: number, m: number, s: number, ms = 0): (() => Date) => (): Date =>
  new Date(2026, 6, 26, h, m, s, ms);

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-log-"));
  file = path.join(tmp, "pct.log");
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const read = (): string => readFileSync(file, "utf8");

describe("the log is one session and nothing else", () => {
  it("TRUNCATES an existing log at open — last run's lines are gone, not appended to", () => {
    writeFileSync(file, "lines from the previous run\n".repeat(500));
    const before = statSync(file).size;

    const log = createLogger(file, { now: at(9, 0, 0) });
    log.info("this run");
    log.close();

    const after = read();
    expect(after).not.toContain("previous run");
    expect(after).toContain("this run");
    expect(after.length).toBeLessThan(before);
  });

  it("creates the file (and its directory) when there is none", () => {
    const nested = path.join(tmp, "deep", "deeper", "pct.log");
    const log = createLogger(nested, { now: at(9, 0, 0) });
    log.info("hello");
    log.close();
    expect(existsSync(nested)).toBe(true);
    expect(readFileSync(nested, "utf8")).toContain("hello");
  });

  it("writes one timestamped, level-tagged line per entry, in order", () => {
    const log = createLogger(file, { now: at(14, 3, 11, 204) });
    log.info("first");
    log.warn("second");
    log.close();

    const lines = read().trimEnd().split("\n");
    expect(lines).toEqual(["14:03:11.204  info   first", "14:03:11.204  warn   second"]);
  });

  it("indents a stack trace under its line, so one entry stays one block", () => {
    const log = createLogger(file, { now: at(9, 0, 0) });
    log.error("export failed", new Error("disk full"));
    log.close();

    const lines = read().trimEnd().split("\n");
    expect(lines[0]).toBe("09:00:00.000  error  export failed");
    expect(lines[1]).toMatch(/^ {4}Error: disk full/);
  });

  it("survives a non-Error thrown value", () => {
    const log = createLogger(file, { now: at(9, 0, 0) });
    log.error("odd", "just a string");
    log.close();
    expect(read()).toContain("just a string");
  });
});

describe("the log is bounded inside a session", () => {
  it("stops writing at the byte ceiling and says so exactly once", () => {
    const log = createLogger(file, { now: at(9, 0, 0), maxBytes: 400 });
    for (let i = 0; i < 1000; i++) log.info(`line ${i} — padding to burn through the ceiling quickly`);
    log.close();

    const text = read();
    expect(text).toContain("log capped at 400 bytes");
    expect(text.match(/log capped at/g)).toHaveLength(1);
    // The notice itself is allowed past the ceiling; what must not happen is 1000 lines landing anyway.
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(600);
    expect(text).not.toContain("line 999");
  });

  it("a capped log still closes cleanly and ignores further writes", () => {
    const log = createLogger(file, { now: at(9, 0, 0), maxBytes: 100 });
    for (let i = 0; i < 200; i++) log.info(`filling ${i}`);
    const capped = read();
    log.info("after the cap");
    log.close();
    expect(read()).toBe(capped);
  });
});

describe("redaction", () => {
  it("hides the home prefix behind ~ but keeps everything downstream of it", () => {
    const home = "C:\\Users\\Juan Luis";
    const line = `photo pasted — ${home}\\Pictures\\PCT\\my-object.png`;
    expect(redactHome(line, home)).toBe("photo pasted — ~\\Pictures\\PCT\\my-object.png");
  });

  it("is case-insensitive and handles forward slashes (Windows hands back both)", () => {
    const home = "C:\\Users\\Juan";
    expect(redactHome("c:\\users\\juan\\Documents", home)).toBe("~\\Documents");
    expect(redactHome("C:/Users/Juan/Documents", home)).toBe("~/Documents");
  });

  it("leaves a path outside the home folder alone — that is the diagnostic half", () => {
    expect(redactHome("D:\\Steam\\Aerofly FS 4", "C:\\Users\\Juan")).toBe("D:\\Steam\\Aerofly FS 4");
  });

  it("applies to every line written, not just the ones a call site remembered to clean", () => {
    const log = createLogger(file, { now: at(9, 0, 0), home: "C:\\Users\\Juan" });
    log.info("user dir C:\\Users\\Juan\\Documents\\Aerofly FS 4");
    log.close();
    expect(read()).toContain("~\\Documents\\Aerofly FS 4");
    expect(read()).not.toContain("Juan");
  });

  it("no home given → nothing is rewritten", () => {
    expect(redactHome("C:\\Users\\Juan", null)).toBe("C:\\Users\\Juan");
    expect(redactHome("C:\\Users\\Juan", "")).toBe("C:\\Users\\Juan");
  });
});

describe("the log never breaks the app", () => {
  it("an unopenable path degrades to a no-op logger instead of throwing", () => {
    // A FILE where the log wants a DIRECTORY — mkdirSync/openSync both refuse this on every platform.
    const blocker = path.join(tmp, "blocker");
    writeFileSync(blocker, "not a directory");
    const log = createLogger(path.join(blocker, "pct.log"));
    expect(() => {
      log.info("swallowed");
      log.error("also swallowed", new Error("boom"));
      log.close();
    }).not.toThrow();
    expect(log.file).toBe(""); // "" is how Settings knows there is nothing to open
  });
});

describe("export summary", () => {
  const base = { poiName: "munich_2", objects: 2, target: "install", overwrite: false };

  // The regression. The first real log ever produced read "2 objects, undefined mode": absent IS the
  // default (setHeightMode deletes the key for baked-asl), and this line printed the field raw.
  it("an ABSENT heightMode reads as baked-asl, never as undefined", () => {
    const line = formatExportSummary({ ...base, heightMode: undefined });
    expect(line).toContain("baked-asl mode");
    expect(line).not.toContain("undefined");
  });

  it("an explicit mode is passed through", () => {
    expect(formatExportSummary({ ...base, heightMode: "autoheight" })).toContain("autoheight mode");
  });

  it("carries the facts an export report needs, and nothing it doesn't", () => {
    expect(formatExportSummary({ ...base, heightMode: undefined })).toBe(
      'export "munich_2" — 2 objects, baked-asl mode, target install',
    );
  });

  it("mentions overwrite and a manual base only when they apply", () => {
    const full = formatExportSummary({
      ...base,
      heightMode: "baked-asl",
      target: "choose-folder",
      overwrite: true,
      baseElevation: 584,
    });
    expect(full).toContain("(overwrite)");
    expect(full).toContain("manual base 584 m");
    // A base of 0 is a REAL value (sea level), not an absent one — `!= null`, not falsy.
    expect(formatExportSummary({ ...base, heightMode: undefined, baseElevation: 0 })).toContain(
      "manual base 0 m",
    );
  });
});

describe("boot header", () => {
  it("carries the facts a bug report otherwise has to ask for", () => {
    const header = formatBootHeader({
      appVersion: "0.8.0",
      electron: "43.0.0",
      chrome: "140.0.0",
      node: "22.20.0",
      platform: "win32",
      arch: "x64",
      osVersion: "10.0.26200",
      packaged: true,
      locale: "es-CL",
      userData: "~\\AppData\\Roaming\\afs4-poi-creator",
      startedAt: new Date(2026, 6, 26, 14, 3, 11, 204),
    });
    expect(header).toContain("PCT 0.8.0");
    expect(header).toContain("2026-07-26 14:03:11.204");
    expect(header).toContain("win32 x64 (10.0.26200)");
    expect(header).toContain("electron 43.0.0");
    expect(header).toContain("packaged (installer)");
    // The reader has to know it is disposable, or they will hunt for old ones that don't exist.
    expect(header).toContain("rewritten from scratch");
  });

  it("names a dev build as a dev build — the version alone can't tell them apart", () => {
    const dev = formatBootHeader({
      appVersion: "0.8.0",
      electron: "43.0.0",
      chrome: "140.0.0",
      node: "22.20.0",
      platform: "darwin",
      arch: "arm64",
      osVersion: "15.2",
      packaged: false,
      locale: "en-US",
      userData: "~/Library/Application Support/afs4-poi-creator",
      startedAt: new Date(2026, 6, 26, 9, 0, 0),
    });
    expect(dev).toContain("dev (npm run dev / e2e)");
  });
});
