import { describe, expect, it } from "vitest";
import { matchesFilter } from "../../src/renderer/catalog/catalogFilter";
import type { CatalogObject } from "../../src/core/project/types";
import type { Filter } from "../../src/renderer/state/store";

const obj = (over: Partial<CatalogObject> = {}): CatalogObject => ({
  name: "tower00_small_plates",
  bundle: "xref_buildings",
  source: "install",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size: { x: 1, y: 1, z: 1 },
  category: "buildings/tower",
  displayName: "Tower00 Small Plates",
  act: true,
  ...over,
});

const filter = (over: Partial<Filter> = {}): Filter => ({ query: "", category: null, ...over });

describe("matchesFilter", () => {
  it("matches everything when the query is empty and no category is set", () => {
    expect(matchesFilter(obj(), filter())).toBe(true);
  });

  it("does case-insensitive substring across displayName / name / category", () => {
    expect(matchesFilter(obj(), filter({ query: "small" }))).toBe(true); // displayName
    expect(matchesFilter(obj(), filter({ query: "TOWER00_SMALL" }))).toBe(true); // raw name
    expect(matchesFilter(obj(), filter({ query: "buildings" }))).toBe(true); // category
    expect(matchesFilter(obj(), filter({ query: "hangar" }))).toBe(false);
  });

  it("gates on the category when one is set", () => {
    expect(matchesFilter(obj(), filter({ category: "buildings/tower" }))).toBe(true);
    expect(matchesFilter(obj(), filter({ category: "airport/hangar" }))).toBe(false);
  });

  it("treats a top-level category as a whole-segment prefix over its sub-categories", () => {
    // obj() is buildings/tower
    expect(matchesFilter(obj(), filter({ category: "buildings" }))).toBe(true);
    expect(matchesFilter(obj({ category: "buildings/office" }), filter({ category: "buildings" }))).toBe(true);
    // a single-level category still matches exactly
    expect(matchesFilter(obj({ category: "jetways" }), filter({ category: "jetways" }))).toBe(true);
    // prefix is by whole segment, not a bare substring
    expect(matchesFilter(obj(), filter({ category: "build" }))).toBe(false);
  });
});
