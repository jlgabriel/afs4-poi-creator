import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NoXrefError, readCatalogCache, scanXref, writeCatalogCache } from "../../src/main/scan";
import type { Catalog } from "../../src/core/project/types";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-scan-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeTmi(rel: string, text = ""): void {
  const full = path.join(tmp, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, text);
}

describe("scanXref", () => {
  it("wires xref discovery → buildCatalog (installDir + scannedAt carried through)", () => {
    writeTmi("scenery/xref/empty.tmi", "");
    const { catalog } = scanXref(tmp, null, "2026-07-07T00:00:00.000Z");
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.installDir).toBe(tmp);
    expect(catalog.scannedAt).toBe("2026-07-07T00:00:00.000Z");
    expect(catalog.bundles.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(catalog.xref)).toBe(true);
  });
  it("throws NoXrefError when the install has no scenery/xref", () => {
    expect(() => scanXref(tmp, null)).toThrow(NoXrefError);
  });

  it("surfaces loose user .tmb at the xref root as unregistered (text→real bbox, opaque→sizeUnknown)", () => {
    writeTmi("scenery/xref/xref_install.tmi", ""); // the install still needs a scenery/xref
    const userXref = path.join(tmp, "user", "scenery", "xref");
    mkdirSync(userXref, { recursive: true });
    const plain = `<[file][][]
    <[tmxglscene][][]
        <[pointer_list_tmxglgeometry][geometry_list][]
            <[tmxglgeometry][element][0]
                <[string8u][name][pct_widget]>
                <[matrix4_float64][matrix][1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1]>
                <[tmxglmesh][mesh_collision][]
                    <[list_vector3_float32][point_list][(0 0 0) (3 5 7)]>
                >
            >
        >
    >
>`;
    writeFileSync(path.join(userXref, "pct_widget.tmb"), plain);
    // opaque/binary .tmb — first byte 0xB5, like the real IPACS box → classified without a full read
    writeFileSync(path.join(userXref, "opaque_thing.tmb"), Buffer.from([0xb5, 0xfe, 0x24, 0xc7, 0x00, 0x01]));

    const { catalog } = scanXref(tmp, path.join(tmp, "user"), "t");
    expect(catalog.xref).toHaveLength(2);
    expect(catalog.xref.every((o) => o.unregistered && o.source === "user")).toBe(true);

    const widget = catalog.xref.find((o) => o.name === "pct_widget");
    expect(widget?.sizeUnknown).toBeUndefined();
    expect(widget?.size).toEqual({ x: 3, y: 5, z: 7 });

    const opaque = catalog.xref.find((o) => o.name === "opaque_thing");
    expect(opaque?.sizeUnknown).toBe(true);
    expect(opaque?.bbMax).toEqual([0, 0, 0]);
  });

  // ── #122: the layout a real add-on ZIP extracts to. v0.3.0 walked the xref ROOT only, so a normally
  //    installed object was invisible and the whole register flow could never fire. ──
  const userTmbText = (name: string, points: string): string => `<[file][][]
    <[tmxglscene][][]
        <[pointer_list_tmxglgeometry][geometry_list][]
            <[tmxglgeometry][element][0]
                <[string8u][name][${name}]>
                <[matrix4_float64][matrix][1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1]>
                <[tmxglmesh][mesh_collision][]
                    <[list_vector3_float32][point_list][${points}]>
                >
            >
        >
    >
>`;

  it("#122: surfaces .tmb from a SUBFOLDER with no .tmi, bundled under the folder name", () => {
    writeTmi("scenery/xref/xref_install.tmi", "");
    const userXref = path.join(tmp, "user", "scenery", "xref");
    const pack = path.join(userXref, "xref_air_race_pylons");
    mkdirSync(pack, { recursive: true });
    writeFileSync(path.join(pack, "pylon_15m.tmb"), userTmbText("pylon_15m", "(0 0 0) (2 2 15)"));
    writeFileSync(path.join(pack, "pylon_30m.tmb"), userTmbText("pylon_30m", "(0 0 0) (3 3 30)"));

    const { catalog } = scanXref(tmp, path.join(tmp, "user"), "t");
    expect(catalog.xref.map((o) => o.name).sort()).toEqual(["pylon_15m", "pylon_30m"]);
    expect(catalog.xref.every((o) => o.unregistered && o.bundle === "xref_air_race_pylons")).toBe(true);
    expect(catalog.xref.find((o) => o.name === "pylon_30m")?.size).toEqual({ x: 3, y: 3, z: 30 });
  });

  it("#122: a subfolder WITH a .tmi is read through the .tmi, never doubled as unregistered", () => {
    writeTmi("scenery/xref/xref_install.tmi", "");
    const userXref = path.join(tmp, "user", "scenery", "xref");
    const pack = path.join(userXref, "xref_air_race");
    mkdirSync(pack, { recursive: true });
    writeFileSync(path.join(pack, "pylon_15m.tmb"), userTmbText("pylon_15m", "(0 0 0) (2 2 15)"));
    // its real index — the bundle is already resolvable, so the .tmb must NOT surface again
    writeFileSync(
      path.join(pack, "xref_air_race.tmi"),
      `<[file][][]
    <[tmxglscene_info][][]
        <[string8][filename][xref_air_race]>
        <[list_tmxglscene_info_entry][geometries][]
            <[tmxglscene_info_entry][element][0]
                <[string8u][name][pylon_15m]>
                <[vector3_float64][bb_min][0.0 0.0 0.0]>
                <[vector3_float64][bb_max][2.0 2.0 15.0]>
                <[vector3_float64][bs_center][1.0 1.0 7.5]>
                <[float64][bs_radius][7.6]>
            >
        >
    >
>`,
    );

    const { catalog } = scanXref(tmp, path.join(tmp, "user"), "t");
    expect(catalog.xref).toHaveLength(1); // exactly one — not one from the .tmi plus one from the .tmb
    expect(catalog.xref[0].name).toBe("pylon_15m");
    expect(catalog.xref[0].unregistered).toBeUndefined();
  });
});

describe("catalog cache", () => {
  const fakeCatalog = (): Catalog => ({
    schemaVersion: 1,
    scannedAt: "t",
    installDir: "i",
    userXrefDir: null,
    bundles: [],
    xref: [],
    plants: [],
    airportLights: [],
    animated: [],
  });
  it("writes then reads back an equal catalog", () => {
    writeCatalogCache(tmp, fakeCatalog());
    expect(readCatalogCache(tmp)).toEqual(fakeCatalog());
  });
  it("returns null when absent or corrupt", () => {
    expect(readCatalogCache(path.join(tmp, "nope"))).toBeNull();
    writeFileSync(path.join(tmp, "catalog.json"), "{ not json");
    expect(readCatalogCache(tmp)).toBeNull();
  });
});
