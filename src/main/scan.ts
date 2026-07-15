// scan.ts — main-process XREF scan. Reads the install's (and optional user's) scenery/xref .tmi
// files and builds the catalog via the pure core, then caches it as catalog.json in userData.
// No Electron import (paths passed in) so it unit-tests without a running app; the same
// buildCatalog the M0 CLI validated at 911 objects produces the result here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type BuildResult, type TmiSource } from "../core/catalog/buildCatalog";
import { buildAirportLights, type AirportLightFile } from "../core/catalog/airportLights";
import type { XrefTable } from "../core/catalog/xrefTable";
import type { Catalog } from "../core/project/types";
import { findTmb, findTmi, resolveAirportLightsDir, resolveXrefDir } from "./afs4Paths";

/** Thrown when the given install dir has no scenery/xref with .tmi files. */
export class NoXrefError extends Error {
  constructor(readonly installDir: string) {
    super(`No scenery/xref with .tmi files under: ${installDir}`);
    this.name = "NoXrefError";
  }
}

/** Read + parse an install's (and optional user's) XREF into a Catalog. `scannedAt` is injectable
 *  for deterministic tests. `table` is the optional official-CSV overlay (null = disabled, the shipping
 *  default; ipc.ts loads it from the injected candidates). Throws NoXrefError if the install has no
 *  scenery/xref. */
export function scanXref(
  installDir: string,
  userDir: string | null,
  scannedAt: string = new Date().toISOString(),
  table: XrefTable | null = null,
): BuildResult {
  const xrefDir = resolveXrefDir(installDir);
  if (!xrefDir) throw new NoXrefError(installDir);

  const sources: TmiSource[] = findTmi(xrefDir).map((p) => ({
    path: p,
    source: "install",
    text: readFileSync(p, "utf8"),
  }));

  if (userDir) {
    const userXref = resolveXrefDir(userDir);
    if (userXref) {
      for (const p of findTmi(userXref)) {
        sources.push({ path: p, source: "user", text: readFileSync(p, "utf8") });
      }
    }
  }

  // v0.2 airport lights: enumerate airport_lights/**/*.tmb from the INSTALL — filenames only, no bytes
  // read (the .tmb is opaque IPACS binary). type_name = basename minus "al_"; see core/catalog/airportLights.
  const airportLightFiles: AirportLightFile[] = [];
  const alDir = resolveAirportLightsDir(installDir);
  if (alDir) {
    for (const p of findTmb(alDir)) {
      airportLightFiles.push({ folder: path.basename(path.dirname(p)), base: path.basename(p, ".tmb") });
    }
  }
  const { lights, warnings: lightWarnings } = buildAirportLights(airportLightFiles);

  const result = buildCatalog(sources, { installDir, userXrefDir: userDir, scannedAt }, lights, table);
  result.warnings.push(...lightWarnings);
  return result;
}

const cacheFile = (userDataDir: string): string => path.join(userDataDir, "catalog.json");

/** Cache a scanned catalog to userData/catalog.json (git-ignored, never shipped). Returns its path. */
export function writeCatalogCache(userDataDir: string, catalog: Catalog): string {
  const file = cacheFile(userDataDir);
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(catalog), "utf8");
  return file;
}

/** Read the cached catalog, or null if absent/corrupt (caller then triggers a fresh scan). */
export function readCatalogCache(userDataDir: string): Catalog | null {
  const file = cacheFile(userDataDir);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw?.schemaVersion === 1 && Array.isArray(raw?.xref)) return raw as Catalog;
  } catch {
    /* corrupt cache → treat as absent */
  }
  return null;
}
