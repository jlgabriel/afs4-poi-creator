import { describe, expect, it } from "vitest";
import {
  EMPTY_FOOTPRINTS,
  applyFootprintOverrides,
  catalogBox,
  countFootprints,
  mergeFootprints,
  overrideToBox,
  setFootprint,
  type FootprintOverrides,
} from "../../src/core/catalog/footprints";
import { parseFootprints, MAX_FOOTPRINT_M } from "../../src/core/project/schemas";
import type { Catalog, CatalogObject } from "../../src/core/project/types";

const xref = (name: string, over: Partial<CatalogObject> = {}): CatalogObject => ({
  name,
  bundle: "xref_buildings",
  source: "install",
  bbMin: [-1, -2, 0],
  bbMax: [1, 2, 3],
  bsRadius: 3,
  size: { x: 2, y: 4, z: 3 },
  category: "buildings/tower",
  displayName: name,
  act: true,
  ...over,
});

const catalog = (): Catalog => ({
  schemaVersion: 1,
  scannedAt: "2026-07-27T00:00:00Z",
  installDir: "C:/AFS4",
  userXrefDir: null,
  bundles: [],
  xref: [xref("tower"), xref("opaque_thing", { sizeUnknown: true, bbMin: [0, 0, 0], bbMax: [0, 0, 0], size: { x: 0, y: 0, z: 0 } })],
  plants: [
    {
      group: "palm",
      species: "08",
      naturalHeight: 12,
      source: "install",
      category: "plants/palm",
      displayName: "Palm 08",
    },
  ],
  airportLights: [
    {
      typeName: "runway_approach_light_center_2",
      folder: "al_runway_approach_light_center_2",
      source: "install",
      category: "lights/approach",
      displayName: "Runway Approach Light Center 2",
    },
  ],
  animated: [],
});

const withEntries = (entries: FootprintOverrides["entries"]): FootprintOverrides => ({
  schemaVersion: 1,
  entries,
});

// ApfelFlieger's own reading of a Runway Approach Light Center 2 (forum #129): 2 lights, 2.0 × 0.5 × 4.0.
const CENTER_2 = { width: 2, depth: 0.5, height: 4 };

describe("overrideToBox — three typed numbers → a model-local bbox", () => {
  it("centres the box in x/y and stands it on the origin in z", () => {
    expect(overrideToBox(CENTER_2)).toEqual({
      bbMin: [-1, -0.25, 0],
      bbMax: [1, 0.25, 4],
      size: { x: 2, y: 0.5, z: 4 },
      bsRadius: Math.hypot(2, 0.5, 4) / 2,
    });
  });

  it("accepts a flat object (height 0) — a marking still has a ground footprint", () => {
    const box = overrideToBox({ width: 6, depth: 6, height: 0 });
    expect(box.bbMin).toEqual([-3, -3, 0]);
    expect(box.bbMax).toEqual([3, 3, 0]);
  });

  it("rounds the displayed size to centimetres without touching the box itself", () => {
    const box = overrideToBox({ width: 1.2345, depth: 1, height: 1 });
    expect(box.size.x).toBe(1.23); // same round2 buildCatalog applies to a scanned size
    expect(box.bbMax[0]).toBe(0.61725); // the geometry keeps full precision
  });
});

describe("applyFootprintOverrides — the scan, then the user on top of it", () => {
  it("returns the SAME catalog reference when there is nothing to apply", () => {
    const c = catalog();
    expect(applyFootprintOverrides(c, EMPTY_FOOTPRINTS)).toBe(c);
  });

  it("gives an airport light a box it never had — the whole point of the feature", () => {
    const c = applyFootprintOverrides(
      catalog(),
      withEntries({ "light.runway_approach_light_center_2": CENTER_2 }),
    );
    const light = c.airportLights[0];
    expect(catalogBox(light)).toEqual({ bbMin: [-1, -0.25, 0], bbMax: [1, 0.25, 4] });
    expect(light.size).toEqual({ x: 2, y: 0.5, z: 4 });
    expect(light.footprintSource).toBe("user");
    // A light has never had a bounding-sphere radius and doesn't gain one here.
    expect("bsRadius" in light).toBe(false);
  });

  it("keys plants by the dotted pair, not by plantKey's slash", () => {
    const c = applyFootprintOverrides(catalog(), withEntries({ "plant.palm.08": { width: 4, depth: 4, height: 12 } }));
    expect(catalogBox(c.plants[0])).toEqual({ bbMin: [-2, -2, 0], bbMax: [2, 2, 12] });
    // the slash spelling is NOT a key — it can't be, a file name can't hold one
    expect(applyFootprintOverrides(catalog(), withEntries({ "palm/08": { width: 4, depth: 4, height: 12 } })).plants[0].size).toBeUndefined();
  });

  it("replaces a scanned XREF box, bsRadius included, and leaves its siblings alone", () => {
    const c = applyFootprintOverrides(catalog(), withEntries({ tower: { width: 10, depth: 20, height: 30 } }));
    const tower = c.xref[0];
    expect(tower.bbMin).toEqual([-5, -10, 0]);
    expect(tower.size).toEqual({ x: 10, y: 20, z: 30 });
    expect(tower.bsRadius).toBeCloseTo(Math.hypot(10, 20, 30) / 2, 9);
    expect(tower.displayName).toBe("tower"); // untouched
    expect(c.xref[1]).toEqual(catalog().xref[1]); // the object with no override is not rewritten
  });

  it("clears sizeUnknown on an opaque user .tmb — a measurement IS the missing knowledge", () => {
    const c = applyFootprintOverrides(catalog(), withEntries({ opaque_thing: { width: 3, depth: 3, height: 3 } }));
    expect(c.xref[1].sizeUnknown).toBeUndefined();
    expect(c.xref[1].size).toEqual({ x: 3, y: 3, z: 3 });
  });

  it("keeps a key that names nothing here — an imported file is written for someone else's install", () => {
    const c = catalog();
    const fp = withEntries({ not_in_this_install: CENTER_2 });
    // nothing matched → the catalog comes back untouched, and the entry survives in the file
    expect(applyFootprintOverrides(c, fp)).toBe(c);
    expect(countFootprints(fp)).toBe(1);
  });

  it("survives a pre-v0.4 cached catalog with no plants key", () => {
    const old = { ...catalog(), plants: undefined } as unknown as Catalog;
    const c = applyFootprintOverrides(old, withEntries({ tower: CENTER_2 }));
    expect(c.plants).toEqual([]);
  });
});

