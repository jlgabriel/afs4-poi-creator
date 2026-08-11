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
  setAirport,
  setAirportIata,
  setAirportPadName,
  setAirportPadRadius,
  setAirportPosition,
  setLocked,
  setPoiName,
  setReference,
  addAirportPad,
  moveAirportPad,
  placeAirportPad,
  removeAirportPad,
  rotateAirportPad,
} from "../../src/core/project/mutate";
import type {
  AirportPad,
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedXref,
  Project,
  ProjectAirport,
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

// ── The airport block (v1.2, forum #170 / #168) ──────────────────────────────────────────────────
describe("the airport block", () => {
  const PAD: AirportPad = {
    id: "pad-1",
    name: "",
    position: { lon: -70.3130659, lat: -18.4827329 },
    heading: 90,
    radius: 10,
  };
  const AIRPORT: ProjectAirport = {
    icao: "shjl",
    name: "Arica Regional Hospital",
    country: "cl",
    pads: [PAD],
  };
  /** What every writer must actually produce: the block plus its compatibility mirror. */
  const MIRRORED: ProjectAirport = { ...AIRPORT, pad: PAD };
  const padOf = (p: Project): AirportPad => p.airport!.pads[0]!;

  it("is set, and absent means POI-only", () => {
    const p0 = baseProject();
    expect(p0.airport).toBeUndefined();
    const p1 = setAirport(p0, AIRPORT, LATER);
    expect(p1.airport).toEqual(MIRRORED);
    expect(p1.modifiedAt).toBe(LATER);
    expect(p0.airport).toBeUndefined(); // input untouched

    // Clearing REMOVES the key, so a project that ends without an airport is byte-identical to one that
    // never had one — the same absent-means-default rule shift and heightMode follow.
    const p2 = setAirport(p1, null, LATER);
    expect("airport" in p2).toBe(false);
    expect(setAirport(p0, null)).toBe(p0); // no-op keeps the undo stack clean
  });

  it("moves and turns the pad, normalising the heading", () => {
    const p = setAirport(baseProject(), AIRPORT, NOW);
    const at = { lon: 5, lat: 45 };
    expect(padOf(moveAirportPad(p, at, LATER)).position).toEqual(at);
    expect(padOf(rotateAirportPad(p, 450, LATER)).heading).toBe(90); // 450 → 90
    expect(padOf(rotateAirportPad(p, -10, LATER)).heading).toBe(350);
    // The identity rides along untouched — a map drag must never be able to clobber a typed code.
    expect(moveAirportPad(p, at, LATER).airport!.icao).toBe("shjl");
  });

  it("resizes the pad, and refuses a radius that is not a positive number", () => {
    const p = setAirport(baseProject(), AIRPORT, NOW);
    expect(padOf(setAirportPadRadius(p, 25, LATER)).radius).toBe(25);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(setAirportPadRadius(p, bad)).toBe(p); // refused, not clamped — see the doc comment
    }
  });

  // ★ The mirror is what lets PCT <= 1.3 OPEN a v1.4 file at all (types.ts ProjectAirport.pad), and a
  // stale one would put its helipad where the user no longer has it. So it is not enough that setAirport
  // writes it — EVERY pad mutation has to keep it in step.
  it("keeps airport.pad mirroring pads[0] through every mutation", () => {
    let p = setAirport(baseProject(), AIRPORT, NOW);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);

    p = moveAirportPad(p, { lon: 5, lat: 45 }, LATER);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);
    p = rotateAirportPad(p, 123, LATER);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);
    p = setAirportPadRadius(p, 25, LATER);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);
    p = setAirportPadName(p, "FATO/TLOF", LATER);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);

    // A SECOND pad must not disturb the mirror: an older PCT still sees the first one.
    const first = p.airport!.pads[0];
    p = addAirportPad(p, { lon: 6, lat: 46 }, 12, LATER, "pad-2");
    expect(p.airport!.pads).toHaveLength(2);
    expect(p.airport!.pad).toEqual(first);

    // Dropping the first promotes the second INTO the mirror…
    p = removeAirportPad(p, "pad-1", LATER);
    expect(p.airport!.pads).toHaveLength(1);
    expect(p.airport!.pad).toEqual(p.airport!.pads[0]);
    expect(p.airport!.pad!.id).toBe("pad-2");

    // …and dropping the last removes the key rather than leaving a pad an older PCT would still draw.
    p = removeAirportPad(p, "pad-2", LATER);
    expect(p.airport!.pads).toEqual([]);
    expect("pad" in p.airport!).toBe(false);
  });

  it("targets a pad by id, and the first one when no id is given", () => {
    let p = setAirport(baseProject(), AIRPORT, NOW);
    p = addAirportPad(p, { lon: 6, lat: 46 }, 12, LATER, "pad-2");

    // No id → the first pad, which is what every v1.3 caller means.
    p = setAirportPadName(p, "primary", LATER);
    expect(p.airport!.pads[0]!.name).toBe("primary");
    expect(p.airport!.pads[1]!.name).toBe("");

    p = setAirportPadName(p, "secondary", LATER, "pad-2");
    expect(p.airport!.pads[0]!.name).toBe("primary");
    expect(p.airport!.pads[1]!.name).toBe("secondary");

    // An id nothing matches is a no-op, not a write to pad 0.
    expect(setAirportPadName(p, "ghost", LATER, "nope")).toBe(p);
  });

  it("adds pads rather than moving the first one, and keeps a pad-less airport valid", () => {
    // placeAirportPad MOVES (the v1.3 gesture: one pad card, click again to reposition)…
    let p = setAirport(baseProject(), AIRPORT, NOW);
    p = placeAirportPad(p, { lon: 1, lat: 2 }, 10, LATER);
    expect(p.airport!.pads).toHaveLength(1);
    expect(padOf(p).position).toEqual({ lon: 1, lat: 2 });

    // …addAirportPad APPENDS (forum #221: "can now be used as often as desired").
    p = addAirportPad(p, { lon: 3, lat: 4 }, 10, LATER, "pad-2");
    expect(p.airport!.pads).toHaveLength(2);

    // An airport with no pads is legal — his "(1) DATA" example is exactly that — so removing them all
    // leaves the identity standing rather than deleting the airport.
    p = removeAirportPad(removeAirportPad(p, "pad-1", LATER), "pad-2", LATER);
    expect(p.airport!.icao).toBe("shjl");
    expect(p.airport!.pads).toEqual([]);
    // …and placing again onto that empty airport adds one instead of no-oping.
    p = placeAirportPad(p, { lon: 7, lat: 8 }, 10, LATER);
    expect(p.airport!.pads).toHaveLength(1);
  });

  it("carries the v1.4 identity fields", () => {
    let p = setAirport(baseProject(), AIRPORT, NOW);
    p = setAirportIata(p, "CLC", LATER);
    expect(p.airport!.iata).toBe("CLC");
    expect(setAirportIata(p, "CLC", LATER)).toBe(p); // no-op keeps the undo stack clean
    p = setAirportIata(p, "", LATER);
    expect("iata" in p.airport!).toBe(false); // cleared, not left as ""

    // The airport's own point is independent of the pad (forum #15/#220) — moving the pad must not move
    // it once it has been set on purpose.
    p = setAirportPosition(p, { lon: 10, lat: 20 }, LATER);
    p = moveAirportPad(p, { lon: 30, lat: 40 }, LATER);
    expect(p.airport!.position).toEqual({ lon: 10, lat: 20 });
    // Cleared → the block follows the first pad again, which is how v1.2/v1.3 behaved.
    p = setAirportPosition(p, null, LATER);
    expect("position" in p.airport!).toBe(false);
  });

  it("does nothing at all to a project with no airport", () => {
    // A drag on a map with no pad must not INVENT one: PCT never picks an identity, and a pad conjured
    // from a gesture would be an airport nobody asked for.
    const p = baseProject();
    expect(moveAirportPad(p, { lon: 1, lat: 2 })).toBe(p);
    expect(rotateAirportPad(p, 90)).toBe(p);
    expect(setAirportPadRadius(p, 20)).toBe(p);
  });

  it("returns the same reference when nothing actually changes", () => {
    const p = setAirport(baseProject(), AIRPORT, NOW);
    expect(rotateAirportPad(p, 90)).toBe(p);
    expect(setAirportPadRadius(p, 10)).toBe(p);
  });
});
