// fsAtomic.ts — write a file, or leave the previous one intact. Never anything in between.
//
// Every durable write in PCT aimed writeFileSync straight at its destination, so a crash (or a full disk)
// part-way through replaced a good file with a truncated one. That is worst precisely where it hurts most:
// the crash-recovery shadow — the one file whose entire job is to survive a crash — and the POI folder,
// where an overwrite deleted the working POI BEFORE writing its replacement (Fable I5).
//
// The fix is the standard one: build the new content beside the destination, then RENAME it into place.
// rename is atomic on NTFS and POSIX alike (Node passes MOVEFILE_REPLACE_EXISTING on Windows, so it
// replaces an existing file), so a reader only ever sees the old file or the new one.

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Suffix of the scratch file written next to the destination. Nothing reads it: every loader in PCT
 *  opens an exact filename (shadow.json, poi.toc, …), so a leftover from a crash is inert litter. */
const TMP_SUFFIX = ".pct-tmp";

/** Write `data` to `file` atomically. If anything fails, `file` keeps whatever it held before. */
export function writeFileAtomic(file: string, data: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + TMP_SUFFIX;
  writeFileSync(tmp, data, "utf8"); // LF endings preserved — AFS4 text files use them
  try {
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true }); // never leave scratch beside the file we failed to replace
    throw e;
  }
}
