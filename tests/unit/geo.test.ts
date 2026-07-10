import { describe, it, expect } from "vitest";
import {
  haversine,
  initialBearing,
  destination,
  shiftEastNorth,
  EARTH_RADIUS_M,
} from "../../src/core/geo/geo";

// GOLDEN values captured from afs4-pylon-race editor/js/geo.js (the numeric source of truth).
// geo.ts is a line-for-line port, so it must reproduce these. If geo.js ever changes, recapture.
const A = { lon: 11.85, lat: 48.376 };
const B = { lon: 11.86, lat: 48.38 };

describe("geo — numeric parity with geo.js", () => {
  it("shares the same Earth radius", () => {
    expect(EARTH_RADIUS_M).toBe(6371008.8);
  });

  it("haversine", () => {
    expect(haversine(A, B)).toBeCloseTo(862.159430331828, 6);
    expect(haversine({ lon: 0, lat: 0 }, { lon: 1, lat: 0 })).toBeCloseTo(111195.0802335329, 5);
  });

  it("initialBearing", () => {
    expect(initialBearing(A, B)).toBeCloseTo(58.93923076921084, 9);
    expect(initialBearing({ lon: 0, lat: 0 }, { lon: 1, lat: 0 })).toBeCloseTo(90, 9);
  });

  it("destination — 100 m east", () => {
    const d = destination(A, 100, 90);
    expect(d.lat).toBeCloseTo(48.37599999205719, 9);
    expect(d.lon).toBeCloseTo(11.851353910014026, 9);
  });

  it("destination — 100 m north", () => {
    const d = destination(A, 100, 0);
    expect(d.lat).toBeCloseTo(48.37689932036373, 9);
    expect(d.lon).toBeCloseTo(11.85, 12);
  });

  it("destination — 500 m southwest", () => {
    const d = destination(A, 500, 225);
    expect(d.lat).toBeCloseTo(48.37282032308442, 9);
    expect(d.lon).toBeCloseTo(11.845213504165907, 9);
  });

  it("round-trips: haversine(A, destination(A, d, θ)) ≈ d", () => {
    expect(haversine(A, destination(A, 250, 37))).toBeCloseTo(250, 6);
  });
});

describe("shiftEastNorth — (east, north) metres → point", () => {
  it("a zero shift returns the same point", () => {
    expect(shiftEastNorth(A, 0, 0)).toEqual(A);
  });

  it("east-only matches the `destination — 100 m east` golden", () => {
    const e = shiftEastNorth(A, 100, 0);
    expect(e.lat).toBeCloseTo(48.37599999205719, 9);
    expect(e.lon).toBeCloseTo(11.851353910014026, 9);
  });

  it("north-only matches the `destination — 100 m north` golden", () => {
    const n = shiftEastNorth(A, 0, 100);
    expect(n.lat).toBeCloseTo(48.37689932036373, 9);
    expect(n.lon).toBeCloseTo(11.85, 12);
  });

  it("combines components as destination(hypot, atan2(east, north))", () => {
    const d = shiftEastNorth(A, 30, 40); // 3-4-5 → 50 m at 36.87°
    const expected = destination(A, 50, (Math.atan2(30, 40) * 180) / Math.PI);
    expect(d.lon).toBeCloseTo(expected.lon, 12);
    expect(d.lat).toBeCloseTo(expected.lat, 12);
    expect(haversine(A, d)).toBeCloseTo(50, 6);
    expect(initialBearing(A, d)).toBeCloseTo(36.86989764584402, 4);
  });

  it("negative components go west / south (== destination at 270°)", () => {
    const w = shiftEastNorth(A, -100, 0);
    const west = destination(A, 100, 270);
    expect(w.lon).toBeCloseTo(west.lon, 12);
    expect(w.lat).toBeCloseTo(west.lat, 12);
  });
});
