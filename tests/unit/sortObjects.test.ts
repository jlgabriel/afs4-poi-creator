import { describe, it, expect } from "vitest";
import { byDisplayName } from "../../src/renderer/catalog/sortObjects";
import type { CatalogObject } from "../../src/core/project/types";

const obj = (name: string, displayName: string): CatalogObject => ({
  name,
  displayName,
  bundle: "xref_test",
  source: "install",
  bbMin: [0, 0, 0],
  bbMax: [1, 1, 1],
  bsRadius: 1,
  size: { x: 1, y: 1, z: 1 },
  category: "other/xref_test",
  act: false,
});

describe("byDisplayName — catalog browse order", () => {
  it("sorts alphabetically by display name", () => {
    const xs = [obj("c", "Cargo"), obj("a", "Apron"), obj("b", "Bridge")];
    expect([...xs].sort(byDisplayName).map((o) => o.displayName)).toEqual(["Apron", "Bridge", "Cargo"]);
  });

  it("breaks display-name ties by object name (deterministic, stable-friendly)", () => {
    const xs = [obj("z_dup", "Hangar"), obj("a_dup", "Hangar")];
    expect([...xs].sort(byDisplayName).map((o) => o.name)).toEqual(["a_dup", "z_dup"]);
  });
});
