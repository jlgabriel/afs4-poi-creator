import { describe, it, expect } from "vitest";
import type { ResolvedObject, ResolvedPlant, ResolvedXref } from "../../src/core/project/types";
import { buildToc } from "../../src/core/export/tocWriter";
import { parseTm, child, findAll } from "../../src/core/tm/tmParser";

// v0.4 plants. This golden is now a transcription of a REAL, in-sim-proven `list_plant`: the format's
// author built one at Heligoland, flew it, and sent the file (2026-07-17, kept out of the repo in
// _local_reference). Its element is byte-for-byte the shape below.
//
// ★ It corrects the format bible on all three types — `vector2_float64` not vector3, `vector2_float32`
// not vector3, `stringt8c` not string8 — which is why the bible's own template printed two values into
// a "vector3": the type is a vector2. Regenerate deliberately only against a newer proven file.
const PLANT: ResolvedPlant = {
  id: "p1",
  kind: "plant",
  group: "broadleaf",
  species: "00",
  position: { lon: -116.7878783, lat: 34.8554 },
  heightAsl: 584,
  heightRange: [0, 0],
};
const WITNESS: ResolvedXref = {
  id: "x1",
  kind: "xref",
  name: "silo_00",
  position: { lon: -116.7835003, lat: 34.8546 },
  heightAsl: 584,
  direction: 0,
  scale: 1,
};

const GOLDEN_PLANTS_TOC = `<[file][][]
    <[cultivation][][]
        <[string8u][coordinate_system][lonlat]>
        <[list_plant][plant_list][]
            <[plant][element][0]
                <[vector2_float64][position][-116.7878783 34.8554000]>
                <[float32][altitude][584.00]>
                <[vector2_float32][height_range][0.00 0.00]>
                <[stringt8c][group][broadleaf]>
                <[stringt8c][species][00]>
            >
        >
        <[list_xref][xref_list][]
        >
    >
>
`;

describe("buildToc — list_plant (v0.4)", () => {
  it("emits the bible's declared plant element, byte-exact", () => {
    expect(buildToc([PLANT])).toBe(GOLDEN_PLANTS_TOC);
  });

  it("gives a plant a 2-value position — its height is the sibling `altitude`, not position's 3rd slot", () => {
    // The one structural way a plant element differs from every other kind. Emitting [lon lat alt]
    // here would look right and be wrong: `altitude` would then be specified twice, inconsistently.
    const el = findAll(parseTm(buildToc([PLANT])), "plant")[0];
    expect(child(el, "position")!.value).toBe("-116.7878783 34.8554000");
    expect(child(el, "altitude")!.value).toBe("584.00");
  });

  it("keeps `species` as the filename's padded digits — never a 0-based ordinal", () => {
    // The reference file places `palm`/`11`, and palm's textures are i08…i14 — an ordinal would top
    // out at 6. An unresolvable plant fails SILENTLY in-sim (no object, no error), so this is exactly
    // the kind of value that must come from the scan verbatim.
    expect(buildToc([PLANT])).toContain("<[stringt8c][species][00]>");
    const palm: ResolvedPlant = { ...PLANT, group: "palm", species: "11" };
    expect(buildToc([palm])).toContain("<[stringt8c][species][11]>");
  });

  it("declares position and height_range as vector2, not vector3 (the bible's error)", () => {
    // The bible says vector3 for both while printing two values into them; the author's working file
    // says vector2. This is the one thing PCT emitted that the reference file contradicts outright.
    const toc = buildToc([PLANT]);
    expect(toc).toContain("<[vector2_float64][position]");
    expect(toc).toContain("<[vector2_float32][height_range]");
    expect(toc).not.toContain("vector3_float64][position][-116.7878783 34.8554000]>"); // the old 2-in-a-vector3
  });

  it("omits list_plant entirely when there are no plants (an xref-only POI is unchanged)", () => {
    const toc = buildToc([WITNESS]);
    expect(toc).not.toContain("list_plant");
    expect(toc).toContain("list_xref");
  });

  it("emits list_plant FIRST, in the bible's sibling order, whatever the input order", () => {
    const mixed: ResolvedObject[] = [WITNESS, PLANT];
    const toc = buildToc(mixed);
    expect(toc.indexOf("list_plant")).toBeLessThan(toc.indexOf("list_xref"));
  });

  it("never files a plant into another kind's list", () => {
    // The regression this pins: buildToc's dispatcher used to end in a catch-all `else` that meant
    // "anything that isn't xref or airport_light is a light". Adding a 4th kind to that shape would
    // have emitted every plant as a <[light][element]> — a POI that loads and shows nothing.
    const toc = buildToc([PLANT]);
    expect(toc).not.toContain("list_light");
    expect(toc).not.toContain("list_airport_light");
    const tm = parseTm(toc);
    expect(findAll(tm, "plant")).toHaveLength(1); // the element lands in list_plant…
    expect(findAll(tm, "light")).toHaveLength(0); // …and nowhere else
  });

  it("numbers plant elements per-list, from 0", () => {
    const two: ResolvedObject[] = [PLANT, { ...PLANT, id: "p2", species: "01" }];
    const toc = buildToc(two);
    expect(toc).toContain("<[plant][element][0]");
    expect(toc).toContain("<[plant][element][1]");
  });

  it("emits a non-zero height_range as metres — it is how tall the plant grows", () => {
    // Confirmed by the reference file, which drives real size through this field alone: a 20 m
    // broadleaf and a 5 m shrub, each `[h h]`, all sharing one altitude.
    const grown: ResolvedPlant = { ...PLANT, heightRange: [12, 18.5] };
    expect(buildToc([grown])).toContain("<[vector2_float32][height_range][12.00 18.50]>");
  });
});
