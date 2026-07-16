import { describe, expect, it } from "vitest";
import { buildCatalogTree, hasCategory } from "../../src/renderer/catalog/catalogTree";
import type { CatalogObject } from "../../src/core/project/types";

const obj = (category: string): CatalogObject => ({
  name: "x",
  bundle: "b",
  source: "install",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size: { x: 1, y: 1, z: 1 },
  category,
  displayName: "X",
  act: true,
});

describe("buildCatalogTree", () => {
  it("returns an empty tree for no objects", () => {
    const tree = buildCatalogTree([]);
    expect(tree.total).toBe(0);
    expect(tree.nodes).toEqual([]);
  });

  it("counts the total across every object", () => {
    const tree = buildCatalogTree([obj("buildings/tower"), obj("jetways"), obj("people")]);
    expect(tree.total).toBe(3);
  });

  it("groups two-level categories under a top node with children + counts", () => {
    const tree = buildCatalogTree([
      obj("buildings/tower"),
      obj("buildings/tower"),
      obj("buildings/office"),
    ]);
    const buildings = tree.nodes.find((n) => n.path === "buildings");
    expect(buildings?.count).toBe(3);
    expect(buildings?.children.map((c) => [c.path, c.count])).toEqual([
      ["buildings/office", 1],
      ["buildings/tower", 2],
    ]);
  });

  it("keeps single-level categories as childless top nodes", () => {
    const tree = buildCatalogTree([obj("jetways"), obj("jetways"), obj("various")]);
    const jetways = tree.nodes.find((n) => n.path === "jetways");
    expect(jetways).toEqual({ path: "jetways", label: "jetways", count: 2, children: [] });
  });

  it("sorts top nodes and children alphabetically by label", () => {
    const tree = buildCatalogTree([
      obj("vehicles/truck"),
      obj("vehicles/cars"),
      obj("buildings/tower"),
      obj("aircraft"),
    ]);
    expect(tree.nodes.map((n) => n.label)).toEqual(["aircraft", "buildings", "vehicles"]);
    const vehicles = tree.nodes.find((n) => n.path === "vehicles");
    expect(vehicles?.children.map((c) => c.label)).toEqual(["cars", "truck"]);
  });
});

// The panel's guard against a selection that outlived its catalog: matchesFilter's category gate is a
// hard reject, so a stale `filter.category` empties the gallery for every search with no visible cause.
describe("hasCategory", () => {
  const tree = buildCatalogTree([obj("buildings/tower"), obj("jetways")]);

  it("finds a top-level node and a sub node", () => {
    expect(hasCategory(tree, "buildings")).toBe(true);
    expect(hasCategory(tree, "buildings/tower")).toBe(true);
    expect(hasCategory(tree, "jetways")).toBe(true);
  });

  it("rejects a category the catalog no longer has", () => {
    expect(hasCategory(tree, "user/xref_air_race_pylons")).toBe(false);
    expect(hasCategory(tree, "buildings/hangar")).toBe(false); // top exists, this leaf doesn't
    expect(hasCategory(buildCatalogTree([]), "buildings")).toBe(false);
  });

  it("is exact, not a prefix — a node is live or it isn't", () => {
    // matchesFilter widens a live node to its subtree; deciding whether the node EXISTS is a
    // different question, and answering it by prefix would keep a deleted leaf alive via its parent.
    expect(hasCategory(tree, "building")).toBe(false);
    expect(hasCategory(tree, "jet")).toBe(false);
  });
});
