import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readSettings, writeSettings } from "../../src/main/settings";

let tmp: string;
let realDir: string; // writeSettings now refuses a directory that isn't on disk (Fable I6)
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-set-"));
  realDir = path.join(tmp, "install");
  mkdirSync(realDir, { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("settings read/write", () => {
  it("round-trips a written value", () => {
    writeSettings(tmp, { installDir: realDir, elevation: { provider: "none" } });
    const s = readSettings(tmp);
    expect(s.installDir).toBe(realDir);
    expect(s.elevation.provider).toBe("none");
  });

  it("DEEP-merges tiles — flipping the provider keeps a previously-saved custom URL/attribution", () => {
    writeSettings(tmp, {
      tiles: { provider: "custom", customUrl: "https://t/{z}/{x}/{y}.png", customAttribution: "me" },
    });
    const s = writeSettings(tmp, { tiles: { provider: "esri" } }); // partial patch
    expect(s.tiles.provider).toBe("esri");
    expect(s.tiles.customUrl).toBe("https://t/{z}/{x}/{y}.png");
    expect(s.tiles.customAttribution).toBe("me");
  });

  it("a missing settings file falls back to defaults (tiles=esri, elevation=open-meteo)", () => {
    const s = readSettings(tmp);
    expect(s.tiles.provider).toBe("esri");
    expect(s.elevation.provider).toBe("open-meteo");
  });
});
