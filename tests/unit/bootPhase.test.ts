import { describe, expect, it } from "vitest";
import { decideBootPhase } from "../../src/renderer/app/bootPhase";
import type { Catalog, Settings } from "../../src/core/project/types";

const settings = (over: Partial<Settings> = {}): Settings => ({
  schemaVersion: 1,
  installDir: "/afs4",
  afs4UserDir: "/user",
  thumbnailsDir: null,
  tapDir: null,
  tiles: { provider: "esri" },
  elevation: { provider: "open-meteo" },
  recentProjects: [],
  lastScanAt: null,
  ...over,
});

const catalog = {} as Catalog; // decideBootPhase only tests it for non-null

describe("decideBootPhase", () => {
  it("→ editor when a catalog is cached AND an install dir is known", () => {
    expect(decideBootPhase(settings(), catalog)).toBe("editor");
  });

  it("→ wizard when nothing is cached", () => {
    expect(decideBootPhase(settings(), null)).toBe("wizard");
  });

  it("→ wizard when the install dir is unknown and the catalog expects one", () => {
    const scanned = { installDir: "/afs4" } as Catalog;
    expect(decideBootPhase(settings({ installDir: null }), scanned)).toBe("wizard");
  });

  it("→ editor when the catalog was scanned without an install", () => {
    const without = { installDir: null } as Catalog;
    expect(decideBootPhase(settings({ installDir: null }), without)).toBe("editor");
  });

  it("→ editor when an install was set after scanning without one", () => {
    const without = { installDir: null } as Catalog;
    expect(decideBootPhase(settings(), without)).toBe("editor");
  });
});
