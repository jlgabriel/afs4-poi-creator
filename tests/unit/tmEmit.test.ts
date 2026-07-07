import { describe, it, expect } from "vitest";
import { tag, block, fmtLonLat, fmtMeters, fmtNum } from "../../src/core/tm/tmEmit";

describe("tag", () => {
  it("emits a leaf tag on one line", () => {
    expect(tag("string8", "name", "poi")).toBe("<[string8][name][poi]>");
    expect(tag("bool", "autoheight", "true")).toBe("<[bool][autoheight][true]>");
    expect(tag("string8u", "coordinate_system", "")).toBe("<[string8u][coordinate_system][]>");
  });
});

describe("block", () => {
  it("wraps a body, indenting children 4 spaces", () => {
    expect(block("list", "x", "", ["a", "b"])).toEqual(["<[list][x][]", "    a", "    b", ">"]);
  });
  it("nests by composition — inner children gain a level", () => {
    const inner = block("inner", "", "", ["leaf"]);
    expect(block("outer", "", "", inner)).toEqual([
      "<[outer][][]",
      "    <[inner][][]",
      "        leaf",
      "    >",
      ">",
    ]);
  });
});

describe("number formatting", () => {
  it("fmtLonLat → 7 decimals, fixed width", () => {
    expect(fmtLonLat(11.85)).toBe("11.8500000");
    expect(fmtLonLat(-119.88)).toBe("-119.8800000");
    expect(fmtLonLat(0)).toBe("0.0000000");
  });
  it("fmtMeters → 2 decimals", () => {
    expect(fmtMeters(520)).toBe("520.00");
    expect(fmtMeters(519.5)).toBe("519.50");
    expect(fmtMeters(-1.2)).toBe("-1.20");
  });
  it("fmtNum → compact, no trailing zeros or dot", () => {
    expect(fmtNum(90)).toBe("90");
    expect(fmtNum(90.5)).toBe("90.5");
    expect(fmtNum(1)).toBe("1");
    expect(fmtNum(0.5)).toBe("0.5");
    expect(fmtNum(0)).toBe("0");
    expect(fmtNum(-45)).toBe("-45");
  });
  it("fmtNum is float-safe (no 0.30000000000000004)", () => {
    expect(fmtNum(0.1 + 0.2, 3)).toBe("0.3");
  });
});
