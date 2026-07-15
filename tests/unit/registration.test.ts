import { describe, it, expect } from "vitest";
import { unregisteredPlacedNames } from "../../src/renderer/catalog/registration";
import type { CatalogObject, PlacedObject } from "../../src/core/project/types";

const xref = (id: string, name: string): PlacedObject => ({
  id,
  kind: "xref",
  name,
  position: { lon: 0, lat: 0 },
  height: { mode: "terrain" },
  direction: 0,
  scale: 1,
});
const light = (id: string): PlacedObject => ({
  id,
  kind: "light",
  position: { lon: 0, lat: 0 },
  height: { mode: "terrain" },
  color: [1, 1, 1],
  intensity: 100,
  flashing: [0, 0, 0, 0],
  groupIndex: 0,
});
const cat = (name: string, extra: Partial<CatalogObject> = {}): CatalogObject => ({
  name,
  bundle: name,
  source: "user",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size: { x: 1, y: 1, z: 1 },
  category: `user/${name}`,
  displayName: name,
  act: false,
  ...extra,
});

describe("unregisteredPlacedNames", () => {
  it("returns the unique names of placed xref that map to an unregistered catalog entry", () => {
    const index = new Map<string, CatalogObject>([
      ["reg_obj", cat("reg_obj")],
      ["loose_obj", cat("loose_obj", { unregistered: true })],
    ]);
    const objects = [xref("1", "reg_obj"), xref("2", "loose_obj"), xref("3", "loose_obj")];
    expect(unregisteredPlacedNames(objects, index)).toEqual(["loose_obj"]);
  });

  it("ignores non-xref placed objects and names absent from the catalog", () => {
    const index = new Map<string, CatalogObject>([["loose_obj", cat("loose_obj", { unregistered: true })]]);
    expect(unregisteredPlacedNames([light("1"), xref("2", "not_in_catalog")], index)).toEqual([]);
  });

  it("returns [] when nothing placed is unregistered", () => {
    const index = new Map<string, CatalogObject>([["reg_obj", cat("reg_obj")]]);
    expect(unregisteredPlacedNames([xref("1", "reg_obj")], index)).toEqual([]);
  });
});
