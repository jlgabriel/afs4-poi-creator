// installer.ts — main-process POI package I/O (design §3.4). Takes the pure ExportPlan (folderName +
// files, produced by core/planExport) and writes it into a folder: either the AFS4 user dir's
// scenery/poi/ (install) or any user-chosen dir (export-to-folder, to zip and share). Also uninstalls
// and lists installed POIs.
//
// Electron-free (fs only; dirs passed in, shell.showItemInFolder stays in ipc.ts) so it unit-tests
// directly. This module IS the write half of the trust boundary: per the Fable review (P0-2) the
// folder name is re-validated with isSafePoiFolderName HERE — having the check in core is not enough,
// it must sit where disk is touched — and every path is resolved strictly inside its root, so PCT can
// only ever create or delete folders it could have produced (design §3.4 safety note).

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ExportPlan } from "../core/project/types";
import type { InstalledPoi } from "../shared/pctApi";
import { POI_README_MARKER } from "../core/export/planExport";
import { isSafePoiFolderName } from "../core/geo/poiName";

/** Scratch folder built beside the destination and swapped in with a single rename (see writePoi).
 *  Deliberately NOT a valid POI folder name — isSafePoiFolderName rejects it — so one left behind by a
 *  crash is never listed as installed nor offered for uninstall. */
const STAGING_SUFFIX = ".pct-staging";

/** A folder name that isn't a safe coord-prefixed slug reached the write boundary — refuse it. */
export class UnsafeFolderNameError extends Error {
  constructor(readonly folderName: string) {
    super(`Unsafe POI folder name: ${JSON.stringify(folderName)}`);
    this.name = "UnsafeFolderNameError";
  }
}

/** The destination folder already exists and the caller did not ask to overwrite. */
export class FolderExistsError extends Error {
  constructor(readonly folderName: string) {
    super(`A POI folder named "${folderName}" already exists.`);
    this.name = "FolderExistsError";
  }
}

export interface WriteResult {
  folderName: string;
  path: string; // absolute destination (main-produced → safe to reveal)
  overwrote: boolean;
}

/** `<afs4UserDir>/scenery/poi` — the only directory installs/uninstalls/listing ever touch. */
export function poiRoot(afs4UserDir: string): string {
  return path.join(afs4UserDir, "scenery", "poi");
}

/** Resolve `<root>/<folderName>` only if `folderName` is a safe slug AND stays inside `root`. Guards
 *  every path that becomes a write/delete target. */
export function resolvePoiPath(root: string, folderName: string): string {
  if (!isSafePoiFolderName(folderName)) throw new UnsafeFolderNameError(folderName);
  const rootAbs = path.resolve(root);
  const dest = path.resolve(rootAbs, folderName);
  if (dest !== path.join(rootAbs, folderName) || !dest.startsWith(rootAbs + path.sep)) {
    throw new UnsafeFolderNameError(folderName);
  }
  return dest;
}

/** Write a planned POI into `<root>/<plan.folderName>/`. `root` is poiRoot(userDir) for an install
 *  or a user-chosen dir for export-to-folder. Refuses to clobber unless `overwrite`. */
export function writePoi(plan: ExportPlan, root: string, opts: { overwrite: boolean }): WriteResult {
  const dest = resolvePoiPath(root, plan.folderName);
  const overwrote = existsSync(dest);
  if (overwrote && !opts.overwrite) throw new FolderExistsError(plan.folderName);

  mkdirSync(root, { recursive: true });
  // Build the POI in a sibling staging folder and swap it in with ONE rename. Writing straight into
  // `dest` meant a failure part-way through the loop (a full disk) left a PARTIAL POI in scenery/poi/ —
  // and on overwrite the old, WORKING POI had already been deleted, so the user lost both (Fable I5).
  // Now the destination changes only once the replacement is complete on disk.
  const staging = dest + STAGING_SUFFIX;
  rmSync(staging, { recursive: true, force: true }); // scratch from an interrupted earlier write
  try {
    mkdirSync(staging, { recursive: true }); // explicit: a plan with no files must still stage a folder
    for (const f of plan.files) {
      const p = path.join(staging, f.relPath);
      mkdirSync(path.dirname(p), { recursive: true });
      writeFileSync(p, f.content, "utf8"); // keep \n endings — AFS4 text files use LF
    }
    if (overwrote) rmSync(dest, { recursive: true, force: true });
    renameSync(staging, dest);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true }); // leave no half-built POI behind
    throw e;
  }
  return { folderName: plan.folderName, path: dest, overwrote };
}

/** Copy an already-written POI folder into scenery/poi/ (e.g. install what export-to-folder built).
 *  Not used by the current flow — writePoi goes straight to the destination — but kept for the M2
 *  "install a folder someone shared" path. Validates + overwrite-guards like writePoi. */
export function installPoiFolder(
  srcFolder: string,
  afs4UserDir: string,
  opts: { overwrite: boolean },
): WriteResult {
  const folderName = path.basename(srcFolder);
  const root = poiRoot(afs4UserDir);
  const dest = resolvePoiPath(root, folderName);
  const overwrote = existsSync(dest);
  if (overwrote && !opts.overwrite) throw new FolderExistsError(folderName);
  mkdirSync(root, { recursive: true });
  const staging = dest + STAGING_SUFFIX; // stage + swap, same reason as writePoi
  rmSync(staging, { recursive: true, force: true });
  try {
    cpSync(srcFolder, staging, { recursive: true });
    if (overwrote) rmSync(dest, { recursive: true, force: true });
    renameSync(staging, dest);
  } catch (e) {
    rmSync(staging, { recursive: true, force: true });
    throw e;
  }
  return { folderName, path: dest, overwrote };
}

/** Delete an installed POI. Only ever removes a safe-named folder inside scenery/poi/. No-ops if the
 *  folder is already gone. */
export function uninstallPoi(afs4UserDir: string, folderName: string): void {
  const dest = resolvePoiPath(poiRoot(afs4UserDir), folderName);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
}

/** List the POI folders under scenery/poi/. `byPct` (safe to offer Uninstall) is true only when the
 *  folder is a safe slug AND carries PCT's README marker — so anything the UI offers to uninstall is
 *  already guarded. Missing scenery/poi/ → empty list. */
export function listInstalledPois(afs4UserDir: string): InstalledPoi[] {
  const root = poiRoot(afs4UserDir);
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: InstalledPoi[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.endsWith(STAGING_SUFFIX)) continue; // scratch from an interrupted write — not a POI
    const byPct = isSafePoiFolderName(e.name) && hasPctMarker(path.join(root, e.name));
    out.push({ folderName: e.name, byPct });
  }
  return out;
}

function hasPctMarker(dir: string): boolean {
  try {
    return readFileSync(path.join(dir, "README.txt"), "utf8").includes(POI_README_MARKER);
  } catch {
    return false;
  }
}
