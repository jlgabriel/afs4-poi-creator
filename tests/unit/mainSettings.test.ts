import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultSettings, readSettings, writeSettings } from "../../src/main/settings";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-settings-"));
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
  });
  it("readSettings on an empty dir returns defaults", () => {
    expect(readSettings(tmp).tiles.provider).toBe("esri");
  });
  it("writeSettings persists a patch and reads it back", () => {
    writeSettings(tmp, {
      installDir: "X:/AFS4",
      tiles: { provider: "custom", customUrl: "https://tiles/{z}/{x}/{y}.png" },
    });
    const s = readSettings(tmp);
    expect(s.installDir).toBe("X:/AFS4");
    expect(s.tiles).toEqual({ provider: "custom", customUrl: "https://tiles/{z}/{x}/{y}.png" });
  });
  it("later writes merge over earlier ones", () => {
    writeSettings(tmp, { installDir: "A" });
    writeSettings(tmp, { afs4UserDir: "B" });
    const s = readSettings(tmp);
    expect(s.installDir).toBe("A");
    expect(s.afs4UserDir).toBe("B");
  });
  it("deep-merges nested tiles (a provider-only patch keeps the existing customUrl)", () => {
    writeSettings(tmp, { tiles: { provider: "custom", customUrl: "https://t/{z}/{x}/{y}.png" } });
    writeSettings(tmp, { tiles: { provider: "custom" } }); // partial — no customUrl
    expect(readSettings(tmp).tiles.customUrl).toBe("https://t/{z}/{x}/{y}.png");
  });
});
