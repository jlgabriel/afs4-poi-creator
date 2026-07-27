// footprints.ts (main) — where the user's own measurements live on disk (v0.9). The pure half: no
// Electron import (fs only) so it unit-tests directly, exactly like thumbnails.ts. ipc.ts owns the
// dialogs and the userData path.
//
// `<userData>/footprints.json`, deliberately NOT part of the catalog cache: the cache is rebuilt from
// the install on every Rescan and these are the one thing in the app a Rescan must never touch. Same
// standing as the object-photos folder — the user's own data about IPACS objects, on the user's own
// disk, never bundled and never exported into a POI (the `.toc` has no footprint field; this is an
// editor visual and reaches the sim in no form whatsoever).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_FOOTPRINTS, type FootprintOverrides } from "../core/catalog/footprints";
import { parseFootprints } from "../core/project/schemas";
import { writeFileAtomic } from "./fsAtomic";

export const footprintsFile = (userDataDir: string): string => path.join(userDataDir, "footprints.json");

/** The user's measurements, or an empty set. A missing file is the normal first-run state; a corrupt one
 *  degrades to empty rather than throwing, because the alternative is an app that won't boot over a
 *  cosmetic file (readSettings takes the same view of settings.json). The bad file is left ON DISK
 *  untouched — it is data the user typed, so it stays recoverable by hand. */
export function readFootprints(userDataDir: string): FootprintOverrides {
  const file = footprintsFile(userDataDir);
  if (!existsSync(file)) return EMPTY_FOOTPRINTS;
  try {
    return parseFootprints(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return EMPTY_FOOTPRINTS;
  }
}

/** Validate, then persist atomically. Validating on the way OUT as well as in is what keeps a renderer
 *  bug from writing a file the next launch would silently discard as corrupt. */
export function writeFootprints(userDataDir: string, fp: FootprintOverrides): FootprintOverrides {
  const validated = parseFootprints(fp);
  writeFileAtomic(footprintsFile(userDataDir), JSON.stringify(validated, null, 2));
  return validated;
}

/** Read a footprints file the user picked in the import dialog. Throws (→ an "io" PctResult carrying the
 *  zod message) on anything that isn't one — an import that quietly does nothing is worse than an error
 *  that names the field. */
export function readFootprintsFile(file: string): FootprintOverrides {
  return parseFootprints(JSON.parse(readFileSync(file, "utf8")));
}
