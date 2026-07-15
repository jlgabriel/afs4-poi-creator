import { describe, it, expect } from "vitest";
import { parseXrefTable, lookupXref } from "../../src/core/catalog/xrefTable";

// Synthetic — INVENTED names + values (never Rodeo/IPACS numbers), real column structure. Keeps
// IPACS-derived data out of the repo; the real 753-row table is exercised only by the opt-in LOCAL
// test (tests/local/xrefTableReal.test.ts). Grammar mirrors the real file:
//   name;display;main;sub;type;length;width;height;offset(x y z); <shape verts…> ; <truescale verts…>
// Each ring repeats its first vertex to close; the parser stores the ring OPEN.
const HEADER =
  "name internal;display name;main category;sub category;type category;length;width;height;offset;shape;shape truescale";

/** A well-formed row: unit quad (-1..1) + truescale quad (-5..5), each closed by the repeated first vertex. */
const HAPPY =
  "pct_widget;PCT Widget;Testing;Props;Widget;10;20;30;1 2 3;-1 -1;1 -1;1 1;-1 1;-1 -1;-5 -5;5 -5;5 5;-5 5;-5 -5";

const csv = (...rows: string[]): string => [HEADER, ...rows].join("\n");

describe("parseXrefTable", () => {
  it("parses a well-formed row: scalars, taxonomy, offset and both rings (stored open)", () => {
    const t = parseXrefTable(csv(HAPPY));
    expect(t.rows).toBe(1);
    expect(t.warnings).toEqual([]);
    const e = t.byName.get("pct_widget")!;
    expect(e).toEqual({
      name: "pct_widget",
      displayName: "PCT Widget",
      taxonomy: { main: "Testing", sub: "Props", type: "Widget" },
      size: { length: 10, width: 20, height: 30 },
      offset: [1, 2, 3],
      footprintUnit: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
      footprint: [
        [-5, -5],
        [5, -5],
        [5, 5],
        [-5, 5],
      ],
    });
  });

  it("looks up case-insensitively (scan yields mixed case, the CSV is lowercase)", () => {
    const t = parseXrefTable(csv(HAPPY));
    expect(lookupXref(t, "PCT_WIDGET")!.displayName).toBe("PCT Widget");
    expect(lookupXref(t, "Pct_Widget")!.name).toBe("pct_widget");
    expect(lookupXref(t, "no_such_object")).toBeNull();
  });

  it("lookupXref tolerates a null/undefined table (overlay disabled)", () => {
    expect(lookupXref(null, "pct_widget")).toBeNull();
    expect(lookupXref(undefined, "pct_widget")).toBeNull();
  });

  it("tolerates a leading BOM and CRLF line endings", () => {
    const t = parseXrefTable("﻿" + csv(HAPPY).replace(/\n/g, "\r\n"));
    expect(t.rows).toBe(1);
    expect(t.warnings).toEqual([]);
    expect(t.byName.has("pct_widget")).toBe(true);
  });

  it("warns (but still parses) when the header row is unrecognised", () => {
    const t = parseXrefTable(HAPPY); // no header line
    expect(t.rows).toBe(1);
    expect(t.warnings.join(" ")).toContain("header row not recognised");
  });

  it("skips a row with fewer than the 9 scalar fields, with a warning", () => {
    const t = parseXrefTable(csv("too;few;fields;here"));
    expect(t.rows).toBe(0);
    expect(t.warnings.join(" ")).toMatch(/field\(s\), need 9/);
  });

  it("skips a row with an empty name", () => {
    const t = parseXrefTable(csv(";No Name;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 -1"));
    expect(t.rows).toBe(0);
    expect(t.warnings.join(" ")).toContain("empty name");
  });

  it("keeps the FIRST of duplicate names (case-insensitive) and warns", () => {
    const dupA = "pct_dup;First;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 -1;-2 -2;2 -2;2 2;-2 -2";
    const dupB = "PCT_DUP;Second;M;S;T;9;9;9;0 0 0;-1 -1;1 -1;1 1;-1 -1;-2 -2;2 -2;2 2;-2 -2";
    const t = parseXrefTable(csv(dupA, dupB));
    expect(t.rows).toBe(1);
    expect(t.byName.get("pct_dup")!.displayName).toBe("First");
    expect(t.warnings.join(" ")).toContain("duplicate name");
  });

  it("falls back to the raw name when display name is empty, with a warning", () => {
    const t = parseXrefTable(csv("pct_nodisp;;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 -1"));
    expect(t.byName.get("pct_nodisp")!.displayName).toBe("pct_nodisp");
    expect(t.warnings.join(" ")).toContain("empty display name");
  });

  it("keeps a row with non-numeric size (size is NaN) and warns", () => {
    const t = parseXrefTable(csv("pct_badsize;Bad Size;M;S;T;wide;tall;deep;0 0 0;-1 -1;1 -1;1 1;-1 -1"));
    const e = t.byName.get("pct_badsize")!;
    expect(Number.isNaN(e.size.length)).toBe(true);
    expect(t.warnings.join(" ")).toContain("non-numeric size");
  });

  it("defaults a malformed offset to 0 0 0 and warns, keeping the row", () => {
    const t = parseXrefTable(csv("pct_badoff;Bad Off;M;S;T;1;1;1;nope;-1 -1;1 -1;1 1;-1 -1"));
    expect(t.byName.get("pct_badoff")!.offset).toEqual([0, 0, 0]);
    expect(t.warnings.join(" ")).toContain("malformed offset");
  });

  it("drops only the footprint on a malformed vertex, keeping name/taxonomy", () => {
    // second vertex isn't a clean "x y" pair
    const t = parseXrefTable(csv("pct_badfp;Bad FP;M;S;T;1;1;1;0 0 0;-1 -1;boom;1 1;-1 -1"));
    const e = t.byName.get("pct_badfp")!;
    expect(e.displayName).toBe("Bad FP");
    expect(e.footprint).toBeUndefined();
    expect(e.footprintUnit).toBeUndefined();
    expect(t.warnings.join(" ")).toContain("footprint dropped");
  });

  it("drops the footprint when a ring never closes", () => {
    // unit ring never repeats its first vertex → left open
    const t = parseXrefTable(csv("pct_openring;Open Ring;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 1"));
    const e = t.byName.get("pct_openring")!;
    expect(e.footprint).toBeUndefined();
    expect(t.warnings.join(" ")).toContain("footprint dropped");
  });

  it("accepts a row with only the unit ring (no truescale)", () => {
    const t = parseXrefTable(csv("pct_unitonly;Unit Only;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 1;-1 -1"));
    const e = t.byName.get("pct_unitonly")!;
    expect(e.footprintUnit).toEqual([
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]);
    expect(e.footprint).toBeUndefined();
    expect(t.warnings).toEqual([]);
  });

  it("tolerates blank lines and a trailing line-ending semicolon", () => {
    const t = parseXrefTable(csv(HAPPY + ";", "", "   "));
    expect(t.rows).toBe(1);
    expect(t.warnings).toEqual([]);
  });
});
