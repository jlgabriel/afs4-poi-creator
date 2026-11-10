import { describe, it, expect } from "vitest";
import {
  arcInterior,
  arcMidpoint,
  bendsWithout,
  chordLength,
  clampSagitta,
  curvedPath,
  halfSagitta,
  sagittaAt,
} from "../../src/core/geo/arc";
import { destination, haversine, initialBearing } from "../../src/core/geo/geo";
import type { LonLat } from "../../src/core/project/types";

const near = (got: number, want: number, tol: number): void => expect(Math.abs(got - want)).toBeLessThan(tol);

// A 100 m edge running due east, on a real airport latitude.
const A: LonLat = { lon: -71.6161, lat: -33.656 };
const B = destination(A, 100, 90);

describe("arc geometry", () => {
  it("measures the chord like haversine at airport size", () => {
    near(chordLength(A, B), haversine(A, B), 0.01);
  });

  it("puts the arc's middle the sagitta away from the chord's, on the LEFT for a positive one", () => {
    const mid = arcMidpoint(A, B, 20);
    const chordMid = destination(A, 50, 90);
    near(haversine(chordMid, mid), 20, 0.05);
    // Travelling east, left is north.
    expect(mid.lat).toBeGreaterThan(chordMid.lat);
    expect(arcMidpoint(A, B, -20).lat).toBeLessThan(chordMid.lat);
  });

  it("reads back the sagitta of a point, signed", () => {
    near(sagittaAt(A, B, arcMidpoint(A, B, 12.5)), 12.5, 0.01);
    near(sagittaAt(A, B, arcMidpoint(A, B, -7)), -7, 0.01);
  });

  it("keeps a sagitta within the chord, and a straight edge has no interior points", () => {
    expect(clampSagitta(500, 100)).toBe(100);
    expect(clampSagitta(-500, 100)).toBe(-100);
    expect(clampSagitta(Number.NaN, 100)).toBe(0);
    expect(arcInterior(A, B, 0)).toEqual([]);
  });

  it("lays every interior point on one circle through both ends and the bulge", () => {
    const s = 20;
    const pts = arcInterior(A, B, s);
    expect(pts.length).toBeGreaterThan(2);
    // r = c²/8s + s/2 = 10000/160 + 10 = 72.5 m; the centre is r − s below the chord's middle.
    const r = 72.5;
    const centre = destination(destination(A, 50, 90), r - s, 180);
    for (const p of [A, ...pts, B]) near(haversine(centre, p), r, 0.05);
    // Strays from the true arc by no more than the tolerance between points.
    for (let i = 1; i < pts.length; i++) {
      const m = { lon: (pts[i - 1]!.lon + pts[i]!.lon) / 2, lat: (pts[i - 1]!.lat + pts[i]!.lat) / 2 };
      expect(r - haversine(centre, m)).toBeLessThan(0.11);
    }
  });

  it("makes a circle out of two edges bent by half their length", () => {
    // A → B east, then B → A back: bending both by +50 (left of each) closes a circle of radius 50.
    const path = curvedPath([A, B, A], [50, 50]);
    const centre = destination(A, 50, 90);
    for (const p of path) near(haversine(centre, p), 50, 0.05);
    // It goes all the way round: some point lies north of the centre and some south.
    expect(path.some((p) => p.lat > centre.lat + 0.0004)).toBe(true);
    expect(path.some((p) => p.lat < centre.lat - 0.0004)).toBe(true);
  });

  it("leaves a straight line as its own points", () => {
    expect(curvedPath([A, B], undefined)).toEqual([A, B]);
    expect(curvedPath([A, B], [0])).toEqual([A, B]);
  });

  it("splits a bent edge into two halves on the same circle", () => {
    const s = 30;
    const mid = arcMidpoint(A, B, s);
    const h = halfSagitta(A, B, s);
    const whole = curvedPath([A, B], [s]);
    const halves = curvedPath([A, mid, B], [h, h]);
    const r = (100 * 100) / (8 * s) + s / 2;
    const centre = destination(destination(A, 50, 90), r - s, 180);
    for (const p of [...whole, ...halves]) near(haversine(centre, p), r, 0.05);
  });

  it("follows the edge when its end moves: the bend is relative to the edge", () => {
    const B2 = destination(A, 100, 30);
    const mid = arcMidpoint(A, B2, 10);
    near(sagittaAt(A, B2, mid), 10, 0.01);
    // Left of a heading of 30° is a bearing of 300° from the chord's middle.
    near(initialBearing(destination(A, 50, 30), mid), 300, 0.5);
  });
});

describe("bendsWithout — removing a point merges its two edges into one straight edge", () => {
  it("open line", () => {
    expect(bendsWithout([1, 2, 3], 0, 4, false)).toEqual([2, 3]);
    expect(bendsWithout([1, 2, 3], 3, 4, false)).toEqual([1, 2]);
    expect(bendsWithout([1, 2, 3], 1, 4, false)).toEqual([0, 3]);
    expect(bendsWithout([1, 2, 3], 2, 4, false)).toEqual([1, 0]);
  });
  it("closed ring", () => {
    expect(bendsWithout([1, 2, 3, 4], 0, 4, true)).toEqual([2, 3, 0]);
    expect(bendsWithout([1, 2, 3, 4], 2, 4, true)).toEqual([1, 0, 4]);
  });
});
