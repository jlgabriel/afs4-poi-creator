import { describe, it, expect } from "vitest";
import { tag, block, sanitizeValue, fmtLonLat, fmtMeters, fmtNum, fmtF6 } from "../../src/core/tm/tmEmit";

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

describe("sanitizeValue — free text safe as a tag value (grammar has no escape, Fable C2)", () => {
  it("turns brackets into parens so a value can't truncate at the first ']'", () => {
    expect(sanitizeValue("Munich [WIP]")).toBe("Munich (WIP)");
    expect(sanitizeValue("a]b[c")).toBe("a)b(c");
  });
  it("flattens CR/LF/TAB to a space so a value can't break out of its line", () => {
    expect(sanitizeValue("two\nlines")).toBe("two lines");
    expect(sanitizeValue("a\r\n\tb")).toBe("a b");
  });
  it("leaves ordinary text untouched", () => {
    expect(sanitizeValue("Munich test")).toBe("Munich test");
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
  it("fmtF6 → fixed 6 decimals, trailing zeros KEPT, -0 normalised", () => {
    expect(fmtF6(1.5)).toBe("1.500000");
    expect(fmtF6(3)).toBe("3.000000");
    expect(fmtF6(0)).toBe("0.000000");
    expect(fmtF6(-2.25)).toBe("-2.250000");
    expect(fmtF6(-0)).toBe("0.000000");
    expect(fmtF6(-1e-9)).toBe("0.000000"); // tiny negative would round to "-0.000000" — normalised
    expect(fmtF6(-1e-6)).toBe("-0.000001"); // a genuine ±1 µm keeps its sign
  });
});
