import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type TmiSource } from "../../src/core/catalog/buildCatalog";
import type { Catalog } from "../../src/core/project/types";

// Opt-in LOCAL test — validates the whole pipeline against a REAL Aerofly FS 4 install.
// Auto-skipped when no install is found, so CI stays green and IPACS-free. Point it with
// AFS4_INSTALL=<install dir> to override the default Steam location.
const CANDIDATES = [
  process.env.AFS4_INSTALL,
  "D:/SteamLibrary/steamapps/common/Aerofly FS 4 Flight Simulator",
  "C:/Program Files (x86)/Steam/steamapps/common/Aerofly FS 4 Flight Simulator",
].filter((x): x is string => Boolean(x));

function findXref(): string | null {
  for (const base of CANDIDATES) {
    const x = path.join(base, "scenery", "xref");
    if (existsSync(x) && statSync(x).isDirectory()) return x;
  }
  return null;
}

function findTmi(root: string, out: string[] = []): string[] {
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) findTmi(full, out);
    else if (e.name.toLowerCase().endsWith(".tmi")) out.push(full);
  }
  return out;
}

const xref = findXref();

describe.skipIf(!xref)("real AFS4 install (local, opt-in)", () => {
  let catalog: Catalog;

  beforeAll(() => {
    const dir = xref as string;
    const sources: TmiSource[] = findTmi(dir).map((p) => ({
      path: p,
      source: "install",
      text: readFileSync(p, "utf8"),
    }));
    catalog = buildCatalog(sources, { installDir: dir, userXrefDir: null, scannedAt: "t" }).catalog;
  });

  it("catalogs exactly 911 objects across 7 bundles", () => {
    expect(catalog.xref).toHaveLength(911);
    expect(catalog.bundles).toHaveLength(7);
  });

  it("per-bundle counts match the known-good baseline", () => {
    const counts = Object.fromEntries(catalog.bundles.map((b) => [b.bundle, b.count]));
    expect(counts).toMatchObject({
      xref_airport: 259,
      xref_buildings: 250,
      xref_aircraft: 141,
      xref_vehicles: 80,
      xref_misc: 75,
      xref_generic: 68,
      xref_tap: 38,
    });
  });

  it("ACT cross-check: tower00_small_plates_ds_00_08_08 is 8.19 x 25.90 m", () => {
    const t = catalog.xref.find((o) => o.name === "tower00_small_plates_ds_00_08_08");
    expect(t).toBeDefined();
    expect(t!.size.x).toBeCloseTo(8.19, 2);
    expect(t!.size.z).toBeCloseTo(25.9, 2);
  });

  it("categorizes ≥95% of objects outside other/*", () => {
    const fb = catalog.xref.filter((o) => o.category.startsWith("other/")).length;
    expect(1 - fb / catalog.xref.length).toBeGreaterThanOrEqual(0.95);
  });
});
