// tapExport.ts — write the planned `<ICAO>.tap` into the TAP folder from Settings. No Electron import, so
// it unit-tests directly; ipc.ts resolves the folder and maps the two errors into PctResult codes.
//
// The folder is the user's (usually the TAP converter's input folder), so this writes exactly ONE file
// there and touches nothing else. The name comes from tapFileName, which only ever sees an identity that
// passed validateIdentity (4-6 letters or digits) — no separator or `..` can reach the path.
import { existsSync } from "node:fs";
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

/** The `.tap` is already in the folder and the caller did not say to replace it → "file-exists". */
export class TapFileExistsError extends Error {
  constructor(readonly fileName: string) {
    super(`"${fileName}" already exists in the TAP folder.`);
    this.name = "TapFileExistsError";
  }
}

/** Write the plan's one file into `dir`; returns where it landed. Atomic: a failed write leaves an
 *  existing `.tap` as it was. */
export function writeTap(dir: string | null, plan: TapPlan, opts: { overwrite: boolean }): string {
  if (dir === null) throw new NoTapDirError();
  if (!existsSync(dir)) throw new Error(`The TAP folder "${dir}" does not exist — choose it again.`);
  const file = path.join(dir, plan.fileName);
  if (!opts.overwrite && existsSync(file)) throw new TapFileExistsError(plan.fileName);
  writeFileAtomic(file, plan.content);
  return file;
}
