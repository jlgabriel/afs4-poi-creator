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
