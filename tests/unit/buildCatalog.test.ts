import { describe, it, expect } from "vitest";
import { buildCatalog, type TmiSource } from "../../src/core/catalog/buildCatalog";
import { parseXrefTable } from "../../src/core/catalog/xrefTable";

const tmi = (filename: string, entries: string): string => `<[file][][]
  <[tmxglscene_info][][]
    <[string8][filename][${filename}]>
    ${entries}
  >
>`;

const entry = (name: string, bbMin: string, bbMax: string): string => `
    <[tmxglscene_info_entry][element][0]
      <[string8u][name][${name}]>
      <[vector3_float64][bb_min][${bbMin}]>
      <[vector3_float64][bb_max][${bbMax}]>
      <[float64][bs_radius][1.0]>
    >`;

describe("buildCatalog", () => {
  it("assembles a catalog with per-bundle counts, categories and rounded sizes", () => {
    const sources: TmiSource[] = [
      {
        path: "a/xref_test.tmi",
        source: "install",
        text: tmi(
          "xref_test",
          // synthetic name, but the ACT tower's exact bbox → proves the 8.19 x 25.90 size math
          entry("hangar_demo_ds_01", "-3.587511 -3.978786 -1.565422", "4.602168 4.010449 24.339308") +
            entry("mystery_thing", "0 0 0", "1 2 3"),
        ),
      },
    ];
    const { catalog, warnings } = buildCatalog(sources, {
      installDir: "X",
      userXrefDir: null,
      scannedAt: "2026-01-01T00:00:00Z",
    });

    expect(warnings).toEqual([]);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.xref).toHaveLength(2);
    expect(catalog.bundles[0]).toMatchObject({ bundle: "xref_test", count: 2, source: "install" });

    const hangar = catalog.xref.find((o) => o.name === "hangar_demo_ds_01");
    expect(hangar).toBeDefined();
    expect(hangar!.size).toEqual({ x: 8.19, y: 7.99, z: 25.9 });
    expect(hangar!.category).toBe("buildings/hangar");
    expect(hangar!.displayName).toBe("Hangar Demo");

    const mystery = catalog.xref.find((o) => o.name === "mystery_thing");
    expect(mystery!.category).toBe("other/xref_test");
  });

  it("keeps duplicate names across bundles (no dedupe — raw count is the headline)", () => {
    const dup = entry("dup_obj", "0 0 0", "1 1 1");
    const sources: TmiSource[] = [
      { path: "a.tmi", source: "install", text: tmi("xref_a", dup) },
      { path: "b.tmi", source: "install", text: tmi("xref_b", dup) },
    ];
    const { catalog } = buildCatalog(sources, { installDir: "X", userXrefDir: null, scannedAt: "t" });
    expect(catalog.xref).toHaveLength(2);
    expect(catalog.bundles.map((b) => b.bundle)).toEqual(["xref_a", "xref_b"]);
  });

  it("propagates parser warnings, tagged with the source path", () => {
    const sources: TmiSource[] = [
      { path: "bad.tmi", source: "install", text: tmi("xref_bad", entry("broken", "0 0", "1 1 1")) },
    ];
    const { catalog, warnings } = buildCatalog(sources, { installDir: "X", userXrefDir: null, scannedAt: "t" });
    expect(catalog.xref).toHaveLength(0);
    expect(warnings.join(" ")).toContain("bad.tmi");
    expect(warnings.join(" ")).toContain("broken");
  });
});

// The official `xref_table.csv` overlay (build-but-disabled until forum #114). Synthetic table only —
// invented names/values, real column grammar — so no IPACS bytes enter the repo.
describe("buildCatalog — official xref_table overlay", () => {
  const meta = { installDir: "X", userXrefDir: null, scannedAt: "t" };
  const overlayCsv = [
    "name internal;display name;main category;sub category;type category;length;width;height;offset;shape;shape truescale",
    // lowercase internal name (as in the real CSV); matches the mixed-case scanned name below
    "pct_liveried_jet;PCT Liveried Jet;Aircraft;Airliner;Jetliner;30;28;9;0 0 0;-1 -1;1 -1;1 1;-1 1;-1 -1;-9 -9;9 -9;9 9;-9 9;-9 -9",
  ].join("\n");
  // one matched object (mixed case → exercises the case-insensitive lookup) + one uncatalogued
  const installSources: TmiSource[] = [
    {
      path: "p/xref_planes.tmi",
      source: "install",
      text: tmi("xref_planes", entry("PCT_Liveried_Jet", "0 0 0", "1 2 3") + entry("uncatalogued_thing", "0 0 0", "1 1 1")),
    },
  ];

  it("overlays official displayName/taxonomy/footprint onto a matched install object", () => {
    const { catalog } = buildCatalog(installSources, meta, [], parseXrefTable(overlayCsv));
    const hit = catalog.xref.find((o) => o.name === "PCT_Liveried_Jet")!;
    expect(hit.official).toBe(true);
    expect(hit.displayName).toBe("PCT Liveried Jet");
    expect(hit.taxonomy).toEqual({ main: "Aircraft", sub: "Airliner", type: "Jetliner" });
    expect(hit.footprint).toEqual([
      [-9, -9],
      [9, -9],
      [9, 9],
      [-9, 9],
    ]);
    // bbox/size stay AUTHORITATIVE from the .tmi — the CSV's own dimensions are not merged in
    expect(hit.size).toEqual({ x: 1, y: 2, z: 3 });
    expect(catalog.xrefTable).toEqual({ rows: 1, matched: 1 });
  });

  it("leaves an unmatched object on the heuristic — no official fields", () => {
    const { catalog } = buildCatalog(installSources, meta, [], parseXrefTable(overlayCsv));
    const miss = catalog.xref.find((o) => o.name === "uncatalogued_thing")!;
    expect(miss.official).toBeUndefined();
    expect(miss.taxonomy).toBeUndefined();
    expect(miss.footprint).toBeUndefined();
    expect(miss.displayName).toBe("Uncatalogued Thing"); // heuristic label
  });

  it("never overlays a user-source object, even on a name collision (Q5 — user geometry is its own)", () => {
    const userSources: TmiSource[] = [
      { path: "u/xref_user.tmi", source: "user", text: tmi("xref_user", entry("PCT_Liveried_Jet", "0 0 0", "1 1 1")) },
    ];
    const { catalog } = buildCatalog(userSources, meta, [], parseXrefTable(overlayCsv));
    const u = catalog.xref[0];
    expect(u.source).toBe("user");
    expect(u.official).toBeUndefined();
    expect(u.displayName).toBe("PCT Liveried Jet"); // heuristic happens to match here — but NOT official
    expect(catalog.xrefTable).toEqual({ rows: 1, matched: 0 });
  });

  it("degradation contract: buildCatalog(…, null) is byte-identical to the 3-arg call", () => {
    const three = buildCatalog(installSources, meta, []);
    const four = buildCatalog(installSources, meta, [], null);
    expect(four).toEqual(three);
    expect(four.catalog.xrefTable).toBeUndefined();
    for (const o of four.catalog.xref) {
      expect(o.official).toBeUndefined();
      expect(o.footprint).toBeUndefined();
      expect(o.taxonomy).toBeUndefined();
    }
  });
});

