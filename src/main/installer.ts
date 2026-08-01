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
  copyFileSync,
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
import type { InstalledHeliport, InstalledPoi } from "../shared/pctApi";
import { POI_README_MARKER } from "../core/export/planExport";
import { HELIPORT_README_MARKER } from "../core/export/heliportTemplate";
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

/** A plan asset name isn't a plain basename (contains a path separator or `..`) — refuse it at the write
 *  boundary. Asset names are internal constants (ANCHOR_ASSETS), so this only ever fires on a bug, but a
 *  POI folder must gain files only at its top level. */
export class UnsafeAssetNameError extends Error {
  constructor(readonly assetName: string) {
    super(`Unsafe asset name: ${JSON.stringify(assetName)}`);
    this.name = "UnsafeAssetNameError";
  }
}

/** No `assetsDir` was provided but the plan requires a bundled asset. A wiring bug, not a user error. */
export class MissingAssetsDirError extends Error {
  constructor(readonly assetName: string) {
    super(`Plan requires bundled asset "${assetName}" but no assetsDir was provided.`);
    this.name = "MissingAssetsDirError";
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
 *  or a user-chosen dir for export-to-folder. Refuses to clobber unless `overwrite`. `opts.assetsDir` is
 *  the directory holding PCT's bundled binary assets (anchorAsset.ts) — required only when the plan ships
 *  any (a POI with plants); an xref/light-only plan has `assets: []` and never reads it. */
export function writePoi(
  plan: ExportPlan,
  root: string,
  opts: { overwrite: boolean; assetsDir?: string },
): WriteResult {
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
    // Bundled binary assets (v0.4 plant anchor mesh+texture). Copied AFTER the text files, into the same
    // staged folder, so the stage-and-swap atomicity covers them too. Names are internal constants, but
    // this is the write boundary: refuse anything that isn't a top-level basename before touching disk.
    for (const name of plan.assets) {
      if (name !== path.basename(name)) throw new UnsafeAssetNameError(name);
      if (opts.assetsDir === undefined) throw new MissingAssetsDirError(name);
      copyFileSync(path.join(opts.assetsDir, name), path.join(staging, name));
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

function hasMarker(dir: string, marker: string): boolean {
  try {
    return readFileSync(path.join(dir, "README.txt"), "utf8").includes(marker);
  } catch {
    return false;
  }
}

function hasPctMarker(dir: string): boolean {
  return hasMarker(dir, POI_README_MARKER);
}

// ── Heliports: the same folder, written under scenery/airports/ instead ───────────────────────────
//
// This is the ONE place PCT writes outside scenery/poi/, so the guard rails are the same ones and one
// more: `country` becomes a DIRECTORY NAME, so it is matched against a two-letter pattern here, at the
// boundary, and not merely validated in core. Everything PCT can create it can also remove.

/** A country code that isn't exactly two letters reached a path — refuse it. */
export class UnsafeCountryError extends Error {
  constructor(readonly country: string) {
    super(`Unsafe country code: ${JSON.stringify(country)}`);
    this.name = "UnsafeCountryError";
  }
}

const COUNTRY_DIR_RE = /^[a-z]{2}$/;

/** `<afs4UserDir>/scenery/airports/<country>` — mirrors how IPACS itself lays them out
 *  (`scenery/airports/de/de0451_steyerberg…/de0451.tsc`). */
export function airportRoot(afs4UserDir: string, country: string): string {
  if (!COUNTRY_DIR_RE.test(country)) throw new UnsafeCountryError(country);
  return path.join(afs4UserDir, "scenery", "airports", country);
}

/** Delete an installed heliport: a safe-named folder inside scenery/airports/<country>/. No-ops if gone.
 *  The country directory is left in place — other airports may live in it. */
export function uninstallHeliport(afs4UserDir: string, country: string, folderName: string): void {
  const dest = resolvePoiPath(airportRoot(afs4UserDir, country), folderName);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
}

/** List the heliports PCT installed under scenery/airports/. Only folders carrying PCT's heliport marker
 *  are returned at all — unlike the POI list, which shows third-party folders greyed out. Someone else's
 *  airport has no business appearing in a list whose only button is Uninstall. */
export function listInstalledHeliports(afs4UserDir: string): InstalledHeliport[] {
  const root = path.join(afs4UserDir, "scenery", "airports");
  const out: InstalledHeliport[] = [];
  let countries;
  try {
    countries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const c of countries) {
    if (!c.isDirectory() || !COUNTRY_DIR_RE.test(c.name)) continue;
    const countryDir = path.join(root, c.name);
    let folders;
    try {
      folders = readdirSync(countryDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of folders) {
      if (!f.isDirectory() || f.name.endsWith(STAGING_SUFFIX)) continue;
      if (!isSafePoiFolderName(f.name)) continue;
      const dir = path.join(countryDir, f.name);
      if (!hasMarker(dir, HELIPORT_README_MARKER)) continue;
      out.push({ folderName: f.name, country: c.name, icao: icaoOf(dir) });
    }
  }
  return out;
}

/** The heliport's code, read from the `<icao>.tsc` FILENAME — no parsing, and it cannot disagree with
 *  what the sim keys on, because the sim finds the file the same way. */
function icaoOf(dir: string): string {
  try {
    const tsc = readdirSync(dir).find((n) => n.toLowerCase().endsWith(".tsc"));
    return tsc === undefined ? "" : path.basename(tsc, path.extname(tsc));
  } catch {
    return "";
  }
}
