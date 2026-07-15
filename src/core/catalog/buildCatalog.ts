// buildCatalog.ts — TmiSource[] → Catalog. Pure: text in, typed catalog out.
// Keeps ALL entries (no dedupe): the raw per-bundle sum is the headline 911 count. Duplicate
// handling for the browse UI (source:user wins) is a renderer concern (design §2.1), not here.

import { parseTmi } from "./tmiParser";
import { categorize, displayName } from "./categorize";
import { lookupXref, type XrefTable } from "./xrefTable";
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
  // Optional official-table overlay (build-but-disabled until forum #114 — see xrefTable.ts /
  // docs/XREF_TABLE_CSV_DECISION.md). null = the shipping default: pure heuristic, output byte-identical
  // to before. The overlay is STRICTLY ADDITIVE and consulted only per scanned install-source entry —
  // it never iterates the table, so it can't add objects the scan didn't find.
  table: XrefTable | null = null,
): BuildResult {
  const warnings: string[] = [];
  const bundles: BundleInfo[] = [];
  const xref: CatalogObject[] = [];
  let matched = 0; // scanned names that hit an official row (for the catalog's overlay stamp)

  for (const src of sources) {
    const { bundle, entries, warnings: w } = parseTmi(src.text);
    for (const msg of w) warnings.push(`[${src.path}] ${msg}`);
    bundles.push({ bundle, source: src.source, path: src.path, count: entries.length });

    for (const e of entries) {
      const { category, act } = categorize(e.name, bundle);
      // Overlay only install-source objects: a user `.tmb` sharing a built-in's name must not inherit
      // that built-in's official metadata (the names collide but the geometry is the user's own).
      const official = src.source === "install" ? lookupXref(table, e.name) : null;
      const obj: CatalogObject = {
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
        category, // NOT replaced this phase: the curated 29-category tree stays the source of the browse
        //           tree/icons; the official taxonomy rides along as metadata (obj.taxonomy) so wiring
        //           it into categories is a later UI call, not baked in here.
        displayName: official ? official.displayName : displayName(e.name),
        act,
      };
      if (official) {
        matched++;
        obj.official = true;
        obj.taxonomy = official.taxonomy;
        if (official.footprint) obj.footprint = official.footprint;
      }
      xref.push(obj);
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
  if (table) catalog.xrefTable = { rows: table.rows, matched };
  return { catalog, warnings };
}