// Loose user `.tmb` → `unregistered` catalog objects (design B2). Synthetic `.tmb` fixtures — invented
// names, the real plain-text grammar (scene → geometry_list → tmxglgeometry(name, matrix, mesh_collision)).
describe("buildCatalog — loose user .tmb (unregistered)", () => {
  const meta = { installDir: "X", userXrefDir: "U", scannedAt: "t" };
  const IDENTITY = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";
  const meshGeom = (name: string, points: string): string =>
    `            <[tmxglgeometry][element][0]
                <[string8u][name][${name}]>
                <[matrix4_float64][matrix][${IDENTITY}]>
                <[tmxglmesh][mesh_collision][]
                    <[list_vector3_float32][point_list][${points}]>
                >
            >`;
  const userTmb = (...g: string[]): string =>
    `<[file][][]
    <[tmxglscene][][]
        <[pointer_list_tmxglgeometry][geometry_list][]
${g.join("\n")}
        >
    >
>`;

  it("makes one unregistered object per geometry of a plain-text .tmb, with real bbox", () => {
    const { catalog, warnings } = buildCatalog([], meta, [], null, [
      { base: "pct_userbundle", text: userTmb(meshGeom("pct_userobj", "(-1 -2 0) (1 2 3)")) },
    ]);
    expect(warnings).toEqual([]);
    expect(catalog.xref).toHaveLength(1);
    const o = catalog.xref[0];
    expect(o).toMatchObject({
      name: "pct_userobj",
      bundle: "pct_userbundle",
      source: "user",
      category: "user/pct_userbundle",
      displayName: "Pct Userobj",
      unregistered: true,
    });
    expect(o.bbMin).toEqual([-1, -2, 0]);
    expect(o.bbMax).toEqual([1, 2, 3]);
    expect(o.size).toEqual({ x: 2, y: 4, z: 3 });
    expect(o.sizeUnknown).toBeUndefined();
    expect(o.official).toBeUndefined(); // user source is never overlaid (Q5)
  });

  it("makes a single sizeUnknown placeholder for an opaque .tmb (text:null)", () => {
    const { catalog } = buildCatalog([], meta, [], null, [{ base: "opaque_obj", text: null }]);
    expect(catalog.xref).toHaveLength(1);
    expect(catalog.xref[0]).toMatchObject({
      name: "opaque_obj",
      source: "user",
      unregistered: true,
      sizeUnknown: true,
    });
    expect(catalog.xref[0].bbMax).toEqual([0, 0, 0]);
    expect(catalog.xref[0].size).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("degrades a text .tmb with no derivable geometry to a sizeUnknown placeholder + warning", () => {
    const { catalog, warnings } = buildCatalog([], meta, [], null, [
      { base: "empty_obj", text: "<[file][][]\n    <[tmxglscene][][]>\n>" }, // valid tree, no tmxglgeometry
    ]);
    expect(catalog.xref).toHaveLength(1);
    expect(catalog.xref[0].sizeUnknown).toBe(true);
    expect(warnings.join(" ")).toContain("tmxglgeometry");
  });

  it("warns when a loose .tmb geometry collides with a built-in name (both kept, no dedupe)", () => {
    const install: TmiSource[] = [
      { path: "i.tmi", source: "install", text: tmi("xref_i", entry("shared_name", "0 0 0", "1 1 1")) },
    ];
    const { catalog, warnings } = buildCatalog(install, meta, [], null, [
      { base: "user_pack", text: userTmb(meshGeom("shared_name", "(0 0 0) (2 2 2)")) },
    ]);
    expect(catalog.xref).toHaveLength(2);
    expect(warnings.join(" ")).toContain("shares a built-in's name");
  });

  it("no loose .tmb → catalog identical to the call without userTmbs (no-regression)", () => {
    const install: TmiSource[] = [
      { path: "i.tmi", source: "install", text: tmi("xref_i", entry("plain_obj", "0 0 0", "1 1 1")) },
    ];
    expect(buildCatalog(install, meta, [], null, [])).toEqual(buildCatalog(install, meta, [], null));
    expect(buildCatalog(install, meta, [], null).catalog.xref.every((o) => !o.unregistered)).toBe(true);
  });
});
