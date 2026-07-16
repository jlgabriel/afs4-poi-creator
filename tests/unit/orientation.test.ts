import { describe, it, expect } from "vitest";
import {
  XREF_BASE_HEADING,
  directionToHeading,
  headingToDirection,
  rotateAzimuth,
} from "../../src/core/geo/orientation";

// The mapping was measured in-sim (2026-07-15 KDAG gate): heading = (90 − direction) mod 360.
// These cases are exactly the gate readings Juan confirmed by flying them.
describe("XREF orientation conversion (heading = 90 − direction)", () => {
  it("faces East at direction 0 (the base)", () => {
    expect(XREF_BASE_HEADING).toBe(90);
    expect(directionToHeading(0)).toBe(90);
  });

  it("reproduces the confirmed verify-gate cardinals", () => {
    expect(directionToHeading(90)).toBe(0); // A320 dir 90 → North ✓
    expect(directionToHeading(0)).toBe(90); // truck dir 0 → East ✓
    expect(directionToHeading(270)).toBe(180); // hangar dir 270 → South ✓
  });

  it("headingToDirection writes 90 − heading (to face a compass heading)", () => {
    expect(headingToDirection(0)).toBe(90); // North
    expect(headingToDirection(90)).toBe(0); // East
    expect(headingToDirection(180)).toBe(270); // South
    expect(headingToDirection(270)).toBe(180); // West
  });

  it("round-trips for every direction and normalizes wrap-around", () => {
    for (const d of [0, 45, 90, 179, 270, 359]) {
      expect(headingToDirection(directionToHeading(d))).toBe(d);
    }
    expect(directionToHeading(-90)).toBe(180); // negative rotation normalized (−90 ≡ dir 270)
    expect(directionToHeading(450)).toBe(0); // >360 normalized (450 ≡ dir 90)
  });

  it("honours a per-object base override (the planned exception layer)", () => {
    expect(directionToHeading(0, 270)).toBe(270); // an object whose front is West at direction 0
    expect(headingToDirection(0, 270)).toBe(270);
  });
});

// The rotation SENSE lives in rotateAzimuth alone — footprint corners come through it too. v0.3.0's
// #120 was exactly two copies of this fact drifting apart, so it gets pinned on its own.
describe("rotateAzimuth — the one home of the rotation sense", () => {
  it("turns a direction-0 azimuth AGAINST the compass", () => {
    expect(rotateAzimuth(0, 30)).toBe(330); // North turned by direction 30 → 330, NOT 30
    expect(rotateAzimuth(90, 90)).toBe(0); // East → North
    expect(rotateAzimuth(10, 20)).toBe(350); // wraps below zero
  });

  it("direction 0 is the identity, and it normalizes", () => {
    expect(rotateAzimuth(20.5, 0)).toBe(20.5);
    expect(rotateAzimuth(0, -90)).toBe(90); // negative direction normalized
    expect(rotateAzimuth(0, 450)).toBe(270); // >360 normalized (450 ≡ dir 90)
  });

  it("is what directionToHeading is made of (the base facing, rotated)", () => {
    for (const d of [0, 37, 90, 250, 359]) {
      expect(directionToHeading(d)).toBe(rotateAzimuth(XREF_BASE_HEADING, d));
    }
  });
});
