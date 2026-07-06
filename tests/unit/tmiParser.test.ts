import { describe, it, expect } from "vitest";
import { parseTmi } from "../../src/core/catalog/tmiParser";

// Synthetic .tmi — invented object names, real tag structure. No IPACS content.
const GOOD = `<[file][][]
  <[tmxglscene_info][][]
    <[string8][filename][xref_test]>
    <[list_tmxglscene_info_entry][geometries][]
      <[tmxglscene_info_entry][element][0]
        <[string8u][name][widget_alpha]>
        <[vector3_float64][bb_min][-1 -2 -3]>
        <[vector3_float64][bb_max][4 5 6]>
        <[vector3_float64][bs_center][0 0 0]>
        <[float64][bs_radius][7.5]>
      >
      <[tmxglscene_info_entry][element][1]
        <[string8u][name][widget_beta]>
        <[vector3_float64][bb_min][0 0 0]>
        <[vector3_float64][bb_max][10 20 30]>
      >
    >
  >
>`;

describe("parseTmi", () => {
  it("reads the bundle filename and all entries", () => {
    const { bundle, entries, warnings } = parseTmi(GOOD);
    expect(bundle).toBe("xref_test");
    expect(warnings).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: "widget_alpha",
      bbMin: [-1, -2, -3],
      bbMax: [4, 5, 6],
      bsRadius: 7.5,
    });
    expect(entries[1].bsCenter).toEqual([0, 0, 0]); // defaulted when absent
  });

  it("is tolerant: skips one malformed entry with a warning, keeps the rest (AC4)", () => {
    const BAD = GOOD.replace(
      "<[vector3_float64][bb_min][0 0 0]>", // widget_beta's bb_min
      "<[vector3_float64][bb_min][0 0]>", // now only 2 numbers
    );
    const { entries, warnings } = parseTmi(BAD);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("widget_alpha");
    expect(warnings.join(" ")).toContain("widget_beta");
  });

  it("skips an entry missing bb_min/bb_max", () => {
    const NOBB = `<[file][][]
      <[tmxglscene_info][][]
        <[string8][filename][xref_x]>
        <[tmxglscene_info_entry][element][0]
          <[string8u][name][no_box]>
        >
      >
    >`;
    const { entries, warnings } = parseTmi(NOBB);
    expect(entries).toHaveLength(0);
    expect(warnings.join(" ")).toContain("no_box");
  });

  it("never throws on a wholly malformed file", () => {
    const res = parseTmi("<<<garbage not a tmi");
    expect(res.entries).toEqual([]);
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});
