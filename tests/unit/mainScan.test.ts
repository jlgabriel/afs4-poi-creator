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
