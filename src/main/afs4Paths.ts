// afs4Paths.ts — main-process filesystem helpers for locating an AFS4 install and user dir.
// Ports the proven CLI logic (cli/scan.ts / cli/export.ts) and adds Steam auto-detection. No
// Electron import (pure node fs) so it unit-tests directly; the UI always lets the user Browse to
// override anything auto-detection misses (e.g. Windows Documents→OneDrive redirection, R5).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Recursively collect every .tmi file under `root` (unreadable dirs are skipped, not fatal). */
export function findTmi(root: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) findTmi(full, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".tmi")) out.push(full);
  }
  return out;
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
