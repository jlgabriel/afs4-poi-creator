import { describe, it, expect } from "vitest";
import {
  encodeLonLat,
  bankersRound,
  poiFolderName,
  centroid,
  isSafePoiFolderName,
} from "../../src/core/geo/poiName";

describe("bankersRound (Python round() parity — round half to even)", () => {
  it("rounds halves to the nearest EVEN integer, not up", () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(1187.5)).toBe(1188);
    expect(bankersRound(1188.5)).toBe(1188); // ← where Math.round would give 1189
  });
  it("rounds non-halves to nearest", () => {
    expect(bankersRound(4837.6)).toBe(4838);
    expect(bankersRound(4837.4)).toBe(4837);
    expect(bankersRound(3685.0000000000005)).toBe(3685);
  });
});

describe("encodeLonLat (POI folder coordinate prefix)", () => {
  it("matches the Race App golden vectors", () => {
    expect(encodeLonLat(11.85, 48.376)).toBe("e01185n4838");
    expect(encodeLonLat(-119.88, 39.68)).toBe("w11988n3968");
    expect(encodeLonLat(174.73, -36.85)).toBe("e17473s3685");
  });
  it("uses banker's rounding at a .5 boundary (design appendix: 11.875 → e01188)", () => {
    expect(encodeLonLat(11.875, 0).startsWith("e01188")).toBe(true);
  });
  it("handles hemispheres and zero-padding", () => {
    expect(encodeLonLat(0, 0)).toBe("e00000n0000");
    expect(encodeLonLat(-0.01, -0.02)).toBe("w00001s0002");
  });
});

describe("poiFolderName & centroid", () => {
  it("joins the coord prefix and the slug", () => {
    expect(poiFolderName({ lon: 11.85, lat: 48.376 }, "munich_test")).toBe("e01185n4838_munich_test");
  });
  it("centroid averages points", () => {
    expect(centroid([{ lon: 0, lat: 0 }, { lon: 2, lat: 4 }])).toEqual({ lon: 1, lat: 2 });
    expect(centroid([])).toEqual({ lon: 0, lat: 0 });
  });
});

describe("isSafePoiFolderName (install/uninstall path guard)", () => {
  it("accepts a coordinate prefix + lowercase slug", () => {
    expect(isSafePoiFolderName("e01185n4838_munich_test")).toBe(true);
    expect(isSafePoiFolderName("w11988n3968_reno")).toBe(true);
    expect(isSafePoiFolderName("e17473s3685_auckland_1")).toBe(true);
  });
  it("rejects traversal, separators, empty slug, uppercase, missing prefix", () => {
    expect(isSafePoiFolderName("e01185n4838_..")).toBe(false);
    expect(isSafePoiFolderName("e01185n4838_a/b")).toBe(false);
    expect(isSafePoiFolderName("e01185n4838_a\\b")).toBe(false);
    expect(isSafePoiFolderName("e01185n4838_")).toBe(false);
    expect(isSafePoiFolderName("e01185n4838_Munich")).toBe(false);
    expect(isSafePoiFolderName("../etc")).toBe(false);
    expect(isSafePoiFolderName("munich_test")).toBe(false);
  });
});
