import { describe, expect, it } from "vitest";
import type {
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  PlacedAirportLight,
  PlacedLight,
  PlacedPlant,
  PlacedXref,
} from "../../src/core/project/types";
import { diffEntry, isMissing } from "../../src/renderer/map/syncDiff";
import { rowInfo } from "../../src/renderer/placed/rowInfo";

const obj = (id = "a"): PlacedXref => ({
  id,
  kind: "xref",
  name: "tower",
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  direction: 0,
  scale: 1,
});

const light = (typeName: string): PlacedAirportLight => ({
  id: "l",
  kind: "airport_light",
  typeName,
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  orientation: 0,
  configuration: "",
  groupIndex: 0,
});

const point = (): PlacedLight => ({
  id: "p",
  kind: "light",
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  color: [1, 1, 1],
  intensity: 1000,
  flashing: [0, 0, 0, 0],
  groupIndex: 0,
});

const plant = (group: string, species: string): PlacedPlant => ({
  id: "t",
  kind: "plant",
  group,
  species,
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  heightRange: [17.5, 17.5],
});

const CAT = { name: "tower", category: "buildings/tower", displayName: "Tower" } as CatalogObject;
const FIX = { typeName: "papi_3_light", category: "lights/papi", displayName: "Papi 3" } as CatalogAirportLight;
const PLANT = {
  group: "broadleaf",
  species: "00",
  naturalHeight: 17.5,
  category: "plants/broadleaf",
  displayName: "Broadleaf 00",
} as CatalogPlant;
const XREFS = new Map<string, CatalogObject>([["tower", CAT]]);
const FIXTURES = new Map<string, CatalogAirportLight>([["papi_3_light", FIX]]);
const PLANTS = new Map<string, CatalogPlant>([["broadleaf/00", PLANT]]);

// The P1-5 reference-diff contract: mutate.ts keeps untouched objects at the same reference, so the
// layer can skip them and only rebuild what actually changed.
describe("diffEntry — the O(changed) sync decision", () => {
  it("rebuilds when there is no previous entry", () => {
    expect(diffEntry(undefined, obj(), false)).toBe("rebuild");
  });

  it("skips when both the object reference and selection are unchanged", () => {
    const o = obj();
    expect(diffEntry({ obj: o, selected: false }, o, false)).toBe("skip");
    expect(diffEntry({ obj: o, selected: true }, o, true)).toBe("skip");
  });

  it("restyles when only the selection flag changed (same object reference)", () => {
    const o = obj();
    expect(diffEntry({ obj: o, selected: false }, o, true)).toBe("restyle");
    expect(diffEntry({ obj: o, selected: true }, o, false)).toBe("restyle");
  });

  it("rebuilds when the object reference changed (a geometry edit)", () => {
    // same id, different reference — what mutate.moveObject/rotateObject/scaleObject produce
    expect(diffEntry({ obj: obj(), selected: false }, obj(), false)).toBe("rebuild");
    expect(diffEntry({ obj: obj(), selected: true }, obj(), true)).toBe("rebuild");
  });

  it("rebuilds an otherwise-unchanged object when the catalog index changed (a Rescan) — Fable I3", () => {
    const o = obj();
    // same reference + same selection, but the catalog was swapped → its bbox/missing state may differ
    expect(diffEntry({ obj: o, selected: false }, o, false, true)).toBe("rebuild");
    expect(diffEntry({ obj: o, selected: true }, o, true, true)).toBe("rebuild");
    // and it still skips when the index did NOT change (the common, hot path)
    expect(diffEntry({ obj: o, selected: false }, o, false, false)).toBe("skip");
  });
});

// A missing object is not an error — the sim skips an unknown name and keeps parsing (gate V6) — but it
// renders as NOTHING, so every surface that lists objects has to say so.
describe("isMissing — does this object name something the install doesn't have", () => {
  it("flags an xref that is not in the catalog", () => {
    expect(isMissing(obj(), XREFS, FIXTURES, PLANTS)).toBe(false);
    expect(isMissing({ ...obj(), name: "no_such_object" }, XREFS, FIXTURES, PLANTS)).toBe(true);
  });

  it("flags an airport light whose fixture was not scanned (a project shared from another install)", () => {
    expect(isMissing(light("papi_3_light"), XREFS, FIXTURES, PLANTS)).toBe(false);
    expect(isMissing(light("no_such_fixture"), XREFS, FIXTURES, PLANTS)).toBe(true);
  });

  it("flags a plant on EITHER half of its group/species pair", () => {
    // A plant is the only kind whose identity is two fields, so it has two ways to dangle. A real
    // species under the wrong group ("palm/00" — palm starts at 08) resolves to nothing in-sim and
    // must not read as fine just because both halves exist SOMEWHERE.
    expect(isMissing(plant("broadleaf", "00"), XREFS, FIXTURES, PLANTS)).toBe(false);
    expect(isMissing(plant("broadleaf", "99"), XREFS, FIXTURES, PLANTS)).toBe(true);
    expect(isMissing(plant("palm", "00"), XREFS, FIXTURES, PLANTS)).toBe(true);
  });

  it("never flags a parametric point light — its parameters ARE the light, it names nothing", () => {
    expect(isMissing(point(), XREFS, FIXTURES, PLANTS)).toBe(false);
    expect(isMissing(point(), new Map(), new Map(), new Map())).toBe(false);
  });

  it("flags everything nameable when the catalog is empty (the pre-scan / stale-cache boot)", () => {
    expect(isMissing(obj(), new Map(), new Map(), new Map())).toBe(true);
    expect(isMissing(light("papi_3_light"), new Map(), new Map(), new Map())).toBe(true);
    // The v0.3→v0.4 upgrade boot: a cached catalog carries `plants: []`, so every plant reads missing
    // until a Rescan. Red-dashed is the honest state — the app can't know the install has them yet.
    expect(isMissing(plant("broadleaf", "00"), XREFS, FIXTURES, new Map())).toBe(true);
  });
});

describe("rowInfo — the placed-list row, per kind", () => {
  it("resolves a known xref, fixture and plant, none missing", () => {
    expect(rowInfo(obj(), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "buildings/tower",
      name: "Tower",
      missing: false,
    });
    expect(rowInfo(light("papi_3_light"), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "lights/papi",
      name: "Papi 3",
      missing: false,
    });
    expect(rowInfo(plant("broadleaf", "00"), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "plants/broadleaf",
      name: "Broadleaf 00",
      missing: false,
    });
  });

  it("falls back to the raw name and flags missing when the catalog doesn't have it", () => {
    expect(rowInfo({ ...obj(), name: "gone" }, XREFS, FIXTURES, PLANTS)).toEqual({
      category: "various",
      name: "gone",
      missing: true,
    });
    expect(rowInfo(light("gone"), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "lights/other",
      name: "gone",
      missing: true,
    });
    // The plant's fallback is the raw PAIR: that's the string the user needs in order to see which
    // half is wrong, and a prettified guess would hide it.
    expect(rowInfo(plant("palm", "99"), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "plants/other",
      name: "palm/99",
      missing: true,
    });
  });

  it("prefers the user's label over the catalog display name, and never flags a point light", () => {
    expect(rowInfo({ ...obj(), label: "my tower" }, XREFS, FIXTURES, PLANTS).name).toBe("my tower");
    expect(rowInfo({ ...plant("broadleaf", "00"), label: "oak" }, XREFS, FIXTURES, PLANTS).name).toBe("oak");
    expect(rowInfo(point(), XREFS, FIXTURES, PLANTS)).toEqual({
      category: "lights/point",
      name: "Point light",
      missing: false,
    });
  });
});
