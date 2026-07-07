// settings.ts — read/write the app's settings.json in Electron userData, validated with the shared
// zod schema (parseSettings). A missing/corrupt file falls back to defaults; patches DEEP-merge the
// known nested objects so a partial patch (e.g. {tiles:{provider:"custom"}}) never drops sibling
// keys like customUrl (Fable review nit). No Electron import — userData + documents dirs are passed
// in (documents lets callers inject app.getPath("documents"), OneDrive-safe per R5) — so it
// unit-tests directly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../core/project/types";
import { parseSettings } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";

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
 *  partial patch keeps its siblings — then validate, persist, and return the saved value. */
export function writeSettings(
  userDataDir: string,
  patch: Partial<Settings>,
  documentsDir?: string,
): Settings {
  const base = readSettings(userDataDir, documentsDir);
  const merged: Settings = {
    ...base,
    ...patch,
    schemaVersion: 1,
    tiles: { ...base.tiles, ...(patch.tiles ?? {}) },
    elevation: { ...base.elevation, ...(patch.elevation ?? {}) },
  };
  const validated = parseSettings(merged);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(settingsFile(userDataDir), JSON.stringify(validated, null, 2), "utf8");
  return validated;
}
