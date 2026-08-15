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
  addAirportParking,
  moveAirportParking,
  removeAirportParking,
  rotateAirportParking,
  setAirportParkingName,
  setAirportParkingSize,
  setAirportParkingType,
  addAirportRunway,
  moveAirportRunwayEnd,
  removeAirportRunway,
  setAirportRunwayWidth,
  updateAirportRunwayEnd,
  addAirportAerotow,
  addAirportWinch,
  removeAirportAerotow,
  removeAirportWinch,
  updateAirportAerotow,
  updateAirportWinch,
} from "../../src/core/project/mutate";
import {
  aerotowsOf,
  airportPosition,
  parkingsOf,
  runwaysOf,
  winchesOf,
} from "../../src/core/project/airport";
import type {
  AirportPad,
  ParkingType,
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

  // ── Runways (v1.4, forum #217 submenu (4)) ─────────────────────────────────────────────────────
  describe("runways", () => {
    const A = { lon: -70.58515, lat: -33.38115 };
    const B = { lon: -70.57934, lat: -33.38024 };
    const withRunway = (): Project =>
      addAirportRunway(setAirport(baseProject(), AIRPORT, NOW), A, B, { identifiers: ["08", "26"], id: "rwy-1" }, LATER);

    it("creates a pair with ONE point per end and no lights", () => {
      const r = runwaysOf(withRunway().airport)[0]!;
      expect(r.id).toBe("rwy-1");
      expect(r.width).toBe(40); // every runway in his reference airports
      expect(r.ends).toHaveLength(2);
      // ★ forum #236: "in the PCT the leading variable is [threshold]" — the document has no `endpoint`,
      // because PCT draws no pavement and an extension it cannot show is a field nobody can judge.
      expect(r.ends[0]).toEqual({
        threshold: A,
        identifier: "08",
        appltsys: "none",
        papi: "none",
        reil: "none",
        approach: true,
        takeoff: true,
      });
      expect(r.ends[0]).not.toHaveProperty("endpoint");
      expect(r.ends[1]!.identifier).toBe("26");
    });

    it("drags one end and leaves the other alone", () => {
      const moved = moveAirportRunwayEnd(withRunway(), "rwy-1", 0, { lon: -70.586, lat: -33.3815 }, LATER);
      const [a, b] = runwaysOf(moved.airport)[0]!.ends;
      expect(a.threshold).toEqual({ lon: -70.586, lat: -33.3815 });
      expect(b.threshold).toEqual(B);
    });

    it("patches one end's identifier, lights and usability without touching the other", () => {
      const p = updateAirportRunwayEnd(
        withRunway(),
        "rwy-1",
        0,
        { appltsys: "alsf-2", papi: "both", reil: "omni", takeoff: false, identifier: "08L" },
        LATER,
      );
      const [a, b] = runwaysOf(p.airport)[0]!.ends;
      expect(a).toMatchObject({ appltsys: "alsf-2", papi: "both", reil: "omni", takeoff: false, identifier: "08L" });
      expect(b).toMatchObject({ appltsys: "none", papi: "none", reil: "none", takeoff: true, identifier: "26" });
      // A patch that changes nothing keeps the reference, like every other mutation here.
      expect(updateAirportRunwayEnd(p, "rwy-1", 0, { papi: "both" }, LATER)).toBe(p);
      expect(updateAirportRunwayEnd(p, "rwy-1", 0, {}, LATER)).toBe(p);
    });

    it("widens, removes, and stays out of the way when there is nothing to touch", () => {
      const p = withRunway();
      expect(runwaysOf(setAirportRunwayWidth(p, "rwy-1", 18, LATER).airport)[0]!.width).toBe(18);
      expect(setAirportRunwayWidth(p, "rwy-1", 0, LATER)).toBe(p); // refused, not clamped
      expect(setAirportRunwayWidth(p, "rwy-1", 40, LATER)).toBe(p); // already 40
      expect(runwaysOf(removeAirportRunway(p, "rwy-1", LATER).airport)).toEqual([]);
      expect(removeAirportRunway(p, "nope")).toBe(p);
      const empty = baseProject();
      expect(setAirportRunwayWidth(empty, "rwy-1", 18)).toBe(empty);
      expect(moveAirportRunwayEnd(empty, "rwy-1", 0, A)).toBe(empty);
    });

    it("creates the airport block from a placement, and leaves the pad mirror alone", () => {
      const fresh = addAirportRunway(baseProject(), A, B, { id: "rwy-1" }, LATER);
      expect(fresh.airport).toMatchObject({ icao: "", name: "", country: "", pads: [] });
      expect(runwaysOf(fresh.airport)).toHaveLength(1);
      expect(withRunway().airport!.pad).toEqual(PAD);
    });
  });

  // ── Glider starts (v1.4, forum #237/#238) ──────────────────────────────────────────────────────
  describe("glider starts", () => {
    const G = { lon: -70.57713, lat: -33.3800929 };
    const W = { lon: -70.58609, lat: -33.3811 };
    const withBoth = (): Project => {
      const p = setAirport(baseProject(), AIRPORT, NOW);
      return addAirportWinch(addAirportAerotow(p, G, LATER, "ato-1"), G, W, LATER, "wnc-1");
    };

    it("adds an aerotow facing north and a winch at his default spacing", () => {
      const p = withBoth();
      expect(aerotowsOf(p.airport)).toEqual([{ id: "ato-1", name: "", position: G, heading: 0 }]);
      expect(winchesOf(p.airport)).toEqual([
        { id: "wnc-1", name: "", position: G, winch: W, spacing: 25 },
      ]);
    });

    it("names them and turns the aerotow, normalising the heading", () => {
      let p = updateAirportAerotow(withBoth(), "ato-1", { name: "26", heading: -100 }, LATER);
      expect(aerotowsOf(p.airport)[0]).toMatchObject({ name: "26", heading: 260 });
      p = updateAirportWinch(p, "wnc-1", { name: "26", spacing: 18 }, LATER);
      expect(winchesOf(p.airport)[0]).toMatchObject({ name: "26", spacing: 18 });
      // A non-positive spacing is refused rather than clamped, like every other metre value.
      expect(updateAirportWinch(p, "wnc-1", { spacing: 0 }, LATER)).toBe(p);
      // …and a patch that changes nothing keeps the reference.
      expect(updateAirportAerotow(p, "ato-1", { name: "26" }, LATER)).toBe(p);
      expect(updateAirportWinch(p, "wnc-1", { name: "26" }, LATER)).toBe(p);
    });

    it("moves the WINCH end without moving the glider — they are two independent points", () => {
      const far = { lon: -70.595, lat: -33.3825 };
      const p = updateAirportWinch(withBoth(), "wnc-1", { winch: far }, LATER);
      expect(winchesOf(p.airport)[0]!.winch).toEqual(far);
      expect(winchesOf(p.airport)[0]!.position).toEqual(G);
    });

    it("removes by id, and does nothing to a project with no airport", () => {
      const p = withBoth();
      expect(aerotowsOf(removeAirportAerotow(p, "ato-1", LATER).airport)).toEqual([]);
      expect(winchesOf(removeAirportWinch(p, "wnc-1", LATER).airport)).toEqual([]);
      expect(removeAirportAerotow(p, "nope")).toBe(p);
      const empty = baseProject();
      expect(updateAirportAerotow(empty, "ato-1", { name: "x" })).toBe(empty);
      expect(removeAirportWinch(empty, "wnc-1")).toBe(empty);
    });

    it("creates the airport block from a placement, and leaves the pad mirror alone", () => {
      const fresh = addAirportWinch(baseProject(), G, W, LATER, "wnc-1");
      expect(fresh.airport).toMatchObject({ icao: "", name: "", country: "", pads: [] });
      expect(winchesOf(fresh.airport)).toHaveLength(1);
      expect(withBoth().airport!.pad).toEqual(PAD);
    });
  });

  // ── Parking positions (v1.4, forum #232) ───────────────────────────────────────────────────────
  describe("parking positions", () => {
    const HERE = { lon: -70.5842423, lat: -33.3806032 };
    const withStand = (type: ParkingType = "parked_ga"): Project =>
      addAirportParking(setAirport(baseProject(), AIRPORT, NOW), HERE, type, LATER, "prk-1");

    it("appends, and sizes the stand from its type", () => {
      const p = withStand();
      expect(parkingsOf(p.airport)).toEqual([
        { id: "prk-1", name: "", position: HERE, heading: 0, size: 7.5, type: "parked_ga" },
      ]);
      // His margin note: parked_ga = 7.5 m, parked_jet = 40 m.
      expect(parkingsOf(withStand("parked_jet").airport)[0]!.size).toBe(40);
      // Appends rather than replaces — "any number of parking positions can be created".
      const two = addAirportParking(p, { lon: 1, lat: 2 }, "pushback", LATER, "prk-2");
      expect(parkingsOf(two.airport).map((s) => s.id)).toEqual(["prk-1", "prk-2"]);
    });

    it("creates the airport block from a placement, but still invents no identity", () => {
      const p = addAirportParking(baseProject(), HERE, "parked_ga", LATER, "prk-1");
      expect(p.airport).toEqual({
        icao: "",
        name: "",
        country: "",
        pads: [],
        // The first element SEEDS the airport's own point (#255). Identity is still not invented —
        // a coordinate is where the thing is, a code is a claim about the world.
        position: HERE,
        parkings: [{ id: "prk-1", name: "", position: HERE, heading: 0, size: 7.5, type: "parked_ga" }],
      });
    });

    it("moves, turns, resizes and names one stand by id", () => {
      let p = withStand();
      p = moveAirportParking(p, "prk-1", { lon: 1, lat: 2 }, LATER);
      p = rotateAirportParking(p, "prk-1", -195, LATER); // his own files carry negative headings
      p = setAirportParkingSize(p, "prk-1", 12, LATER);
      p = setAirportParkingName(p, "prk-1", "Parking_W", LATER);
      expect(parkingsOf(p.airport)[0]).toEqual({
        id: "prk-1",
        name: "Parking_W",
        position: { lon: 1, lat: 2 },
        heading: 165, // normalised into [0,360); -195 + 360. Same rotation, readable number.
        size: 12,
        type: "parked_ga",
      });
      // A non-positive size is refused, not clamped — it comes from a number field.
      expect(setAirportParkingSize(p, "prk-1", 0, LATER)).toBe(p);
      expect(setAirportParkingSize(p, "prk-1", -3, LATER)).toBe(p);
    });

    it("moves the size with the type ONLY while the user has not chosen one", () => {
      const p = withStand();
      expect(parkingsOf(setAirportParkingType(p, "prk-1", "parked_jet", LATER).airport)[0]!.size).toBe(40);
      // A size someone typed is theirs and survives the switch.
      const sized = setAirportParkingSize(p, "prk-1", 12, LATER);
      const switched = setAirportParkingType(sized, "prk-1", "parked_jet", LATER);
      expect(parkingsOf(switched.airport)[0]!.size).toBe(12);
      expect(parkingsOf(switched.airport)[0]!.type).toBe("parked_jet");
    });

    it("removes by id, and an empty list is not the same as no airport", () => {
      const p = removeAirportParking(withStand(), "prk-1", LATER);
      expect(parkingsOf(p.airport)).toEqual([]);
      expect(p.airport).toBeDefined(); // the airport survives losing its last stand
      expect(removeAirportParking(p, "nope")).toBe(p);
    });

    it("does nothing to a project with no airport, and no-ops keep the undo stack clean", () => {
      const empty = baseProject();
      expect(moveAirportParking(empty, "prk-1", { lon: 1, lat: 2 })).toBe(empty);
      expect(rotateAirportParking(empty, "prk-1", 90)).toBe(empty);
      const p = withStand();
      expect(moveAirportParking(p, "missing", { lon: 1, lat: 2 })).toBe(p);
      expect(rotateAirportParking(p, "prk-1", 0)).toBe(p);
      expect(setAirportParkingName(p, "prk-1", "")).toBe(p);
      expect(setAirportParkingType(p, "prk-1", "parked_ga")).toBe(p);
    });

    it("leaves the pad mirror alone — stands are not mirrored and must not disturb it", () => {
      const p = withStand();
      expect(p.airport!.pad).toEqual(PAD);
    });
  });
});

