import { describe, it, expect } from "vitest";
import { byDisplayName } from "../../src/renderer/catalog/sortObjects";
import type { CatalogObject } from "../../src/core/project/types";

const obj = (
  name: string,
  displayName: string,
  size: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 },
): CatalogObject => ({
  name,
  displayName,
  bundle: "xref_test",
  source: "install",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size,
  category: "other/xref_test",
  act: false,
});

describe("byDisplayName — catalog browse order", () => {
  it("sorts alphabetically by display name", () => {
    const xs = [obj("c", "Cargo"), obj("a", "Apron"), obj("b", "Bridge")];
    expect([...xs].sort(byDisplayName).map((o) => o.displayName)).toEqual(["Apron", "Bridge", "Cargo"]);
  });

  it("breaks display-name ties by object name when size is identical too (stable duplicates)", () => {
    const xs = [obj("z_dup", "Hangar"), obj("a_dup", "Hangar")];
    expect([...xs].sort(byDisplayName).map((o) => o.name)).toEqual(["a_dup", "z_dup"]);
  });

  it("orders same-name variants by size (smallest longest-side first), not by name suffix", () => {
    // The real jetway case: raw name order is _1,_2,_3 but the lengths aren't — sort must read size.
    const xs = [
      obj("Jetway_footway_1", "Jetway Footway", { x: 13.5, y: 1.8, z: 2.5 }),
      obj("Jetway_footway_2", "Jetway Footway", { x: 7.5, y: 1.8, z: 2.5 }),
      obj("Jetway_footway_3", "Jetway Footway", { x: 10.5, y: 1.8, z: 2.5 }),
    ];
    expect([...xs].sort(byDisplayName).map((o) => o.size.x)).toEqual([7.5, 10.5, 13.5]);
  });

  it("orders by size independently of which axis holds the length", () => {
    const xs = [
      obj("b", "Beam", { x: 1.8, y: 12, z: 2.5 }), // length on Y
      obj("a", "Beam", { x: 1.8, y: 7.5, z: 2.5 }),
    ];
    expect([...xs].sort(byDisplayName).map((o) => o.name)).toEqual(["a", "b"]);
  });
});
