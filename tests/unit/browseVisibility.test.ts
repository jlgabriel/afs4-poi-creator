import { describe, it, expect } from "vitest";
import { isBrowsable } from "../../src/renderer/catalog/browseVisibility";
import type { CatalogObject } from "../../src/core/project/types";

const obj = (name: string, category: string): CatalogObject => ({
  name,
  displayName: "X",
  bundle: "b",
  source: "install",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size: { x: 1, y: 1, z: 1 },
  category,
  act: false,
});

describe("isBrowsable — CatalogPanel display filter", () => {
  it("keeps the 20 horizontal Jetway Footway pieces", () => {
    expect(isBrowsable(obj("Jetway_footway_1", "jetways"))).toBe(true);
    expect(isBrowsable(obj("Jetway_footway_20", "jetways"))).toBe(true);
  });

  it("hides loose flexible-jetway parts (other Jetway_*, PBridge*, PBrucke*)", () => {
    expect(isBrowsable(obj("Jetway_tunnel_3", "jetways"))).toBe(false);
    expect(isBrowsable(obj("PBridge_01", "jetways"))).toBe(false);
    expect(isBrowsable(obj("PBrucke_A", "jetways"))).toBe(false);
  });

  it("is case-insensitive on the footway family", () => {
    expect(isBrowsable(obj("JETWAY_FOOTWAY_5", "jetways"))).toBe(true);
  });

  it("keeps a hypothetical future footway DLC piece (keyed on name, not curation)", () => {
    expect(isBrowsable(obj("Jetway_footway_21", "jetways"))).toBe(true);
  });

  it("never hides anything outside the jetways category", () => {
    // Same-looking prefix but a different category must not be touched.
    expect(isBrowsable(obj("PBridge_thing", "buildings/office"))).toBe(true);
    expect(isBrowsable(obj("tower00_small", "buildings/tower"))).toBe(true);
  });
});
