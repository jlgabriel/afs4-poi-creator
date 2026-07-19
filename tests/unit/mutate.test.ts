import { describe, it, expect } from "vitest";
import {
  addObject,
  createAirportLight,
  createLight,
  createProject,
  createXref,
  duplicateObject,
  moveObject,
  removeObject,
  renameProject,
  rotateObject,
  SCALE_MIN,
  scaleObject,
  setAirportLightType,
  setCamera,
  setConfiguration,
  setFlashing,
  setGroupIndex,
  setHeight,
  setHeightMode,
  setIntensity,
  setLabel,
  setLightColor,
  setLocked,
  setPoiName,
  setReference,
} from "../../src/core/project/mutate";
import type {
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedXref,
  Project,
} from "../../src/core/project/types";

const CAMERA = { lon: 11.86, lat: 48.37, zoom: 15 };
const NOW = "2026-07-07T00:00:00.000Z";
const LATER = "2026-07-07T01:00:00.000Z";

function baseProject(objects: PlacedObject[] = []): Project {
  return { ...createProject({ name: "t", camera: CAMERA, now: NOW }), objects };
}
const xref = (id: string, over: Partial<PlacedXref> = {}) =>
  createXref("tower_x", { lon: 11.86, lat: 48.37 }, { id, ...over });

