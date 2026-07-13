// buildCatalog.ts — TmiSource[] → Catalog. Pure: text in, typed catalog out.
// Keeps ALL entries (no dedupe): the raw per-bundle sum is the headline 911 count. Duplicate
// handling for the browse UI (source:user wins) is a renderer concern (design §2.1), not here.

import { parseTmi } from "./tmiParser";
import { categorize, displayName } from "./categorize";
import type { Catalog, CatalogAirportLight, CatalogObject, BundleInfo } from "../project/types";

export interface TmiSource {
  path: string;
  source: "install" | "user";
  text: string;
}

export interface BuildResult {
  catalog: Catalog;
  warnings: string[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function buildCatalog(
  sources: TmiSource[],
  meta: { installDir: string; userXrefDir: string | null; scannedAt: string },
  airportLights: CatalogAirportLight[] = [],
): BuildResult {
  const warnings: string[] = [];
  const bundles: BundleInfo[] = [];
  const xref: CatalogObject[] = [];

  for (const src of sources) {
    const { bundle, entries, warnings: w } = parseTmi(src.text);
    for (const msg of w) warnings.push(`[${src.path}] ${msg}`);
    bundles.push({ bundle, source: src.source, path: src.path, count: entries.length });

    for (const e of entries) {
      const { category, act } = categorize(e.name, bundle);
      xref.push({
        name: e.name,
        bundle,
        source: src.source,
        bbMin: e.bbMin,
        bbMax: e.bbMax,
        bsRadius: e.bsRadius,
        size: {
          x: round2(e.bbMax[0] - e.bbMin[0]),
          y: round2(e.bbMax[1] - e.bbMin[1]),
          z: round2(e.bbMax[2] - e.bbMin[2]),
        },
        category,
        displayName: displayName(e.name),
        act,
      });
    }
  }

  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: meta.scannedAt,
    installDir: meta.installDir,
    userXrefDir: meta.userXrefDir,
    bundles,
    xref,
    plants: [],
    airportLights,
    animated: [],
  };
  return { catalog, warnings };
}
