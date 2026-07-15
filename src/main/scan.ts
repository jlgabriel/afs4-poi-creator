// scan.ts — main-process XREF scan. Reads the install's (and optional user's) scenery/xref .tmi
// files and builds the catalog via the pure core, then caches it as catalog.json in userData.
// No Electron import (paths passed in) so it unit-tests without a running app; the same
// buildCatalog the M0 CLI validated at 911 objects produces the result here.
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type BuildResult, type TmiSource, type UserTmbInput } from "../core/catalog/buildCatalog";
import { buildAirportLights, type AirportLightFile } from "../core/catalog/airportLights";
import { isTextTmb } from "../core/catalog/userTmb";
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

/** Read the first `n` bytes of a file as UTF-8 — enough to classify a `.tmb` by its head (plain-text
 *  `<` vs opaque `0xB5`) WITHOUT decoding a multi-MB binary in full. */
function readHead(file: string, n = 512): string {
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(n);
    const bytes = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, bytes).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/** Enumerate ROOT-level `.tmb` in the user's scenery/xref (NON-recursive, by design): a `.tmb` sitting
 *  inside a subfolder alongside a `.tmi` is a registered bundle already read via the `.tmi` path, so we
 *  only surface the loose ones at the root. Classify each by its first byte — read a plain-text `.tmb`
 *  in full (buildCatalog derives its geometry), leave an opaque one unread (text:null → sizeUnknown). */
function listLooseTmb(xrefRoot: string): UserTmbInput[] {
  let entries;
  try {
    entries = readdirSync(xrefRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: UserTmbInput[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".tmb")) continue;
    const full = path.join(xrefRoot, e.name);
    const base = path.basename(e.name, path.extname(e.name));
    out.push({ base, text: isTextTmb(readHead(full)) ? readFileSync(full, "utf8") : null });
  }
  return out;
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

  const userTmbs: UserTmbInput[] = [];
  if (userDir) {
    const userXref = resolveXrefDir(userDir);
    if (userXref) {
      for (const p of findTmi(userXref)) {
        sources.push({ path: p, source: "user", text: readFileSync(p, "utf8") });
      }
      userTmbs.push(...listLooseTmb(userXref)); // loose (unregistered) user `.tmb` at the xref root
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

  const result = buildCatalog(sources, { installDir, userXrefDir: userDir, scannedAt }, lights, table, userTmbs);
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
