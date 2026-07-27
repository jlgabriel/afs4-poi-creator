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
import {
  PLACEHOLDER_BOX,
  boxDirection,
  boxFor,
  extentOf,
  orientationOf,
  scaleOf,
  type Box,
} from "../../src/renderer/map/footprintBox";
import { footprintCorners } from "../../src/core/geo/footprint";
import { directionToHeading } from "../../src/core/geo/orientation";
import { initialBearing } from "../../src/core/geo/geo";

const AT = { lon: 10, lat: 48 };

const xrefAt = (direction = 0, scale = 1): PlacedXref => ({
  id: "x",
  kind: "xref",
  name: "tower",
  position: AT,
  height: { mode: "terrain" },
  direction,
  scale,
});
const lightAt = (orientation = 0, typeName = "approach_2"): PlacedAirportLight => ({
  id: "l",
  kind: "airport_light",
  typeName,
  position: AT,
  height: { mode: "terrain" },
  orientation,
  configuration: "",
  groupIndex: 0,
});
const plantAt = (): PlacedPlant => ({
  id: "t",
  kind: "plant",
  group: "palm",
  species: "08",
  position: AT,
  height: { mode: "terrain" },
  heightRange: [12, 12],
});
const pointAt = (): PlacedLight => ({
  id: "p",
  kind: "light",
  position: AT,
  height: { mode: "terrain" },
  color: [1, 1, 1],
  intensity: 1000,
  flashing: [0, 0, 0, 0],
  groupIndex: 0,
});

const BOX: Box = { bbMin: [-1, -0.25, 0], bbMax: [1, 0.25, 4] };
const XREFS = new Map<string, CatalogObject>([
  ["tower", { name: "tower", bbMin: [-1, -2, 0], bbMax: [1, 2, 3] } as CatalogObject],
]);
const MEASURED_LIGHTS = new Map<string, CatalogAirportLight>([
  ["approach_2", { typeName: "approach_2", ...BOX } as CatalogAirportLight],
]);
const BARE_LIGHTS = new Map<string, CatalogAirportLight>([
  ["approach_2", { typeName: "approach_2" } as CatalogAirportLight],
]);
const PLANTS = new Map<string, CatalogPlant>([
  ["palm/08", { group: "palm", species: "08" } as CatalogPlant],
]);

describe("boxFor — the v0.9 shape decision: a box, not a kind", () => {
  it("draws an unmeasured light and plant as points, exactly as before v0.9", () => {
    expect(boxFor(lightAt(), XREFS, BARE_LIGHTS, PLANTS)).toBeNull();
    expect(boxFor(plantAt(), XREFS, BARE_LIGHTS, PLANTS)).toBeNull();
  });

  it("gives a MEASURED light a footprint", () => {
    expect(boxFor(lightAt(), XREFS, MEASURED_LIGHTS, PLANTS)).toEqual(BOX);
  });

  it("never gives a parametric point light one — its parameters ARE the light", () => {
    expect(boxFor(pointAt(), XREFS, MEASURED_LIGHTS, PLANTS)).toBeNull();
  });

  it("falls an xref back to the placeholder square when the catalog lacks the name", () => {
    // the catalog entry IS a Box structurally, so it is returned as-is rather than re-wrapped
    expect(boxFor(xrefAt(), XREFS, BARE_LIGHTS, PLANTS)).toMatchObject({
      bbMin: [-1, -2, 0],
      bbMax: [1, 2, 3],
    });
    expect(boxFor({ ...xrefAt(), name: "gone" }, XREFS, BARE_LIGHTS, PLANTS)).toBe(PLACEHOLDER_BOX);
  });
});

// The subtle half: the three kinds do NOT store their facing in the same units, and a box drawn with the
// wrong one turns against its own tick — which is precisely bug #120, one family over.
describe("boxDirection — one rotation, whatever field the kind keeps it in", () => {
  it("passes an xref's raw .toc direction through untouched", () => {
    expect(boxDirection(xrefAt(), 35)).toBe(35);
  });

  it("turns a light's compass orientation into the matching rotation", () => {
    // The box's facing axis must land on the bearing the light illuminates — i.e. the tick the map draws
    // from the SAME number must read back as that bearing.
    for (const bearing of [0, 35, 90, 180, 279]) {
      expect(directionToHeading(boxDirection(lightAt(), bearing))).toBeCloseTo(bearing, 9);
    }
  });

  it("leaves a plant axis-aligned — a billboard has no facing to turn a box by", () => {
    expect(boxDirection(plantAt(), 123)).toBe(0);
  });

  it("puts a measured light's long axis on its own orientation, on the map", () => {
    // End to end, in map coordinates: a 2 × 0.5 m fixture pointed east must be WIDE along east–west.
    // (Corner 1 is (maxX, minY) and corner 0 is (minX, minY) — the width edge.)
    const east = lightAt(90);
    // (3 decimals: the corners are ~1 m apart, where a bearing round-trip through lon/lat costs a few
    // millionths of a degree — far below anything the map can draw.)
    const [c0, c1] = footprintCorners(AT, BOX.bbMin, BOX.bbMax, boxDirection(east, 90), scaleOf(east));
    expect(initialBearing(c0, c1)).toBeCloseTo(90, 3);
    // …and pointed north, the same edge runs north–south.
    const north = lightAt(0);
    const [n0, n1] = footprintCorners(AT, BOX.bbMin, BOX.bbMax, boxDirection(north, 0), scaleOf(north));
    expect(initialBearing(n0, n1)).toBeCloseTo(0, 3);
  });
});

describe("orientationOf / scaleOf / extentOf", () => {
  it("reports a facing only for the kinds that have one (→ who gets a rotate grip)", () => {
    expect(orientationOf(xrefAt(42))).toBe(42);
    expect(orientationOf(lightAt(42))).toBe(42);
    expect(orientationOf(plantAt())).toBeNull();
    expect(orientationOf(pointAt())).toBeNull();
  });

  it("scales only an xref — no other kind has a scale_factor", () => {
    expect(scaleOf(xrefAt(0, 2.5))).toBe(2.5);
    expect(scaleOf(lightAt())).toBe(1);
    expect(scaleOf(plantAt())).toBe(1);
  });

  it("measures the ground reach from the origin, off-centre boxes included", () => {
    expect(extentOf(BOX)).toBe(1);
    expect(extentOf({ bbMin: [0, 0, 0], bbMax: [30, 4, 9] })).toBe(30);
    expect(extentOf({ bbMin: [-40, -1, 0], bbMax: [2, 1, 3] })).toBe(40);
  });
});
