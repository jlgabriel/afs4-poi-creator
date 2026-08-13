import { describe, it, expect } from "vitest";
import { stripCorners } from "../../src/renderer/map/runwayStrip";
import { haversine, initialBearing } from "../../src/core/geo/geo";

// The map draws a runway as a rectangle rather than a line because `width` is not decoration — it is the
// number the simulator lands an aircraft with, and drawn to scale it is the only feedback that 40 is not
// 400 (forum #242). These pin the geometry that claim rests on.

const A = { lon: 11.86, lat: 48.37 };
const near = (got: number, want: number, tol: number): void => expect(Math.abs(got - want)).toBeLessThan(tol);

describe("stripCorners", () => {
  it("is `width` metres across at BOTH ends — the full width, not a radius", () => {
    // ★ The regression this exists for. A pad's `radius` and a stand's `size` are radii; a runway's
    // `width` is the whole strip (types.ts). Halving it here is what makes 40 mean 40 — read as a radius
    // every runway would be drawn twice as wide as the sim lands on, and nothing else would complain.
    const b = { lon: A.lon, lat: A.lat + 0.009 }; // ~1 km due north
    const [aLeft, bLeft, bRight, aRight] = stripCorners(A, b, 40);
    near(haversine(aLeft, aRight), 40, 0.05);
    near(haversine(bLeft, bRight), 40, 0.05);
  });

  it("runs the long axis from threshold to threshold", () => {
    const b = { lon: A.lon, lat: A.lat + 0.009 };
    const length = haversine(A, b);
    const [aLeft, bLeft] = stripCorners(A, b, 40);
    near(haversine(aLeft, bLeft), length, 0.05);
  });

  it("puts the two sides square to the runway, on opposite sides", () => {
    const b = { lon: A.lon + 0.012, lat: A.lat }; // due east, so the sides face due north and south
    const heading = initialBearing(A, b);
    const [aLeft, , , aRight] = stripCorners(A, b, 60);
    near(initialBearing(A, aLeft), (heading + 270) % 360, 0.5);
    near(initialBearing(A, aRight), (heading + 90) % 360, 0.5);
  });

  it("gives four corners in draw order, so the polygon never self-crosses", () => {
    // a-left → b-left → b-right → a-right walks the rectangle's rim. The bug this catches is emitting
    // a-left → b-right → …, which draws an hourglass that still looks plausible at low zoom.
    const b = { lon: A.lon + 0.012, lat: A.lat + 0.004 };
    const [aLeft, bLeft, bRight, aRight] = stripCorners(A, b, 40);
    const length = haversine(A, b);
    // Consecutive corners alternate long side / short side; opposite corners are the diagonal, which is
    // strictly longer than either.
    near(haversine(aLeft, bLeft), length, 0.05); // long side
    near(haversine(bRight, aRight), length, 0.05); // long side
    near(haversine(bLeft, bRight), 40, 0.05); // short side
    expect(haversine(aLeft, bRight)).toBeGreaterThan(length); // diagonal
  });

  it("collapses to a line when both thresholds are the same point, rather than throwing", () => {
    // Reachable by dragging one end onto the other. A visible mistake beats a crashed map layer.
    const corners = stripCorners(A, A, 40);
    expect(corners).toHaveLength(4);
    near(haversine(corners[0], corners[3]), 40, 0.05);
    near(haversine(corners[0], corners[1]), 0, 0.001);
  });

  it("treats a non-positive width as zero instead of mirroring the strip", () => {
    // setAirportRunwayWidth refuses these, so it is unreachable through the UI — but a hand-edited
    // project.json is not, and a negative half-width would swap left and right and wind the polygon
    // backwards.
    expect(stripCorners(A, { lon: A.lon + 0.01, lat: A.lat }, -40)).toEqual(
      stripCorners(A, { lon: A.lon + 0.01, lat: A.lat }, 0),
    );
  });
});