describe("setFootprint / mergeFootprints — editing and sharing the set", () => {
  it("adds, replaces and clears one entry without touching the others", () => {
    const one = setFootprint(EMPTY_FOOTPRINTS, "light.a", CENTER_2);
    const two = setFootprint(one, "light.b", { width: 1, depth: 1, height: 1 });
    expect(countFootprints(two)).toBe(2);
    const cleared = setFootprint(two, "light.a", null);
    expect(cleared.entries["light.a"]).toBeUndefined();
    expect(cleared.entries["light.b"]).toEqual({ width: 1, depth: 1, height: 1 });
    // clearing something that isn't there writes nothing at all
    expect(setFootprint(cleared, "light.a", null)).toBe(cleared);
  });

  it("counts what an import ADDED apart from what it REDEFINED", () => {
    const mine = withEntries({ "light.a": CENTER_2, "light.b": CENTER_2 });
    const theirs = withEntries({ "light.b": { width: 9, depth: 9, height: 9 }, "light.c": CENTER_2 });
    const { merged, added, updated } = mergeFootprints(mine, theirs);
    expect({ added, updated }).toEqual({ added: 1, updated: 1 });
    expect(merged.entries["light.b"].width).toBe(9); // the file the user asked for wins…
    expect(merged.entries["light.a"]).toEqual(CENTER_2); // …but only where it says something
    expect(countFootprints(merged)).toBe(3);
  });
});

describe("parseFootprints — the file is untrusted the moment it can be imported", () => {
  it("accepts a well-formed set", () => {
    const fp = withEntries({ "light.x": { ...CENTER_2, note: "measured against a 1 m cube" } });
    expect(parseFootprints(JSON.parse(JSON.stringify(fp)))).toEqual(fp);
  });

  it("rejects a key that can name no card", () => {
    expect(() => parseFootprints({ schemaVersion: 1, entries: { "../escape": CENTER_2 } })).toThrow();
    expect(() => parseFootprints({ schemaVersion: 1, entries: { ".hidden": CENTER_2 } })).toThrow();
  });

  it("rejects a zero/negative width and a slipped decimal", () => {
    expect(() => parseFootprints({ schemaVersion: 1, entries: { a: { width: 0, depth: 1, height: 1 } } })).toThrow();
    expect(() => parseFootprints({ schemaVersion: 1, entries: { a: { width: -2, depth: 1, height: 1 } } })).toThrow();
    expect(() =>
      parseFootprints({ schemaVersion: 1, entries: { a: { width: MAX_FOOTPRINT_M + 1, depth: 1, height: 1 } } }),
    ).toThrow();
  });

  it("rejects a version it cannot read, rather than half-applying it", () => {
    expect(() => parseFootprints({ schemaVersion: 2, entries: {} })).toThrow();
  });
});

describe("catalogBox — one answer to 'does this thing have a footprint'", () => {
  it("is null for an unmeasured light/plant and for an entry that isn't there", () => {
    expect(catalogBox(undefined)).toBeNull();
    expect(catalogBox(catalog().airportLights[0])).toBeNull();
    expect(catalogBox(catalog().plants[0])).toBeNull();
  });

  it("is the box for any entry that has one", () => {
    expect(catalogBox(xref("tower"))).toEqual({ bbMin: [-1, -2, 0], bbMax: [1, 2, 3] });
  });
});
