// afs4Paths.ts — main-process filesystem helpers for locating an AFS4 install and user dir.
// Ports the proven CLI logic (cli/scan.ts / cli/export.ts) and adds Steam auto-detection. No
// Electron import (pure node fs) so it unit-tests directly; the UI always lets the user Browse to
// override anything auto-detection misses (e.g. Windows Documents→OneDrive redirection, R5).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Recursively collect every file under `root` with the given lowercase extension (unreadable dirs are
 *  skipped, not fatal). Recursion is load-bearing for `.tmi`/`.tmb`, where an add-on ships as a
 *  ZIP-of-a-folder and a root-only walk saw nothing (forum #122). */
function findByExt(root: string, ext: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) findByExt(full, ext, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(ext)) out.push(full);
  }
  return out;
}

/** Every .tmi under `root` — the xref catalog index. */
export const findTmi = (root: string): string[] => findByExt(root, ".tmi");

/** Every .tmb under `root` — the v0.2 airport-light fixtures (no `.tmi`, no bounding box). */
export const findTmb = (root: string): string[] => findByExt(root, ".tmb");

/** Every .ttx under `root` — the v0.4 plant library. `.ttx` is a TEXTURE, and for plants that is the
 *  whole asset: `scenery/plants` ships 41 textures and no geometry at all, so the filename is the
 *  entire record (see core/catalog/plants.ts). */
export const findTtx = (root: string): string[] => findByExt(root, ".ttx");

/** Resolve a library dir under an install root: try each `candidates` relative path in turn, and also
 *  tolerate being handed the leaf directory itself (the CLI accepts either). */
function resolveLibraryDir(installArg: string, leaf: string, candidates: string[]): string | null {
  const paths = candidates.map((c) => path.join(installArg, c));
  if (path.basename(installArg).toLowerCase() === leaf) paths.unshift(installArg);
  for (const c of paths) {
    if (existsSync(c) && statSync(c).isDirectory()) return c;
  }
  return null;
}

/** The airport-light library dir (`<install>/airport_lights`), or null if absent. Install-only —
 *  there is no known user-dir airport-light concept. */
export function resolveAirportLightsDir(installArg: string): string | null {
  return resolveLibraryDir(installArg, "airport_lights", ["airport_lights"]);
}

/** The plant library dir (`<install>/scenery/plants`), or null if absent (v0.4). Install-only: a plant
 *  is drawn from a built-in texture referenced by group + species, so there is no user-supplied
 *  equivalent to scan the way `scenery/xref` has one. */
export function resolvePlantsDir(installArg: string): string | null {
  return resolveLibraryDir(installArg, "plants", [path.join("scenery", "plants"), "plants"]);
}

/** Resolve an install root (or a scenery/xref dir) to the directory that holds the .tmi files. */
export function resolveXrefDir(installArg: string): string | null {
  const candidates = [path.join(installArg, "scenery", "xref"), path.join(installArg, "xref")];
  if (path.basename(installArg).toLowerCase() === "xref") candidates.unshift(installArg);
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isDirectory()) return c;
  }
  if (existsSync(installArg) && findTmi(installArg).length > 0) return installArg;
  return null;
}

/** The AFS4 user folder (holds scenery/) per OS. On Windows, pass `documentsDir` =
 *  app.getPath("documents") so an OneDrive-redirected Documents is honoured (design R5); Settings
 *  still lets the user override the result. */
export function afs4UserDir(documentsDir?: string): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Aerofly FS 4");
  }
  if (process.platform === "win32") {
    return path.join(documentsDir ?? path.join(home, "Documents"), "Aerofly FS 4");
  }
  return path.join(home, "Aerofly FS 4");
}

const AFS4_INSTALL_LEAF = "Aerofly FS 4 Flight Simulator";

/** Steam library roots to probe: platform defaults plus any extra libraries declared in Steam's
 *  libraryfolders.vdf (parsed leniently — we only pull the "path" values). */
function steamLibraryRoots(): string[] {
  const roots = new Set<string>();
  const home = os.homedir();
  const defaults: string[] = [];
  if (process.platform === "win32") {
    defaults.push("C:/Program Files (x86)/Steam", "C:/Program Files/Steam");
    for (const drive of ["C", "D", "E", "F"]) defaults.push(`${drive}:/SteamLibrary`);
  } else if (process.platform === "darwin") {
    defaults.push(path.join(home, "Library", "Application Support", "Steam"));
  } else {
    defaults.push(path.join(home, ".steam", "steam"), path.join(home, ".local", "share", "Steam"));
  }
  for (const d of defaults) roots.add(d);

  for (const steamRoot of defaults) {
    const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
    if (!existsSync(vdf)) continue;
    try {
      for (const m of readFileSync(vdf, "utf8").matchAll(/"path"\s*"([^"]+)"/g)) {
        roots.add(m[1].replace(/\\\\/g, "/"));
      }
    } catch {
      /* unreadable vdf — ignore */
    }
  }
  return [...roots];
}

/** Best-effort auto-detection of AFS4 install dirs that actually contain scenery/xref .tmi files.
 *  Returns unique validated candidates; empty is fine (the wizard offers Browse). */
export function detectInstallDirs(): string[] {
  const found: string[] = [];
  for (const root of steamLibraryRoots()) {
    const candidate = path.join(root, "steamapps", "common", AFS4_INSTALL_LEAF);
    if (resolveXrefDir(candidate) && !found.includes(candidate)) found.push(candidate);
  }
  return found;
}

/** The AFS4 user dir if it exists on disk, else null (the wizard then asks the user to locate it).
 *  `documentsDir` (app.getPath("documents")) makes this OneDrive-safe on Windows. */
export function detectUserDir(documentsDir?: string): string | null {
  const dir = afs4UserDir(documentsDir);
  return existsSync(dir) ? dir : null;
}
