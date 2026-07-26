import { describe, it, expect } from "vitest";
import {
  LIGHT_PHOTO_PREFIX,
  PLANT_PHOTO_PREFIX,
  POINT_LIGHT_PHOTO_KEY,
  photoKey,
  photoKeyForPlaced,
} from "../../src/core/catalog/photoKey";
import type { PlacedObject } from "../../src/core/project/types";
import { isValidThumbName } from "../../src/main/thumbnails";
import { buildPlants } from "../../src/core/catalog/plants";
import path from "node:path";

describe("photoKey — XREF", () => {
  it("is the bare catalog name, so every v0.6/v0.7 photo keeps resolving", () => {
    // The load-bearing property of the whole module: the user's existing screenshots are files on their
    // own disk under `<name>.png`, and v0.8 must not orphan a single one.
    for (const name of ["tower00_small_plates", "UH60_usarmy", "cabin-boat-red", "my.obj-1_v2"]) {
      expect(photoKey({ kind: "xref", name })).toBe(name);
    }
  });
});

describe("photoKey — plants", () => {
  it("turns the group/species pair into a flat, namespaced stem", () => {
    expect(photoKey({ kind: "plant", group: "palm", species: "08" })).toBe("plant.palm.08");
    expect(photoKey({ kind: "plant", group: "broadleaf", species: "00" })).toBe("plant.broadleaf.00");
  });

  it("keeps a group's own underscores (the `/` is the only thing replaced)", () => {
    // "conifer_forest" is why plants.ts splits on the DOUBLE underscore; the photo key must not
    // re-introduce the ambiguity by mangling single ones.
    expect(photoKey({ kind: "plant", group: "conifer_forest", species: "01" })).toBe(
      "plant.conifer_forest.01",
    );
  });

  it("keeps the species' zero padding — `08`, never `8`", () => {
    // `species` is verbatim from the filename and the sim rejects a re-numbered one (plants.ts).
    // A key that normalised it would name the photo after an object that doesn't exist.
    expect(photoKey({ kind: "plant", group: "palm", species: "08" })).not.toBe("plant.palm.8");
  });
});

describe("photoKey — lights", () => {
  it("namespaces an airport-light fixture by its type_name", () => {
    expect(photoKey({ kind: "airport_light", typeName: "runway_edge_light" })).toBe(
      "light.runway_edge_light",
    );
  });

  it("gives the parametric point light a key rather than an exception", () => {
    expect(photoKey({ kind: "light" })).toBe(POINT_LIGHT_PHOTO_KEY);
    expect(POINT_LIGHT_PHOTO_KEY).toBe("light.point");
  });
});

describe("photoKeyForPlaced", () => {
  // The placed list draws the same thumbnail the catalog card does, so the two derivations must agree —
  // a mismatch would show a photo on the card and a glyph on the row for the very same object.
  const base = { id: "x", position: { lon: 0, lat: 0 }, height: { mode: "terrain" } } as const;
  const cases: [PlacedObject, string][] = [
    [{ ...base, kind: "xref", name: "tower00_small_plates", direction: 0 }, "tower00_small_plates"],
    [{ ...base, kind: "plant", group: "palm", species: "08", heightRange: [0, 0] }, "plant.palm.08"],
    [
      {
        ...base,
        kind: "airport_light",
        typeName: "runway_edge_light",
        orientation: 0,
        configuration: "",
        groupIndex: 0,
      },
      "light.runway_edge_light",
    ],
    [
      { ...base, kind: "light", color: [1, 1, 1], intensity: 1, flashing: [0, 0, 0, 0], groupIndex: 0 },
      "light.point",
    ],
  ];

  it.each(cases)("agrees with the catalog-card key for a placed %#", (placed, expected) => {
    expect(photoKeyForPlaced(placed)).toBe(expected);
  });
});

describe("photoKey — the guarantees the folder relies on", () => {
  it("every key is a name main/thumbnails.ts will accept (index, write and delete all guard on it)", () => {
    // A key the guard rejects is a card whose Paste throws and whose photo could never be indexed —
    // silently, which is exactly how #176 presented. Assert the two halves agree.
    const keys = [
      photoKey({ kind: "xref", name: "tower00_small_plates" }),
      photoKey({ kind: "plant", group: "conifer_forest", species: "01" }),
      photoKey({ kind: "airport_light", typeName: "runway_edge_light" }),
      photoKey({ kind: "light" }),
    ];
    for (const k of keys) expect(isValidThumbName(k)).toBe(true);
  });

  it("survives path.basename/extname round-tripping (the dot separator's whole premise)", () => {
    const key = photoKey({ kind: "plant", group: "palm", species: "08" });
    const file = `${key}.png`;
    expect(path.extname(file)).toBe(".png");
    expect(path.basename(file, path.extname(file))).toBe(key);
  });

  it("cannot collide with a built-in XREF name, because a built-in name has no dot", () => {
    // Not "unlikely" — impossible. The sim's own names are [A-Za-z0-9_]; both prefixes end in `.`.
    const builtinShape = /^[A-Za-z0-9_]+$/;
    for (const prefix of [PLANT_PHOTO_PREFIX, LIGHT_PHOTO_PREFIX]) {
      expect(builtinShape.test(`${prefix}.x`)).toBe(false);
    }
  });

  it("is unique across the real 41-plant install list", () => {
    // The install's own filenames, verbatim in shape (plants.ts). If two plants shared a key they would
    // share a photo, and the group with underscores is the case most likely to alias.
    const { plants } = buildPlants([
      { base: "palm__i08__h1250_color" },
      { base: "palm__i11__h0980_color" },
      { base: "broadleaf__i00__h1750_color" },
      { base: "broadleaf__i01__h1650_color" },
      { base: "conifer_forest__i00__h2650_color" },
      { base: "conifer_forest__i01__h2820_color" },
      { base: "shrub__i11__h0080_color" },
    ]);
    const keys = plants.map((p) => photoKey({ kind: "plant", group: p.group, species: p.species }));
    expect(new Set(keys).size).toBe(plants.length);
  });
});
