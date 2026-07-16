// buildCatalog.ts — TmiSource[] → Catalog. Pure: text in, typed catalog out.
// Keeps ALL entries (no dedupe): the raw per-bundle sum is the headline 911 count. Duplicate
// handling for the browse UI (source:user wins) is a renderer concern (design §2.1), not here.

import { parseTmi } from "./tmiParser";
import { categorize, displayName } from "./categorize";
import { lookupXref, type XrefTable } from "./xrefTable";
import { parseUserTmb } from "./userTmb";
import type { Catalog, CatalogAirportLight, CatalogObject, BundleInfo, Vec3 } from "../project/types";

export interface TmiSource {
  path: string;
  source: "install" | "user";
  text: string;
}

/** One unregistered user `.tmb` the scan shell hands to buildCatalog (design B2). `text` is the full
 *  plain-text body for an AC3D-exported `.tmb`; null for an OPAQUE (IPACS-compiled) one the scan
 *  classified by its first byte and deliberately did NOT read in full. Passed as data (not a filesystem
 *  read here) so buildCatalog stays pure.
 *
 *  `bundle` and `base` differ, and must: the unit of registration is the FOLDER (one `.tmi` per folder,
 *  named after it — see scan.listUserTmb), so N `.tmb` in one folder share a bundle while each keeps its
 *  own basename. v0.3.0 had a single `base` for both, which only held because it looked at the xref root
 *  alone, where every `.tmb` is its own bundle (forum #122). */
export interface UserTmbInput {
  base: string; // the `.tmb`'s own basename — the object NAME fallback when the file is opaque
  bundle: string; // the bundle it belongs to: its folder, or its own base when loose at the xref root
  text: string | null; // full text for a plain-text `.tmb`; null = opaque (not read)
}

export interface BuildResult {
  catalog: Catalog;
  warnings: string[];
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** One `unregistered` catalog object for a user `.tmb`. Opaque `.tmb` (sizeUnknown) carry a zero
 *  bbox — the filename is all PCT can read. Never overlaid (source:"user"; see the buildCatalog merge). */
function userXrefObject(name: string, bundle: string, bbMin: Vec3, bbMax: Vec3, opaque: boolean): CatalogObject {
  const obj: CatalogObject = {
    name,
    bundle,
    source: "user",
    bbMin,
    bbMax,
    bsRadius: opaque ? 0 : Math.hypot(bbMax[0] - bbMin[0], bbMax[1] - bbMin[1], bbMax[2] - bbMin[2]) / 2,
    size: { x: round2(bbMax[0] - bbMin[0]), y: round2(bbMax[1] - bbMin[1]), z: round2(bbMax[2] - bbMin[2]) },
    category: `user/${bundle}`,
    displayName: displayName(name),
    act: false,
    unregistered: true,
  };
  if (opaque) obj.sizeUnknown = true;
  return obj;
}

export function buildCatalog(
  sources: TmiSource[],
  meta: { installDir: string; userXrefDir: string | null; scannedAt: string },
  airportLights: CatalogAirportLight[] = [],
  // Optional official-table overlay (build-but-disabled until forum #114 — see xrefTable.ts /
  // docs/XREF_TABLE_CSV_DECISION.md). null = the shipping default: pure heuristic, output byte-identical
  // to before. The overlay is STRICTLY ADDITIVE and consulted only per scanned install-source entry —
  // it never iterates the table, so it can't add objects the scan didn't find.
  table: XrefTable | null = null,
  // Loose user `.tmb` (design B2): objects a user dropped in scenery/xref that aren't yet resolvable from
  // a POI (they need a generated `.tmi` in their own subfolder). The scan shell enumerates + classifies
  // them; here they become `unregistered` catalog objects the UI can offer to register.
  userTmbs: UserTmbInput[] = [],
): BuildResult {
  const warnings: string[] = [];
  const bundles: BundleInfo[] = [];
  const xref: CatalogObject[] = [];
  let matched = 0; // scanned names that hit an official row (for the catalog's overlay stamp)
  const installNames = new Set<string>(); // built-in names, to flag a loose `.tmb` that collides

  for (const src of sources) {
    const { bundle, entries, warnings: w } = parseTmi(src.text);
    for (const msg of w) warnings.push(`[${src.path}] ${msg}`);
    bundles.push({ bundle, source: src.source, path: src.path, count: entries.length });

    for (const e of entries) {
      if (src.source === "install") installNames.add(e.name);
      // A user's own object browses under `user/<bundle>` whether or not it is registered yet —
      // the same category `userXrefObject` (below) gives it while it is still a loose `.tmb`. So
      // registering only clears the `unregistered` badge; the object never MOVES in the tree, and a
      // category selected before hitting Register still exists after it.
      //
      // `categorize` only describes IPACS's built-ins, so it can't say anything true about a user
      // object: it either buries it in `other/<bundle>`, or — on a name collision — files it under
      // the built-in's category, scattering the user's library through 855 objects that aren't
      // theirs. Same reasoning as the overlay guard below: the names may collide, the geometry is
      // the user's own. `act` (present in the curated table) is false for the same reason.
      const isUser = src.source === "user";
      const builtin = categorize(e.name, bundle);
      const category = isUser ? `user/${bundle}` : builtin.category;
      const act = isUser ? false : builtin.act;
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

  // Unregistered user `.tmb` → `unregistered` objects. A plain-text `.tmb` yields one object per geometry
  // (real bbox); an opaque one — or a text one with no derivable bbox — becomes a single sizeUnknown
  // placeholder named after the FILE (its geometry name is exactly what PCT could not read).
  for (const u of userTmbs) {
    if (u.text !== null) {
      const { geometries, warnings: uw } = parseUserTmb(u.text);
      for (const msg of uw) warnings.push(`[user:${u.base}.tmb] ${msg}`);
      if (geometries.length > 0) {
        for (const g of geometries) {
          if (installNames.has(g.name)) {
            warnings.push(
              `[user:${u.base}.tmb] geometry '${g.name}' shares a built-in's name — the user object wins in the browse list`,
            );
          }
          xref.push(userXrefObject(g.name, u.bundle, g.bbMin, g.bbMax, false));
        }
        continue;
      }
      // text-class but nothing derivable → fall through to the opaque placeholder
    }
    xref.push(userXrefObject(u.base, u.bundle, [0, 0, 0], [0, 0, 0], true));
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
