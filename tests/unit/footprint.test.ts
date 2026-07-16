import { describe, it, expect } from "vitest";
import { footprintCorners } from "../../src/core/geo/footprint";
import { haversine, initialBearing } from "../../src/core/geo/geo";
import { directionToHeading } from "../../src/core/geo/orientation";
import type { LonLat, Vec3 } from "../../src/core/project/types";

// footprint corners are verified by PROPERTY, not by magic lon/lat literals: each corner must sit
// at the expected ground distance and compass azimuth from the anchor (checked back through the
// independent geo.haversine / geo.initialBearing). This pins the axis mapping to the in-sim V3 finding
// and the rotation sense to the 2026-07-15 in-sim gate, without hand-computing coordinates.
// (Absolute-coordinate drift is already frozen by geo.test.ts's destination() goldens, which every
// corner flows through.)

const R2D = 180 / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;
/** Fold into (−180, 180] so two swings can be compared as turns, not as raw bearings. */
const signed = (d: number) => (norm360(d) > 180 ? norm360(d) - 360 : norm360(d));
/** Angular distance between two AXES — lines, not arrows, so equal mod 180 — folded into [0, 90].
 *  (Bearings here come off two independently-projected corners, so a due-North edge measures
 *  359.9999°, not 0°: an axis comparison has to be wrap-aware or it reads that as a 180° error.) */
const axisDelta = (a: number, b: number) => {
  const d = norm360(a - b) % 180;
  return d > 90 ? 180 - d : d;
};

// A model-local ground offset's expected azimuth (0 = +Y = North, +X = East), turned by `direction` —
// which runs NEGATIVE against the compass (2026-07-15 gate; see orientation.rotateAzimuth).
const expectedAzimuth = (east: number, north: number, dir: number) =>
  norm360(Math.atan2(east, north) * R2D - dir);

/** Assert a corner sits `east`/`north` metres from `anchor`, turned by `dir`. */
function expectOffset(anchor: LonLat, corner: LonLat, east: number, north: number, dir: number) {
  const dist = Math.hypot(east, north);
  expect(haversine(anchor, corner)).toBeCloseTo(dist, 5);
  if (dist > 0) {
    expect(initialBearing(anchor, corner)).toBeCloseTo(expectedAzimuth(east, north, dir), 4);
  }
}

const ANCHOR: LonLat = { lon: 11.86, lat: 48.37 }; // near Juan's real RCT POI

describe("footprintCorners — model-local corners projected to the map", () => {
  it("symmetric box, direction 0, scale 1: each corner at its true distance & azimuth", () => {
    const bbMin: Vec3 = [-5, -10, 0];
    const bbMax: Vec3 = [5, 10, 4];
    const [c0, c1, c2, c3] = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1);
    expectOffset(ANCHOR, c0, -5, -10, 0);
    expectOffset(ANCHOR, c1, 5, -10, 0);
    expectOffset(ANCHOR, c2, 5, 10, 0);
    expectOffset(ANCHOR, c3, -5, 10, 0);
  });

  it("anchor is the MODEL ORIGIN, not the bbox centre (asymmetric box)", () => {
    // bb starts at the origin, so corner 0 == the anchor and the whole footprint lies NE of it.
    const bbMin: Vec3 = [0, 0, 0];
    const bbMax: Vec3 = [10, 20, 3];
    const [c0, , c2] = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1);
    expect(haversine(ANCHOR, c0)).toBeCloseTo(0, 6); // origin corner coincides with the anchor
    expect(haversine(ANCHOR, c2)).toBeCloseTo(Math.hypot(10, 20), 5);
    expect(initialBearing(ANCHOR, c2)).toBeCloseTo(expectedAzimuth(10, 20, 0), 4);
  });

  // The calibrated sense (2026-07-15 in-sim gate, three asymmetric objects): `direction` is a
  // right-handed yaw, so it SUBTRACTS from every corner's compass azimuth. v0.3.0 added it here.
  it("direction turns the footprint AGAINST the compass", () => {
    const bbMin: Vec3 = [-5, -10, 0];
    const bbMax: Vec3 = [5, 10, 4];
    const base = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1);
    const turned = footprintCorners(ANCHOR, bbMin, bbMax, 30, 1);
    // +30° direction takes 30° OFF every corner's azimuth, distances unchanged.
    for (let i = 0; i < 4; i++) {
      expect(haversine(ANCHOR, turned[i])).toBeCloseTo(haversine(ANCHOR, base[i]), 6);
      const delta = signed(initialBearing(ANCHOR, turned[i]) - initialBearing(ANCHOR, base[i]));
      expect(delta).toBeCloseTo(-30, 3);
    }
  });

  it("uniform scale grows the footprint about the anchor", () => {
    const bbMin: Vec3 = [-5, -10, 0];
    const bbMax: Vec3 = [5, 10, 4];
    const c2 = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1)[2];
    const c2x2 = footprintCorners(ANCHOR, bbMin, bbMax, 0, 2)[2];
    expect(haversine(ANCHOR, c2x2)).toBeCloseTo(2 * haversine(ANCHOR, c2), 4);
    // same bearing — scale is uniform about the origin, no rotation
    expect(initialBearing(ANCHOR, c2x2)).toBeCloseTo(initialBearing(ANCHOR, c2), 4);
  });

  // The V3 experiment: elongated hangar hangar_small_plates_ds_02_15_42 (bbox X=15.45, Y=41.28), long
  // side along model-Y. In-sim: N–S at direction 0, E–W at direction 90. That pins the AXIS MAPPING —
  // and ONLY the axis mapping. It says nothing about the rotation sense: the box swings N–S → E–W under
  // −90 exactly as under +90, because an axis is a line and this box is 180°-symmetric. Reading a sense
  // into V3 is precisely what caused #120, so this test asserts mod 180 — all V3 ever actually saw.
  it("V3 parity: the long (model-Y) side runs N–S at dir 0 and E–W at dir 90 (axis only)", () => {
    const bbMin: Vec3 = [-7.725, -20.64, 0];
    const bbMax: Vec3 = [7.725, 20.64, 6.83];
    // the box's left long edge runs along model +Y: c0 (minX,minY) → c3 (minX,maxY).
    const longAxisAt = (dir: number) => {
      const [c0, , , c3] = footprintCorners(ANCHOR, bbMin, bbMax, dir, 1);
      return initialBearing(c0, c3);
    };
    expect(axisDelta(longAxisAt(0), 0)).toBeCloseTo(0, 2); // N–S
    expect(axisDelta(longAxisAt(90), 90)).toBeCloseTo(0, 2); // E–W
  });

  // THE #120 regression. The polygon and the map's facing tick are ONE rotation, so pin the
  // RELATIONSHIP, not just each side on its own: before the fix the corners added `direction` while the
  // tick (directionToHeading) subtracted it, and every test here still passed while users watched the box
  // turn against its own tick. Any future drift between the two now fails right here.
  it("#120: a corner and the facing tick always swing together, never against each other", () => {
    const bbMin: Vec3 = [-5, -10, 0];
    const bbMax: Vec3 = [5, 10, 4];
    const cornerAz = (dir: number) =>
      initialBearing(ANCHOR, footprintCorners(ANCHOR, bbMin, bbMax, dir, 1)[2]);
    for (const dir of [15, 30, 90, 200, 355]) {
      const cornerSwing = signed(cornerAz(dir) - cornerAz(0));
      const tickSwing = signed(directionToHeading(dir) - directionToHeading(0));
      expect(cornerSwing).toBeCloseTo(tickSwing, 2);
    }
  });
});
