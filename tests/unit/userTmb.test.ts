import { describe, it, expect } from "vitest";
import { parseUserTmb, isTextTmb } from "../../src/core/catalog/userTmb";
import { buildTmi } from "../../src/core/export/tmiWriter";
import { parseTmi } from "../../src/core/catalog/tmiParser";

// All fixtures synthetic — invented names, no pylon/IPACS bytes (guardrail #8). Real-file validation
// is the opt-in LOCAL test. Shape mirrors the real plain-text .tmb: scene → geometry_list →
// tmxglgeometry(name, matrix, mesh_collision.point_list).
const IDENTITY = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";

function meshGeom(name: string, points: string, matrix = IDENTITY): string {
  return `            <[tmxglgeometry][element][0]
                <[string8u][name][${name}]>
                <[matrix4_float64][matrix][${matrix}]>
                <[tmxglmesh][mesh_collision][]
                    <[list_vector3_float32][point_list][${points}]>
                >
            >`;
}

function tmb(...geometries: string[]): string {
  return `<[file][][]
    <[tmxglscene][][]
        <[pointer_list_tmxglgeometry][geometry_list][]
${geometries.join("\n")}
        >
    >
>`;
}

describe("parseUserTmb — plain-text .tmb → geometries", () => {
  it("extracts the internal name + bbox from mesh_collision.point_list", () => {
    const { geometries, warnings } = parseUserTmb(tmb(meshGeom("pct_fixture_obj", "(-1 -2 0) (1 2 3) (0.5 0.5 1)")));
    expect(warnings).toEqual([]);
    expect(geometries).toEqual([{ name: "pct_fixture_obj", bbMin: [-1, -2, 0], bbMax: [1, 2, 3] }]);
  });

  it("returns one geometry per tmxglgeometry (N → N)", () => {
    const { geometries } = parseUserTmb(tmb(meshGeom("obj_a", "(0 0 0) (1 1 1)"), meshGeom("obj_b", "(0 0 0) (2 4 6)")));
    expect(geometries.map((g) => g.name)).toEqual(["obj_a", "obj_b"]);
    expect(geometries[1].bbMax).toEqual([2, 4, 6]);
  });

  it("skips a geometry with an empty name, keeps the rest", () => {
    const { geometries, warnings } = parseUserTmb(tmb(meshGeom("", "(0 0 0) (1 1 1)"), meshGeom("ok", "(0 0 0) (1 1 1)")));
    expect(geometries.map((g) => g.name)).toEqual(["ok"]);
    expect(warnings.join(" ")).toContain("empty name");
  });

  it("skips a geometry with a non-identity matrix (bbox would be offset)", () => {
    const { geometries, warnings } = parseUserTmb(tmb(meshGeom("scaled", "(0 0 0) (1 1 1)", "2 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1")));
    expect(geometries).toEqual([]);
    expect(warnings.join(" ")).toContain("matrix");
  });

  it("skips a geometry with no mesh_collision/point_list", () => {
    const noMesh = `            <[tmxglgeometry][element][0]
                <[string8u][name][flat]>
                <[matrix4_float64][matrix][${IDENTITY}]>
            >`;
    const { geometries, warnings } = parseUserTmb(tmb(noMesh));
    expect(geometries).toEqual([]);
    expect(warnings.join(" ")).toContain("mesh_collision");
  });

  it("degrades (no throw) on a garbage file → empty geometries + warning", () => {
    const { geometries, warnings } = parseUserTmb("not a .tmb <<<");
    expect(geometries).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("degrades on a valid tag tree with no tmxglgeometry", () => {
    const { geometries, warnings } = parseUserTmb("<[file][][]\n    <[tmxglscene][][]>\n>");
    expect(geometries).toEqual([]);
    expect(warnings.join(" ")).toContain("tmxglgeometry");
  });

  it("treats a leading BOM as text (strips it before parsing)", () => {
    expect(parseUserTmb("﻿" + tmb(meshGeom("bom_obj", "(0 0 0) (1 1 1)"))).geometries[0].name).toBe("bom_obj");
  });

  it("feeds buildTmi directly (structural TmiEntrySpec) → round-trips through parseTmi", () => {
    const { geometries } = parseUserTmb(tmb(meshGeom("pipe_obj", "(-2 -2 0) (2 2 10)")));
    const { entries } = parseTmi(buildTmi("pct_fixture_bundle", geometries));
    expect(entries[0].name).toBe("pipe_obj");
    expect(entries[0].bbMin).toEqual([-2, -2, 0]);
    expect(entries[0].bbMax).toEqual([2, 2, 10]);
  });

  it("extracts referenced texture names from material_list/texture_list (→ <name>.ttx to copy)", () => {
    const withTex = `<[file][][]
    <[tmxglscene][][]
        <[list_tmxglmaterial][material_list][]
            <[tmxglmaterial][element][0]
                <[list_tm_tmtexture_index_pair][texture_list][]
                    <[tm_tmtexture_index_pair][element][0]
                        <[string8u][channel][diffuse]>
                        <[string8][name][pct_tex]>
                    >
                >
            >
        >
        <[pointer_list_tmxglgeometry][geometry_list][]
${meshGeom("pct_obj", "(0 0 0) (1 1 1)")}
        >
    >
>`;
    const { geometries, textures } = parseUserTmb(withTex);
    expect(geometries.map((g) => g.name)).toEqual(["pct_obj"]);
    expect(textures).toEqual(["pct_tex"]);
  });

  it("reports an empty texture list for an untextured .tmb", () => {
    expect(parseUserTmb(tmb(meshGeom("plain", "(0 0 0) (1 1 1)"))).textures).toEqual([]);
  });
});

describe("isTextTmb — first-byte discriminator", () => {
  it("true for the plain-text grammar, tolerating BOM + leading whitespace", () => {
    expect(isTextTmb("<[file][][]")).toBe(true);
    expect(isTextTmb("﻿<[file]")).toBe(true);
    expect(isTextTmb("  \n\t<[file]")).toBe(true);
  });
  it("false for compiled/binary or empty input", () => {
    expect(isTextTmb("µþ$Ç")).toBe(false); // the real box.tmb starts 0xB5 0xFE 0x24 0xC7
    expect(isTextTmb("")).toBe(false);
    expect(isTextTmb("plain text no bracket")).toBe(false);
  });
});
