// icaoIndex.ts — which airport codes are already in use on THIS machine, and which of those are PCT's own.
//
// This is the check that makes "Create heliport…" safe enough to exist. A user `.tsc` whose code
// collides with an existing airport SILENTLY REPLACES it — the sim resolves the duplicate in favour of
// the user folder without any visible error. PCT refuses instead.
//
// "Is this code on disk?" alone is the wrong question: after PCT installs a heliport its code IS on
// disk, and refusing it would forbid re-installing the heliport PCT just wrote (the edit loop). So the
// question is split in two, and only one half is a refusal:
//
//   `taken` — held by an airport PCT does NOT own. That one still gets a hard no; it is someone's
//             scenery and installing over it makes it disappear.
//   `ours`  — held by a heliport PCT installed. Replacing that is not a collision, it is the edit loop.
//
// ZERO IPACS BYTES. The index is built from FILENAMES — `readdir`, never `readFile`. A `.wad` on disk is
// one airport, and its basename IS the code (`kdag.wad` → KDAG). (The marker file that identifies our
// own folders is READ, but it is a README.txt PCT itself wrote.)
//
// WHAT IT CANNOT DO, stated plainly: it describes the machine PCT is running on, at this moment. It says
// nothing about a machine that later receives a copy of the folder, and nothing about an add-on installed
// afterwards. That residual is the ecosystem's — every add-on airport ever published shares it — but it
// is the reason the installed heliport's README says which check was made and when.

import { readdirSync } from "node:fs";
import path from "node:path";
import type { InstalledHeliport } from "../shared/pctApi";
import { listInstalledHeliports } from "./installer";

/** Every directory a `.wad` can live in, in scan order. Missing ones are skipped silently — a user may
 *  have no user-folder airports at all, and `airports_db` only exists in a full install. */
function wadRoots(installDir: string | null, afs4UserDir: string | null): string[] {
  const roots: string[] = [];
  if (installDir !== null) {
    roots.push(path.join(installDir, "scenery", "airports_db"));
    roots.push(path.join(installDir, "scenery", "airports"));
  }
  if (afs4UserDir !== null) roots.push(path.join(afs4UserDir, "scenery", "airports"));
  return roots;
}

/** Collect `<basename>` of every `*.wad` under `dir`, recursively, skipping any directory in `exclude`.
 *  Lowercased: the sim matches codes case-insensitively (the code may be uppercase inside the file and
 *  lowercase in the filename). */
function collectWads(dir: string, out: Set<string>, exclude: ReadonlySet<string>): void {
  if (exclude.has(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // absent or unreadable — not an error, just nothing to add
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collectWads(full, out, exclude);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".wad")) {
      out.add(path.basename(e.name, path.extname(e.name)).toLowerCase());
    }
  }
}

/** The absolute folder of one PCT-installed heliport. */
function heliportDir(afs4UserDir: string, h: InstalledHeliport): string {
  return path.join(afs4UserDir, "scenery", "airports", h.country, h.folderName);
}

/** Build the index from disk, NOT counting the heliports PCT installed. Costs one recursive readdir of
 *  the airport trees. `exclude` holds absolute directory paths to skip whole. */
export function scanTakenIcaos(
  installDir: string | null,
  afs4UserDir: string | null,
  exclude: ReadonlySet<string> = new Set(),
): Set<string> {
  const taken = new Set<string>();
  for (const root of wadRoots(installDir, afs4UserDir)) collectWads(root, taken, exclude);
  return taken;
}

// The dialog asks on every keystroke, so the scan is memoised. Two things bust it without anyone having
// to remember to call forgetTakenIcaos():
//
//   • the KEY carries the excluded folders, so installing or removing a PCT heliport re-scans by itself;
//   • the TTL bounds how long ANY answer can be wrong — e.g. a folder deleted by hand while PCT sat
//     open must release its code. Five seconds is short enough that nobody notices they waited
//     and long enough that a burst of keystrokes costs one scan.
//
// Anything about to WRITE still passes `refresh: true`: the answer that matters there is the one true at
// the moment of the write, not one up to five seconds old.
const MEMO_TTL_MS = 5000;

let cached: { key: string; at: number; taken: Set<string> } | null = null;

/** The codes held by airports PCT does not own. `ours` is excluded — ask `icaoStatus` about those. */
export function takenIcaos(
  installDir: string | null,
  afs4UserDir: string | null,
  opts: { refresh?: boolean } = {},
): Set<string> {
  const ours = afs4UserDir === null ? [] : listInstalledHeliports(afs4UserDir);
  const exclude = new Set(
    afs4UserDir === null ? [] : ours.map((h) => heliportDir(afs4UserDir, h)),
  );
  const key = `${installDir ?? ""} ${afs4UserDir ?? ""} ${[...exclude].sort().join("|")}`;
  const now = Date.now();
  if (!opts.refresh && cached !== null && cached.key === key && now - cached.at < MEMO_TTL_MS) {
    return cached.taken;
  }
  const taken = scanTakenIcaos(installDir, afs4UserDir, exclude);
  cached = { key, at: now, taken };
  return taken;
}

/** Drop the memo (settings changed, or a heliport was just installed/removed). */
export function forgetTakenIcaos(): void {
  cached = null;
}

/** What stands in the way of using `icao` on this machine — the whole answer, so the dialog and the
 *  install path reason about the same two facts rather than one boolean each. */
export interface IcaoStatus {
  /** Held by an airport PCT does not own. A hard refusal: installing over it makes that airport vanish. */
  taken: boolean;
  /** Heliports PCT installed that hold this code. Replacing them is the edit loop, not a collision — but
   *  the user is shown which folder goes, because a rename means the old folder is a DIFFERENT one. */
  ours: InstalledHeliport[];
}

export function icaoStatus(
  installDir: string | null,
  afs4UserDir: string | null,
  icao: string,
  opts: { refresh?: boolean } = {},
): IcaoStatus {
  const code = icao.trim().toLowerCase();
  const ours =
    afs4UserDir === null
      ? []
      : listInstalledHeliports(afs4UserDir).filter((h) => h.icao.toLowerCase() === code);
  return { taken: takenIcaos(installDir, afs4UserDir, opts).has(code), ours };
}

/** The refusal. Carries the code so the dialog can say which one, and be sure it is talking about the
 *  value the user typed rather than a generic failure. */
export class IcaoTakenError extends Error {
  constructor(readonly icao: string) {
    super(
      `The airport code "${icao.toUpperCase()}" is already used by an airport installed on this machine. ` +
        `Installing over it would make that airport disappear. Pick another code.`,
    );
    this.name = "IcaoTakenError";
  }
}
