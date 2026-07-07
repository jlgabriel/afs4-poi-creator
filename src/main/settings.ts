// settings.ts — read/write the app's settings.json in Electron userData, validated with the
// shared zod schema (parseSettings). A missing or corrupt file falls back to defaults rather than
// crashing the app. No Electron import (userData dir passed in) so it unit-tests directly.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../core/project/types";
import { parseSettings } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";

/** Fresh settings with auto-detected paths pre-filled (first item wins; both may be null/empty). */
export function defaultSettings(): Settings {
  const installs = detectInstallDirs();
  return {
    schemaVersion: 1,
    installDir: installs[0] ?? null,
    afs4UserDir: detectUserDir(),
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
}

const settingsFile = (userDataDir: string): string => path.join(userDataDir, "settings.json");

export function readSettings(userDataDir: string): Settings {
  const file = settingsFile(userDataDir);
  if (existsSync(file)) {
    try {
      return parseSettings(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      /* corrupt/old settings → fall back to defaults */
    }
  }
  return defaultSettings();
}

/** Merge `patch` over current settings, validate, persist, and return the saved value. */
export function writeSettings(userDataDir: string, patch: Partial<Settings>): Settings {
  const merged: Settings = { ...readSettings(userDataDir), ...patch, schemaVersion: 1 };
  const validated = parseSettings(merged);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(settingsFile(userDataDir), JSON.stringify(validated, null, 2), "utf8");
  return validated;
}
