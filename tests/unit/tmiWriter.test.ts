import { describe, it, expect } from "vitest";
import { buildTmi, type TmiEntrySpec } from "../../src/core/export/tmiWriter";
import { parseTmi } from "../../src/core/catalog/tmiParser";

// Synthetic — INVENTED object names + values (never Rodeo/IPACS/Michael numbers), real tag structure.
// Keeps IPACS-derived data out of the repo (.gitignore). Real-file validation is the opt-in LOCAL test.
const FIXTURES: TmiEntrySpec[] = [
  { name: "pct_fixture_obj", bbMin: [-0.5, -0.5, 0], bbMax: [0.5, 0.5, 3] },
  { name: "pct_fixture_obj_two", bbMin: [0, 0, 0], bbMax: [2, 4, 6] },
];

// GOLDEN — byte-exact `.tmi`. bs_center = bbox midpoint; bs_radius = half the space diagonal:
//   pct_fixture_obj:     hypot(1,1,3)/2 = √11/2 = 1.658312 ; center (0, 0, 1.5)
//   pct_fixture_obj_two: hypot(2,4,6)/2 = √56/2 = 3.741657 ; center (1, 2, 3)
// Regenerate deliberately if the §1.1 grammar changes; never let it drift silently.
const GOLDEN = `<[file][][]
    <[tmxglscene_info][][]
        <[string8][filename][pct_fixture_bundle]>
        <[list_tmxglscene_info_entry][geometries][]
            <[tmxglscene_info_entry][element][0]
                <[string8u][name][pct_fixture_obj]>
                <[vector3_float64][bb_min][-0.500000 -0.500000 0.000000]>
                <[vector3_float64][bb_max][0.500000 0.500000 3.000000]>
                <[vector3_float64][bs_center][0.000000 0.000000 1.500000]>
                <[float64][bs_radius][1.658312]>
            >
            <[tmxglscene_info_entry][element][1]
                <[string8u][name][pct_fixture_obj_two]>
                <[vector3_float64][bb_min][0.000000 0.000000 0.000000]>
                <[vector3_float64][bb_max][2.000000 4.000000 6.000000]>
                <[vector3_float64][bs_center][1.000000 2.000000 3.000000]>
                <[float64][bs_radius][3.741657]>
            >
        >
    >
>
`;

describe("buildTmi — .tmi scene index emitter", () => {
  it("emits a byte-exact .tmi (midpoint bs_center, half-diagonal bs_radius, 6 decimals)", () => {
    expect(buildTmi("pct_fixture_bundle", FIXTURES)).toBe(GOLDEN);
  });

  it("an empty bundle still produces a valid (empty) geometry list", () => {
    expect(buildTmi("xref_empty", [])).toBe(
      "<[file][][]\n" +
        "    <[tmxglscene_info][][]\n" +
        "        <[string8][filename][xref_empty]>\n" +
        "        <[list_tmxglscene_info_entry][geometries][]\n" +
        "        >\n" +
        "    >\n" +
        ">\n",
    );
  });

  it("round-trips through parseTmi: name + bbox exact, bs_center/bs_radius = the derived values", () => {
    const specs: TmiEntrySpec[] = [
      { name: "widget_alpha", bbMin: [-1, -2, -3], bbMax: [4, 5, 6] },
      { name: "widget_beta", bbMin: [0, 0, 0], bbMax: [10, 20, 30] },
    ];
    const { bundle, entries, warnings } = parseTmi(buildTmi("xref_fixture", specs));
    expect(warnings).toEqual([]);
    expect(bundle).toBe("xref_fixture");
    expect(entries).toHaveLength(2);
    entries.forEach((e, i) => {
      const { bbMin, bbMax } = specs[i];
      expect(e.name).toBe(specs[i].name);
      expect(e.bbMin).toEqual(bbMin);
      expect(e.bbMax).toEqual(bbMax);
      expect(e.bsCenter).toEqual([
        (bbMin[0] + bbMax[0]) / 2,
        (bbMin[1] + bbMax[1]) / 2,
        (bbMin[2] + bbMax[2]) / 2,
      ]);
      const r = Math.hypot(bbMax[0] - bbMin[0], bbMax[1] - bbMin[1], bbMax[2] - bbMin[2]) / 2;
      expect(e.bsRadius).toBe(Number(r.toFixed(6))); // same toFixed(6) round-trip → exact
    });
  });

  it("emits the name VERBATIM — no sanitisation (must match the .tmb/.toc internal name exactly)", () => {
    // Registerable names are slugs (guarded by XREF_NAME_RE upstream); buildTmi must never alter one,
    // or the emitted `.tmi` would index a name the `.toc` can't resolve → an invisible object.
    const tmi = buildTmi("xref_dots", [{ name: "my.obj-1_v2", bbMin: [0, 0, 0], bbMax: [1, 1, 1] }]);
    expect(tmi).toContain("<[string8u][name][my.obj-1_v2]>");
    expect(parseTmi(tmi).entries[0].name).toBe("my.obj-1_v2");
  });

  it("normalises a -0 bbox midpoint to 0.000000 (no stray minus in a symmetric box)", () => {
    // A box symmetric about an axis has a midpoint of exactly 0; float arithmetic must not leak "-0".
    const tmi = buildTmi("xref_sym", [{ name: "sym", bbMin: [-2, -4, -6], bbMax: [2, 4, 6] }]);
    expect(tmi).toContain("<[vector3_float64][bs_center][0.000000 0.000000 0.000000]>");
    expect(tmi).not.toContain("-0.000000");
  });
});