describe("createXref", () => {
  it("applies M1 defaults", () => {
    const x = xref("a");
    expect(x).toMatchObject({
      id: "a",
      kind: "xref",
      name: "tower_x",
      direction: 0,
      scale: 1,
      height: { mode: "terrain" },
    });
    expect(x.label).toBeUndefined();
    expect(x.locked).toBeUndefined();
  });
  it("normalises direction and honours overrides", () => {
    expect(xref("a", { direction: -90 }).direction).toBe(270);
    expect(xref("a", { direction: 370 }).direction).toBe(10);
    expect(xref("a", { scale: 2, locked: true, label: "hi" })).toMatchObject({
      scale: 2,
      locked: true,
      label: "hi",
    });
  });
  it("mints a unique uuid when no id is given", () => {
    const a = createXref("n", { lon: 0, lat: 0 });
    const b = createXref("n", { lon: 0, lat: 0 });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("object mutations are pure & immutable", () => {
  it("addObject appends without touching the input", () => {
    const p0 = baseProject();
    const p1 = addObject(p0, xref("a"), LATER);
    expect(p0.objects).toHaveLength(0); // input untouched
    expect(p1.objects).toHaveLength(1);
    expect(p1.modifiedAt).toBe(LATER);
    expect(p1).not.toBe(p0);
  });
  it("removeObject drops by id; a missing id is a no-op (same reference)", () => {
    const p0 = baseProject([xref("a"), xref("b")]);
    expect(removeObject(p0, "a", LATER).objects.map((o) => o.id)).toEqual(["b"]);
    expect(removeObject(p0, "zzz", LATER)).toBe(p0);
  });
  it("moveObject / rotateObject / scaleObject / setHeight update only the target", () => {
    const p0 = baseProject([xref("a"), xref("b")]);
    const moved = moveObject(p0, "a", { lon: 1, lat: 2 }, LATER);
    expect(moved.objects[0].position).toEqual({ lon: 1, lat: 2 });
    expect(moved.objects[1]).toBe(p0.objects[1]); // sibling kept by reference
    expect(p0.objects[0].position).toEqual({ lon: 11.86, lat: 48.37 }); // input untouched

    expect((rotateObject(p0, "a", -45, LATER).objects[0] as PlacedXref).direction).toBe(315); // normalised
    expect((scaleObject(p0, "a", 2.5, LATER).objects[0] as PlacedXref).scale).toBe(2.5);
    expect(setHeight(p0, "a", { mode: "asl", value: 520 }, LATER).objects[0].height).toEqual({
      mode: "asl",
      value: 520,
    });
  });
  it("a missing id is a no-op for targeted mutations", () => {
    const p0 = baseProject([xref("a")]);
    expect(moveObject(p0, "zzz", { lon: 1, lat: 1 }, LATER)).toBe(p0);
  });
  it("setLabel / setLocked set and clear their optional fields", () => {
    const p0 = baseProject([xref("a")]);
    const labelled = setLabel(p0, "a", "gate 3", LATER);
    expect(labelled.objects[0].label).toBe("gate 3");
    expect(setLabel(labelled, "a", "", LATER).objects[0].label).toBeUndefined();

    const locked = setLocked(p0, "a", true, LATER);
    expect(locked.objects[0].locked).toBe(true);
    expect(setLocked(locked, "a", false, LATER).objects[0].locked).toBeUndefined();
  });
  it("duplicateObject copies with a fresh id, appended", () => {
    const p0 = baseProject([xref("a", { scale: 3 })]);
    const dup = duplicateObject(p0, "a", { id: "a2" }, LATER);
    expect(dup.objects).toHaveLength(2);
    expect(dup.objects[1]).toMatchObject({ id: "a2", scale: 3, name: "tower_x" });
    expect(duplicateObject(p0, "zzz")).toBe(p0);
  });
});

describe("v0.2 light factories", () => {
  it("createAirportLight applies defaults (terrain, orientation 0, default colour, group 0)", () => {
    const l = createAirportLight("runway_edge_light", { lon: 11, lat: 48 }, { id: "al" });
    expect(l).toMatchObject({
      id: "al",
      kind: "airport_light",
      typeName: "runway_edge_light",
      orientation: 0,
      configuration: "",
      groupIndex: 0,
      height: { mode: "terrain" },
    });
  });
  it("createAirportLight normalises orientation and honours overrides", () => {
    expect(createAirportLight("x", { lon: 0, lat: 0 }, { orientation: -90 }).orientation).toBe(270);
    expect(
      createAirportLight("x", { lon: 0, lat: 0 }, { configuration: "wr", groupIndex: 3 }),
    ).toMatchObject({ configuration: "wr", groupIndex: 3 });
  });
  it("createLight defaults to steady white, mid intensity, lifted +3 m off terrain", () => {
    const l = createLight({ lon: 11, lat: 48 }, { id: "pl" });
    expect(l).toMatchObject({
      id: "pl",
      kind: "light",
      color: [1, 1, 1],
      intensity: 1000,
      flashing: [0, 0, 0, 0],
      groupIndex: 0,
      height: { mode: "terrain-offset", offset: 3 },
    });
  });
});

describe("v0.2 kind-aware mutations", () => {
  const airport = (id: string, over: Partial<PlacedAirportLight> = {}): PlacedAirportLight =>
    createAirportLight("runway_edge_light", { lon: 11, lat: 48 }, { id, ...over });
  const point = (id: string, over: Partial<PlacedLight> = {}): PlacedLight =>
    createLight({ lon: 11, lat: 48 }, { id, ...over });

  it("rotateObject drives orientation for airport_light and is a no-op for a point light", () => {
    const p0 = baseProject([airport("a"), point("b")]);
    const rotated = rotateObject(p0, "a", -45, LATER);
    expect((rotated.objects[0] as PlacedAirportLight).orientation).toBe(315); // normalised
    // a point light has no rotation → same reference, no modifiedAt bump
    expect(rotateObject(p0, "b", 90, LATER)).toBe(p0);
  });

  it("scaleObject is a no-op for lights (no scale field)", () => {
    const p0 = baseProject([airport("a")]);
    expect(scaleObject(p0, "a", 2, LATER)).toBe(p0);
  });

  // tocWriter emits scale_factor with 4 decimals, so 0.00004 serialized to the literal "0" — a project
  // that loads fine but exports an object scaled to nothing. Clamp the DATA, so the Inspector shows what
  // actually gets written.
  it("scaleObject clamps a scale too small to survive the .toc's 4 decimals", () => {
    const p0 = baseProject([xref("a")]);
    expect((scaleObject(p0, "a", 0.00004, LATER).objects[0] as PlacedXref).scale).toBe(SCALE_MIN);
    expect((scaleObject(p0, "a", 0, LATER).objects[0] as PlacedXref).scale).toBe(SCALE_MIN);
    expect((scaleObject(p0, "a", -3, LATER).objects[0] as PlacedXref).scale).toBe(SCALE_MIN);
    // and a normal scale is untouched
    expect((scaleObject(p0, "a", 0.5, LATER).objects[0] as PlacedXref).scale).toBe(0.5);
  });

  it("light setters update only the matching kind, and no-op on the wrong kind", () => {
    const p0 = baseProject([airport("a"), point("b")]);
    expect((setConfiguration(p0, "a", "gy", LATER).objects[0] as PlacedAirportLight).configuration).toBe("gy");
    expect((setAirportLightType(p0, "a", "papi_3_light", LATER).objects[0] as PlacedAirportLight).typeName).toBe("papi_3_light");
    expect((setLightColor(p0, "b", [1, 0, 0], LATER).objects[1] as PlacedLight).color).toEqual([1, 0, 0]);
    expect((setIntensity(p0, "b", 50000, LATER).objects[1] as PlacedLight).intensity).toBe(50000);
    expect((setFlashing(p0, "b", [1, 0, 3, 0], LATER).objects[1] as PlacedLight).flashing).toEqual([1, 0, 3, 0]);
    // group_index is carried by both light kinds
    expect((setGroupIndex(p0, "a", 3, LATER).objects[0] as PlacedAirportLight).groupIndex).toBe(3);
    expect((setGroupIndex(p0, "b", 2, LATER).objects[1] as PlacedLight).groupIndex).toBe(2);
    // wrong-kind setters are no-ops (same project reference)
    expect(setConfiguration(p0, "b", "r", LATER)).toBe(p0); // b is a point light
    expect(setLightColor(p0, "a", [0, 1, 0], LATER)).toBe(p0); // a is an airport light
  });
});

describe("project-level mutations", () => {
  it("setReference / renameProject / setPoiName / setCamera", () => {
    const p0 = baseProject();
    expect(setReference(p0, { lon: 1, lat: 2 }, LATER).reference).toEqual({ lon: 1, lat: 2 });
    expect(setReference(p0, null, LATER).reference).toBeNull();
    expect(renameProject(p0, "New", LATER).name).toBe("New");
    expect(setPoiName(p0, "munich_test", LATER).poiName).toBe("munich_test");
    expect(setCamera(p0, { lon: 9, lat: 9, zoom: 3 }, LATER).camera).toEqual({
      lon: 9,
      lat: 9,
      zoom: 3,
    });
    expect(p0.name).toBe("t"); // input untouched
  });
  it("createProject yields M1 defaults", () => {
    const p = createProject({ name: "Munich", poiName: "munich", camera: CAMERA, now: NOW });
    expect(p).toMatchObject({
      schemaVersion: 1,
      app: "pct",
      name: "Munich",
      poiName: "munich",
      reference: null,
      objects: [],
    });
    expect(p.createdAt).toBe(NOW);
    expect(p.modifiedAt).toBe(NOW);
  });

  it("setHeightMode stores autoheight, normalises the default to ABSENT, and no-ops on the current mode", () => {
    const p0 = baseProject();
    expect(p0.heightMode).toBeUndefined();

    const ah = setHeightMode(p0, "autoheight", LATER);
    expect(ah.heightMode).toBe("autoheight");
    expect(ah.modifiedAt).toBe(LATER);

    // Back to the default REMOVES the field — a project that ends on baked-asl is byte-identical to one
    // that never touched the toggle (same rule as setShift's zero), so the goldens don't move.
    const back = setHeightMode(ah, "baked-asl", LATER);
    expect("heightMode" in back).toBe(false);

    // No-op: setting the mode it already has returns the SAME reference, keeping the undo stack clean.
    expect(setHeightMode(p0, "baked-asl")).toBe(p0);
    expect(setHeightMode(ah, "autoheight")).toBe(ah);
    expect(p0.heightMode).toBeUndefined(); // input untouched
  });
});
