import { describe, expect, it } from "vitest";
import { snapAngle } from "../../src/renderer/map/rotate";

// The rotate handle's Shift-snap (design §5). The bearing comes from geo.initialBearing (parity-tested
// in geo.test.ts); this only guards the snap-to-step + wrap-into-[0,360) that FootprintLayer applies
// before committing `direction`.
describe("snapAngle — Shift-snap for the rotate handle", () => {
  it("rounds to the nearest multiple of the step", () => {
    expect(snapAngle(2, 5)).toBe(0);
    expect(snapAngle(3, 5)).toBe(5);
    expect(snapAngle(47, 5)).toBe(45);
    expect(snapAngle(48, 5)).toBe(50);
    expect(snapAngle(90, 5)).toBe(90);
  });

  it("wraps a snap that lands on 360 back to 0", () => {
    expect(snapAngle(358, 5)).toBe(0);
    expect(snapAngle(359.9, 5)).toBe(0);
  });

  it("folds negatives and >360 into [0, 360)", () => {
    expect(snapAngle(-1, 5)).toBe(0);
    expect(snapAngle(-3, 5)).toBe(355); // round(-0.6)=-1 → -5 → +360
    expect(snapAngle(363, 5)).toBe(5);
  });

  it("honours other step sizes", () => {
    expect(snapAngle(44, 90)).toBe(0);
    expect(snapAngle(46, 90)).toBe(90);
    expect(snapAngle(135, 90)).toBe(180); // 1.5 rounds up to 2 → 180
  });
});