// ── The airport's own point: SEEDED once, then FROZEN (forum #255) ──────────────────────────────────
//
// His third reason is the behavioural one and the only one a test can hold: "the airfield coordinates
// must not change if any other element changes coordinates." Everything below is that sentence.
describe("the airport's own point", () => {
  const A = { lon: -70.58, lat: -33.38 };
  const B = { lon: -70.59, lat: -33.39 };

  it("is seeded by whichever element is placed first — all five kinds seed it", () => {
    expect(addAirportPad(baseProject(), A, 10, LATER, "p1").airport!.position).toEqual(A);
    expect(addAirportParking(baseProject(), A, "parked_ga", LATER, "s1").airport!.position).toEqual(A);
    expect(addAirportAerotow(baseProject(), A, LATER, "t1").airport!.position).toEqual(A);
    // The two-point elements seed from the end the CLICK put down, not from the far end the app invented.
    expect(addAirportWinch(baseProject(), A, B, LATER, "w1").airport!.position).toEqual(A);
    expect(addAirportRunway(baseProject(), A, B, { id: "r1" }, LATER).airport!.position).toEqual(A);
  });

  it("is NOT re-seeded by the second element, of any kind", () => {
    let p = addAirportPad(baseProject(), A, 10, LATER, "p1");
    p = addAirportPad(p, B, 10, LATER, "p2");
    p = addAirportParking(p, B, "parked_ga", LATER, "s1");
    p = addAirportRunway(p, B, A, { id: "r1" }, LATER);
    expect(p.airport!.position).toEqual(A);
  });

  it("★ does not move when the pad it was seeded from moves — the whole point of #255", () => {
    let p = addAirportPad(baseProject(), A, 10, LATER, "p1");
    p = moveAirportPad(p, B, LATER, "p1");
    expect(p.airport!.pads[0]!.position).toEqual(B); // the pad went
    expect(p.airport!.position).toEqual(A); // the airport stayed
  });

  it("★ does not move when the pad it was seeded from is DELETED", () => {
    // The nastier half of the old behaviour: with the fallback, deleting pad 1 teleported the airport to
    // whichever pad happened to become first, and nothing on screen said so.
    let p = addAirportPad(baseProject(), A, 10, LATER, "p1");
    p = addAirportPad(p, B, 10, LATER, "p2");
    p = removeAirportPad(p, "p1", LATER);
    expect(p.airport!.pads).toHaveLength(1);
    expect(p.airport!.position).toEqual(A);
  });

  it("moves when the USER moves it, and can be cleared back to following", () => {
    let p = addAirportPad(baseProject(), A, 10, LATER, "p1");
    p = setAirportPosition(p, B, LATER);
    expect(p.airport!.position).toEqual(B);
    p = setAirportPosition(p, null, LATER);
    expect(p.airport!.position).toBeUndefined();
    // Cleared, it falls back to the first pad again — the pre-1.5 behaviour, still reachable.
    expect(airportPosition(p.airport!)).toEqual(A);
  });

  it("stays absent on an identity-only airport, which has nothing to be seeded from", () => {
    const p = setAirport(baseProject(), { icao: "sclc", name: "V", country: "cl", pads: [] }, LATER);
    expect(p.airport!.position).toBeUndefined();
    expect(airportPosition(p.airport!)).toBeNull();
  });
});
