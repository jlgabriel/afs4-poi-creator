import { describe, it, expect } from "vitest";
import type { HeightSpec, PlacedLight, PlacedXref } from "../../src/core/project/types";
import {
  NeedsElevationError,
  UnsupportedInAutoheightError,
  resolveHeight,
  resolveHeightsFlat,
  resolveHeightsAgl,
  unsupportedInAutoheight,
} from "../../src/core/export/heights";

const obj = (height: HeightSpec): PlacedXref => ({
  id: "x",
  kind: "xref",
  name: "n",
  position: { lon: 0, lat: 0 },
  height,
  direction: 0,
  scale: 1,
});

const light = (): PlacedLight => ({
  id: "l",
  kind: "light",
  position: { lon: 0, lat: 0 },
  height: { mode: "terrain" },
  color: [1, 1, 1],
  intensity: 1000,
  flashing: [0, 0, 0, 0],
  groupIndex: 0,
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

describe("resolveHeightsAgl (autoheight mode)", () => {
  it("terrain → 0 and terrain-offset → the offset (the AGL z the sim grounds)", () => {
    const out = resolveHeightsAgl([obj({ mode: "terrain" }), obj({ mode: "terrain-offset", offset: 25 })]);
    expect(out.map((o) => o.heightAsl)).toEqual([0, 25]);
    expect("height" in out[0]).toBe(false); // HeightSpec dropped, like resolveHeightsFlat
  });

  it("is fully offline — needs no terrain elevation at all (that is the point of the mode)", () => {
    // No base-elevation argument exists to pass: terrain resolves to 0 by definition here.
    expect(() => resolveHeightsAgl([obj({ mode: "terrain" })])).not.toThrow();
  });

  it("throws UnsupportedInAutoheightError(reason=asl) listing the absolute-ASL objects", () => {
    const run = () => resolveHeightsAgl([obj({ mode: "terrain" }), obj({ mode: "asl", value: 500 })]);
    expect(run).toThrow(UnsupportedInAutoheightError);
    try {
      run();
    } catch (e) {
      expect((e as UnsupportedInAutoheightError).reason).toBe("asl");
      expect((e as UnsupportedInAutoheightError).points).toHaveLength(1);
    }
  });

  it("throws UnsupportedInAutoheightError(reason=lights) — the sim can't place lights in autoheight", () => {
    const run = () => resolveHeightsAgl([obj({ mode: "terrain" }), light()]);
    expect(run).toThrow(UnsupportedInAutoheightError);
    try {
      run();
    } catch (e) {
      expect((e as UnsupportedInAutoheightError).reason).toBe("lights");
    }
  });
});

describe("unsupportedInAutoheight", () => {
  it("null when every object is terrain / terrain-offset (exports cleanly)", () => {
    expect(
      unsupportedInAutoheight([obj({ mode: "terrain" }), obj({ mode: "terrain-offset", offset: 3 })]),
    ).toBeNull();
  });

  it("reports lights BEFORE asl — a light is a kind the mode can't handle at all", () => {
    const lightObj = light();
    const blocked = unsupportedInAutoheight([obj({ mode: "asl", value: 1 }), lightObj]);
    expect(blocked?.reason).toBe("lights");
    expect(blocked?.points).toEqual([lightObj]);
  });

  it("reports asl when there are no lights", () => {
    const blocked = unsupportedInAutoheight([obj({ mode: "terrain" }), obj({ mode: "asl", value: 7 })]);
    expect(blocked?.reason).toBe("asl");
    expect(blocked?.points).toHaveLength(1);
  });
});
