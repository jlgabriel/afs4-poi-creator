import { describe, it, expect } from "vitest";
import {
  WAD_LAT_K,
  WAD_SPAN,
  directionToWad,
  formatWad,
  headingToWadDirection,
  latToWad,
  lonToWad,
} from "../../src/core/geo/wad";
import { headingToDirection } from "../../src/core/geo/orientation";
import { buildHeliportWad } from "../../src/core/export/heliportTemplate";

// GROUND TRUTH — ApfelFlieger's hand-built `de0869.wad` (forum #113, in _local_reference). He wrote the
// degrees; the sim reads the projected pair. If PCT is going to show a user the number to paste, it has
// to be HIS number, to the last printed digit — so the file itself is the fixture, not our own algebra.
//
//     de0869.tsc  <[vector2_float64][position][11.82883 49.23516]>            (degrees)
//     de0869.wad  <[vector2_float64][position][34921.3727857778 43182.1475959329]>
//     de0869.wad  <[float64][direction][5.91666616426078]>                    (helipad, heading 111°)
describe("WAD conversion — reproduces a real .wad file", () => {
  it("projects the Albertshof heliport position to its exact printed digits", () => {
    expect(formatWad(lonToWad(11.82883))).toBe("34921.3727857778");
    expect(formatWad(latToWad(49.23516))).toBe("43182.1475959329");
  });

  it("turns that helipad's compass heading into its exact printed radians", () => {
    // 111° in his .tsc → raw .toc direction 339 → radians. Routing through headingToDirection is the
    // point: the sim-calibrated heading mapping stays in ONE place and this is only a unit change.
    expect(headingToDirection(111)).toBe(339);
    expect(directionToWad(headingToDirection(111)).toFixed(14)).toBe("5.91666616426078");
  });
});

describe("WAD conversion — the grid anchors", () => {
  it("puts longitude on 0 / 32768 / 65536", () => {
    expect(lonToWad(-180)).toBe(0);
    expect(lonToWad(0)).toBe(WAD_SPAN / 2);
    expect(lonToWad(180)).toBe(WAD_SPAN);
  });

  it("puts latitude on the same anchors — which is what picks the tangent over Mercator", () => {
    // K is the root of tan(K/2) = K, so the poles land exactly on the grid edges (to float noise).
    expect(Math.tan(WAD_LAT_K / 2)).toBeCloseTo(WAD_LAT_K, 9);
    expect(latToWad(-90)).toBeCloseTo(0, 6);
    expect(latToWad(0)).toBe(WAD_SPAN / 2);
    expect(latToWad(90)).toBeCloseTo(WAD_SPAN, 6);
  });

  it("is NOT Mercator — the two differ by tens of kilometres at mid latitude", () => {
    // Spherical Mercator, normalized onto the same 0–65536 grid (±85.05° at the edges).
    const mercator = (lat: number): number =>
      WAD_SPAN * (0.5 + Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI));
    // At 49° the gap is 86.5 WAD units — 0.31° of latitude, ~34 km on the ground. A different function,
    // not an approximation, which is why inverting 47 binary IPACS `.wad` files could tell them apart
    // (46 to 1 for the tangent). This test exists so a future "simplification" to the familiar Mercator
    // formula fails loudly instead of quietly moving every heliport a town over.
    expect(Math.abs(latToWad(49) - mercator(49))).toBeGreaterThan(50);
  });
});

describe("WAD conversion — display contract", () => {
  it("normalizes a rotation into [0, 2π)", () => {
    expect(directionToWad(0)).toBe(0);
    expect(directionToWad(360)).toBe(0); // a full turn is not 2π in the file
    expect(directionToWad(-90)).toBeCloseTo((3 * Math.PI) / 2, 12); // negative rotations wrap
    expect(directionToWad(180)).toBeCloseTo(Math.PI, 12);
  });

  it("always prints ten decimals, like the files do", () => {
    expect(formatWad(0)).toBe("0.0000000000");
    expect(formatWad(WAD_SPAN)).toBe("65536.0000000000");
  });
});

// Forum #284: the Inspector now shows these values beside the LON/LAT and HEADING fields of all six
// Airport submenus, so a user can copy them. That makes the read-out and the WRITER two mouths on one
// number, and a heading is where they could disagree without either looking wrong — hence one function.
describe("WAD conversion — heading, the composed form the Inspector shows", () => {
  it("is the raw direction in radians, not the heading in radians", () => {
    // The two agree only at 45°, which is exactly why a "simplification" here would look plausible.
    expect(headingToWadDirection(111)).toBe(directionToWad(headingToDirection(111)));
    expect(formatWad(headingToWadDirection(111))).toBe("5.9166661643");
    expect(headingToWadDirection(0)).not.toBeCloseTo(directionToWad(0), 6);
    expect(headingToWadDirection(45)).toBeCloseTo(directionToWad(45), 12); // the one coincidence
  });

  it("is the same string the .wad file gets — the read-out cannot drift from the writer", () => {
    const at = { lon: 11.82883, lat: 49.23516 };
    const wad = buildHeliportWad({
      position: at,
      pads: [{ name: "", position: at, headingDeg: 111, radiusM: 10 }],
      aerotows: [{ name: "26", position: at, headingDeg: 111 }],
      cultivationFileName: null,
      anchor: null,
      autoheight: false,
      identity: { icao: "pct001", name: "Readout", country: "de" },
    });
    // The pad's and the aerotow's `direction` rows, and the position the airport row carries — every one
    // of them a string the Inspector now prints beside the field the user typed.
    expect(wad).toContain(formatWad(headingToWadDirection(111)));
    expect(wad).toContain(formatWad(lonToWad(at.lon)));
    expect(wad).toContain(formatWad(latToWad(at.lat)));
  });
});
