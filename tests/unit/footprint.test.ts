import { describe, it, expect } from "vitest";
import { footprintCorners, headingMarker } from "../../src/core/geo/footprint";
import { haversine, initialBearing } from "../../src/core/geo/geo";
import type { LonLat, Vec3 } from "../../src/core/project/types";

// footprint corners are verified by PROPERTY, not by magic lon/lat literals: each corner must sit
// at the expected ground distance and compass azimuth from the anchor (checked back through the
// independent geo.haversine / geo.initialBearing), and rotation must be clockwise. This pins the
// axis mapping to the in-sim V3 finding without hand-computing coordinates. (Absolute-coordinate
// drift is already frozen by geo.test.ts's destination() goldens, which every corner flows through.)

const R2D = 180 / Math.PI;
const norm360 = (d: number) => ((d % 360) + 360) % 360;

// A model-local ground offset's expected azimuth (0 = +Y = North, +X = East, clockwise) + direction.
const expectedAzimuth = (east: number, north: number, dir: number) =>
  norm360(Math.atan2(east, north) * R2D + dir);

/** Assert a corner sits `east`/`north` metres from `anchor`, rotated by `dir`. */
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

  it("direction rotates the footprint CLOCKWISE", () => {
    const bbMin: Vec3 = [-5, -10, 0];
    const bbMax: Vec3 = [5, 10, 4];
    const base = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1);
    const turned = footprintCorners(ANCHOR, bbMin, bbMax, 30, 1);
    // +30° direction adds 30° to every corner's azimuth (clockwise), distances unchanged.
    for (let i = 0; i < 4; i++) {
      expect(haversine(ANCHOR, turned[i])).toBeCloseTo(haversine(ANCHOR, base[i]), 6);
      const delta = norm360(initialBearing(ANCHOR, turned[i]) - initialBearing(ANCHOR, base[i]));
      expect(delta).toBeCloseTo(30, 3);
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

  // The V3 experiment: elongated hangar hangar_small_plates_ds_02_15_42
  // (bbox X=15.45, Y=41.28). Long side runs model-Y. In-sim: N–S at direction 0, and direction 90
  // swings it N–S → E–W. This test fails if we ever flip an axis or the rotation sense.
  it("V3 parity: long (model-Y) side runs N–S at dir 0, E–W at dir 90 (clockwise)", () => {
    const bbMin: Vec3 = [-7.725, -20.64, 0];
    const bbMax: Vec3 = [7.725, 20.64, 6.83];
    // the forward (+Y) tip is the long axis end; watch where it points.
    expect(initialBearing(ANCHOR, headingMarker(ANCHOR, bbMax, 0, 1))).toBeCloseTo(0, 3); // North
    expect(initialBearing(ANCHOR, headingMarker(ANCHOR, bbMax, 90, 1))).toBeCloseTo(90, 3); // East
    // and the far corner along +Y confirms the whole footprint swung the same clockwise way.
    const nAt0 = footprintCorners(ANCHOR, bbMin, bbMax, 0, 1)[2]; // (maxX, maxY)
    const nAt90 = footprintCorners(ANCHOR, bbMin, bbMax, 90, 1)[2];
    const swing = norm360(initialBearing(ANCHOR, nAt90) - initialBearing(ANCHOR, nAt0));
    expect(swing).toBeCloseTo(90, 2);
  });
});

describe("headingMarker — the facing arrow tip", () => {
  it("points along +Y at the forward edge, rotated by direction", () => {
    const bbMax: Vec3 = [5, 10, 4];
    const north = headingMarker(ANCHOR, bbMax, 0, 1);
    expect(haversine(ANCHOR, north)).toBeCloseTo(10, 5); // reaches bbMax.y
    expect(initialBearing(ANCHOR, north)).toBeCloseTo(0, 4); // due North at dir 0

    const east = headingMarker(ANCHOR, bbMax, 90, 1);
    expect(initialBearing(ANCHOR, east)).toBeCloseTo(90, 4); // clockwise to East at dir 90

    const scaled = headingMarker(ANCHOR, bbMax, 0, 2);
    expect(haversine(ANCHOR, scaled)).toBeCloseTo(20, 4); // scale multiplies the extent
  });
});
