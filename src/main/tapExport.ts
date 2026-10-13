// tapExport.ts — write the planned `<ICAO>.tap` into the TAP folder from Settings. No Electron import, so
// it unit-tests directly; ipc.ts resolves the folder and maps the two errors into PctResult codes.
//
// The folder is the user's (usually the TAP converter's input folder), so this touches only the airport's
// own two names there: `<ICAO>.tap`, and `<ICAO>_addendum.tap` when the airport has glider starts. The
// converter merges an addendum it finds beside the `.tap`, so one left over from an earlier export of a
// project that no longer has glider starts is REMOVED — as part of the replace the user confirmed.
// The names come from tapFileName / tapAddendumFileName, which only ever see an identity that passed
// validateIdentity (4-6 letters or digits) — no separator or `..` can reach the path.
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import type { TapPlan } from "../core/export/planExport";
import { writeFileAtomic } from "./fsAtomic";

/** No TAP folder is set (settings.tapDir is null) → "no-tap-dir"; the dialog offers to choose one. */
export class NoTapDirError extends Error {
  constructor() {
    super("No TAP folder is set — choose one first.");
    this.name = "NoTapDirError";
  }
}

/** One of the airport's files is already in the folder and the caller did not say to replace it →
 *  "file-exists". `fileName` names the `.tap` (the file the user thinks of); the message names every
 *  file the replace would touch. */
export class TapFileExistsError extends Error {
  constructor(
    readonly fileName: string,
    message: string,
  ) {
    super(message);
    this.name = "TapFileExistsError";
  }
}

/** What landed: the `.tap`, and the addendum when one was written. */
export interface TapWritten {
  file: string;
  addendum: string | null;
}

const quoteList = (names: string[]): string => names.map((n) => `"${n}"`).join(" and ");

/** Write the plan into `dir`. Atomic per file: a failed write leaves an existing file as it was. */
export function writeTap(dir: string | null, plan: TapPlan, opts: { overwrite: boolean }): TapWritten {
  if (dir === null) throw new NoTapDirError();
  if (!existsSync(dir)) throw new Error(`The TAP folder "${dir}" does not exist — choose it again.`);
  const file = path.join(dir, plan.fileName);
  const addendum = path.join(dir, plan.addendum.fileName);
  const staleAddendum = plan.addendum.content === null && existsSync(addendum);
  if (!opts.overwrite) {
    const present = [
      ...(existsSync(file) ? [plan.fileName] : []),
      ...(existsSync(addendum) ? [plan.addendum.fileName] : []),
    ];
    if (present.length > 0) {
      let message = `${quoteList(present)} already ${present.length === 1 ? "exists" : "exist"} in the TAP folder.`;
      if (staleAddendum) {
        message += ` This project has no glider starts, so replacing removes "${plan.addendum.fileName}" — the converter would add its glider starts to the airport.`;
      }
      throw new TapFileExistsError(plan.fileName, message);
    }
  }
  writeFileAtomic(file, plan.content);
  if (plan.addendum.content !== null) {
    writeFileAtomic(addendum, plan.addendum.content);
    return { file, addendum };
  }
  if (staleAddendum) rmSync(addendum);
  return { file, addendum: null };
}
