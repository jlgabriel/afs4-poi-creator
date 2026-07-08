import { describe, expect, it } from "vitest";
import { decideBootPhase } from "../../src/renderer/app/bootPhase";
import type { Catalog, Settings } from "../../src/core/project/types";

const settings = (over: Partial<Settings> = {}): Settings => ({
  schemaVersion: 1,
  installDir: "/afs4",
  afs4UserDir: "/user",
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

  it("→ wizard when the install dir is unknown (never scanned)", () => {
    expect(decideBootPhase(settings({ installDir: null }), catalog)).toBe("wizard");
  });
});
