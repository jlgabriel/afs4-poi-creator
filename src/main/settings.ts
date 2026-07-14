// settings.ts — read/write the app's settings.json in Electron userData, validated with the shared
// zod schema (parseSettings). A missing/corrupt file falls back to defaults; patches DEEP-merge the
// known nested objects so a partial patch (e.g. {tiles:{provider:"custom"}}) never drops sibling
// keys like customUrl (Fable review nit). No Electron import — userData + documents dirs are passed
// in (documents lets callers inject app.getPath("documents"), OneDrive-safe per R5) — so it
// unit-tests directly.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../core/project/types";
import { parseSettings } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";
import { writeFileAtomic } from "./fsAtomic";

/** Fresh settings with auto-detected paths pre-filled. `documentsDir` (app.getPath("documents"))
 *  makes the user-dir guess OneDrive-safe on Windows. */
export function defaultSettings(documentsDir?: string): Settings {
  const installs = detectInstallDirs();
  return {
    schemaVersion: 1,
    installDir: installs[0] ?? null,
    afs4UserDir: detectUserDir(documentsDir),
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
}

/** The AFS4 *user folder* is the one that CONTAINS `scenery/` — e.g. `Documents\Aerofly FS 4`. PCT then
 *  installs into `<it>/scenery/poi/`. Settings used to label the field "(POI install target)", which
 *  invites browsing straight to `…\scenery\poi` — and PCT then wrote into `…\scenery\poi\scenery\poi\`
 *  (PCT's own author did exactly this). The mis-nesting is unambiguous, so CORRECT it instead of failing
 *  on it: strip a trailing `scenery` or `scenery/poi`. Pure; case-insensitive, since Windows is. */
export function normalizeUserDir(dir: string): string {
  const d = path.resolve(dir);
  const parent = path.dirname(d);
  if (path.basename(d).toLowerCase() === "poi" && path.basename(parent).toLowerCase() === "scenery") {
    return path.dirname(parent);
  }
  if (path.basename(d).toLowerCase() === "scenery") return parent;
  return d;
}

/** Main-side sanity on the two directory fields before either becomes a write root (Fable I6). The
 *  renderer can send any string over IPC and `afs4UserDir` is where exportPoi/uninstallPoi create and
 *  delete folders; `resolvePoiPath` already bounds WHAT is written under it, this bounds WHERE.
 *
 *  A folder that isn't on disk is REFUSED — the previous, working value survives rather than being
 *  replaced by a path nothing can be written to. Only fields actually PRESENT in the patch are checked,
 *  so an unrelated patch (a tile provider, say) can never null out a path just because an external drive
 *  happens to be unplugged. Nothing legitimate is ever refused: both auto-detectors already return only
 *  existing dirs (detectUserDir/detectInstallDirs) and the native picker cannot return a folder that
 *  isn't there. */
function sanitizeDirs(patch: Partial<Settings>, base: Settings): Partial<Settings> {
  const out: Partial<Settings> = { ...patch };
  if (typeof out.afs4UserDir === "string") {
    const dir = normalizeUserDir(out.afs4UserDir);
    out.afs4UserDir = existsSync(dir) ? dir : base.afs4UserDir;
  }
  if (typeof out.installDir === "string" && !existsSync(out.installDir)) {
    out.installDir = base.installDir;
  }
  return out;
}

const settingsFile = (userDataDir: string): string => path.join(userDataDir, "settings.json");

export function readSettings(userDataDir: string, documentsDir?: string): Settings {
  const file = settingsFile(userDataDir);
  if (existsSync(file)) {
    try {
      return parseSettings(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      /* corrupt/old settings → fall back to defaults */
    }
  }
  return defaultSettings(documentsDir);
}

/** Merge `patch` over current settings — DEEP for the known nested objects (tiles/elevation) so a
 *  partial patch keeps its siblings, and sanity-checked for the two directory fields (sanitizeDirs) —
 *  then validate, persist, and return the SAVED value. The caller gets back what actually landed, which
 *  is how the Settings dialog can show a corrected path rather than closing on one the user never saw. */
export function writeSettings(
  userDataDir: string,
  patch: Partial<Settings>,
  documentsDir?: string,
): Settings {
  const base = readSettings(userDataDir, documentsDir);
  const merged: Settings = {
    ...base,
    ...sanitizeDirs(patch, base),
    schemaVersion: 1,
    tiles: { ...base.tiles, ...(patch.tiles ?? {}) },
    elevation: { ...base.elevation, ...(patch.elevation ?? {}) },
  };
  const validated = parseSettings(merged);
  writeFileAtomic(settingsFile(userDataDir), JSON.stringify(validated, null, 2));
  return validated;
}
