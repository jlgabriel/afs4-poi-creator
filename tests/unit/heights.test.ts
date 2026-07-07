import { describe, it, expect } from "vitest";
import type { HeightSpec, PlacedXref } from "../../src/core/project/types";
import { NeedsElevationError, resolveHeight, resolveHeightsFlat } from "../../src/core/export/heights";

const obj = (height: HeightSpec): PlacedXref => ({
  id: "x",
  kind: "xref",
  name: "n",
  position: { lon: 0, lat: 0 },
  height,
  direction: 0,
  scale: 1,
});

describe("resolveHeight", () => {
  it("asl → the literal value (terrain irrelevant)", () => {
    expect(resolveHeight({ mode: "asl", value: 123 }, 999)).toBe(123);
    expect(resolveHeight({ mode: "asl", value: 7 }, null)).toBe(7);
  });
  it("terrain → the terrain elevation", () => {
    expect(resolveHeight({ mode: "terrain" }, 450)).toBe(450);
  });
  it("terrain-offset → terrain + offset", () => {
    expect(resolveHeight({ mode: "terrain-offset", offset: 5 }, 450)).toBe(455);
  });
  it("terrain modes → null when the elevation is unknown", () => {
    expect(resolveHeight({ mode: "terrain" }, null)).toBeNull();
    expect(resolveHeight({ mode: "terrain-offset", offset: 5 }, null)).toBeNull();
  });
});

describe("resolveHeightsFlat", () => {
  it("resolves every object with one base elevation and drops the HeightSpec", () => {
    const out = resolveHeightsFlat([obj({ mode: "terrain" }), obj({ mode: "asl", value: 10 })], 450);
    expect(out.map((o) => o.heightAsl)).toEqual([450, 10]);
    expect("height" in out[0]).toBe(false);
    expect(out[0].heightAsl).toBe(450);
  });
  it("asl-only objects resolve even with no elevation", () => {
    expect(() => resolveHeightsFlat([obj({ mode: "asl", value: 5 })], null)).not.toThrow();
  });
  it("throws NeedsElevationError listing the objects that need terrain", () => {
    const run = () => resolveHeightsFlat([obj({ mode: "terrain" }), obj({ mode: "asl", value: 1 })], null);
    expect(run).toThrow(NeedsElevationError);
    try {
      run();
    } catch (e) {
      expect((e as NeedsElevationError).points).toHaveLength(1);
    }
  });
});
