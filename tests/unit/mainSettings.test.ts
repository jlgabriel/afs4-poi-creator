import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultSettings, normalizeUserDir, readSettings, writeSettings } from "../../src/main/settings";

let tmp: string;
let realDir: string; // a directory that actually exists — writeSettings now refuses ones that don't
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-settings-"));
  realDir = path.join(tmp, "Aerofly FS 4");
  mkdirSync(realDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("settings", () => {
  it("defaults are valid (esri tiles, open-meteo elevation, empty recents)", () => {
    const s = defaultSettings();
    expect(s.schemaVersion).toBe(1);
    expect(s.tiles.provider).toBe("esri");
    expect(s.elevation.provider).toBe("open-meteo");
    expect(s.recentProjects).toEqual([]);
    expect(s.lastScanAt).toBeNull();
    expect(s.thumbnailsDir).toBeNull(); // v0.6 object-photo folder — opt-in, no default location
  });
  it("readSettings on an empty dir returns defaults", () => {
    expect(readSettings(tmp).tiles.provider).toBe("esri");
  });
  it("writeSettings persists a patch and reads it back", () => {
    writeSettings(tmp, {
      installDir: realDir,
      tiles: { provider: "custom", customUrl: "https://tiles/{z}/{x}/{y}.png" },
    });
    const s = readSettings(tmp);
    expect(s.installDir).toBe(realDir);
    expect(s.tiles).toEqual({ provider: "custom", customUrl: "https://tiles/{z}/{x}/{y}.png" });
  });
  it("later writes merge over earlier ones", () => {
    const other = path.join(tmp, "other");
    mkdirSync(other);
    writeSettings(tmp, { installDir: realDir });
    writeSettings(tmp, { afs4UserDir: other });
    const s = readSettings(tmp);
    expect(s.installDir).toBe(realDir);
    expect(s.afs4UserDir).toBe(other);
  });
  it("deep-merges nested tiles (a provider-only patch keeps the existing customUrl)", () => {
    writeSettings(tmp, { tiles: { provider: "custom", customUrl: "https://t/{z}/{x}/{y}.png" } });
    writeSettings(tmp, { tiles: { provider: "custom" } }); // partial — no customUrl
    expect(readSettings(tmp).tiles.customUrl).toBe("https://t/{z}/{x}/{y}.png");
  });
  it("writes settings.json atomically (no .pct-tmp scratch left behind)", () => {
    writeSettings(tmp, { installDir: realDir });
    expect(existsSync(path.join(tmp, "settings.json"))).toBe(true);
    expect(existsSync(path.join(tmp, "settings.json.pct-tmp"))).toBe(false);
  });
});

// The user folder is the one CONTAINING scenery/. The old Settings label ("POI install target") invited
// browsing straight to …\scenery\poi, and PCT then installed into …\scenery\poi\scenery\poi\.
describe("normalizeUserDir — undo the scenery/poi mis-nesting", () => {
  it("strips a trailing scenery/poi", () => {
    const base = path.join(tmp, "Aerofly FS 4");
    expect(normalizeUserDir(path.join(base, "scenery", "poi"))).toBe(base);
  });
  it("strips a trailing scenery", () => {
    const base = path.join(tmp, "Aerofly FS 4");
    expect(normalizeUserDir(path.join(base, "scenery"))).toBe(base);
  });
  it("leaves a correct user folder alone", () => {
    expect(normalizeUserDir(realDir)).toBe(realDir);
  });
  it("does not strip a lone 'poi' that isn't under 'scenery'", () => {
    const p = path.join(tmp, "somewhere", "poi");
    expect(normalizeUserDir(p)).toBe(p);
  });
});

// Fable I6: afs4UserDir is renderer-writable over IPC and is the root exportPoi/uninstallPoi create and
// delete folders under. resolvePoiPath bounds WHAT gets written there; this bounds WHERE.
describe("writeSettings — main-side sanity on the directory fields", () => {
  it("corrects a mis-nested user folder instead of persisting it", () => {
    const misNested = path.join(realDir, "scenery", "poi");
    mkdirSync(misNested, { recursive: true });
    const saved = writeSettings(tmp, { afs4UserDir: misNested });
    expect(saved.afs4UserDir).toBe(realDir); // and the CALLER sees the correction, so the UI can show it
  });

  it("refuses a folder that isn't on disk, keeping the previous working value", () => {
    writeSettings(tmp, { afs4UserDir: realDir, installDir: realDir });
    const saved = writeSettings(tmp, {
      afs4UserDir: path.join(tmp, "nope"),
      installDir: path.join(tmp, "also-nope"),
    });
    expect(saved.afs4UserDir).toBe(realDir);
    expect(saved.installDir).toBe(realDir);
  });

  it("only checks fields the patch actually carries — an unrelated patch never clears a path", () => {
    writeSettings(tmp, { afs4UserDir: realDir });
    rmSync(realDir, { recursive: true, force: true }); // e.g. an external drive unplugged
    const saved = writeSettings(tmp, { tiles: { provider: "osm" } });
    expect(saved.afs4UserDir).toBe(realDir); // untouched: the patch said nothing about it
    expect(saved.tiles.provider).toBe("osm");
  });

  // The photo folder (v0.6) is renderer-writable over IPC too, and although it's only ever READ, a path
  // that isn't on disk would make every listThumbnails come back empty for no visible reason.
  it("keeps a real thumbnailsDir, refuses a vanished one, and allows clearing to null", () => {
    expect(writeSettings(tmp, { thumbnailsDir: realDir }).thumbnailsDir).toBe(realDir);
    // A non-existent folder is refused; the previous good value survives.
    expect(writeSettings(tmp, { thumbnailsDir: path.join(tmp, "gone") }).thumbnailsDir).toBe(realDir);
    // null passes through untouched — the user is turning the feature off.
    expect(writeSettings(tmp, { thumbnailsDir: null }).thumbnailsDir).toBeNull();
  });
});
