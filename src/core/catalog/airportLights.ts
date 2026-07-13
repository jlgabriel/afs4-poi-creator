// airportLights.ts — enumerate the AFS4 airport-light library into CatalogAirportLight[] (v0.2).
// PURE: filenames in, typed catalog out. Unlike the xref catalog there is NOTHING TO PARSE — we
// never open the `.tmb` (opaque IPACS binary), so PCT ships zero proprietary bytes here. The whole
// "scan" is name derivation: `<install>/airport_lights/al_<type>/al_<type>[…].tmb` → type_name is
// the `.tmb` basename minus the `al_` prefix, which is exactly the string8u a POI `.toc` writes.
//
// Two evidence-backed rules (Fable, cross-checked against Juan's install + the canonical examples):
//   • EXCLUDE `*_model` — al_center_line_light ships a companion `..._model.tmb` (the visible-mesh
//     helper), absent from the format bible's name list and used 0× in the examples.
//   • INCLUDE `runway_edge_light` — present in the install and used 40× in examples, yet MISSING from
//     the bible's list. The scan is ground truth, not the doc (same lesson as the `.tmi` scan).
// The 15 install folders yield 23 `.tmb`; after the `_model` exclusion, 22 placeable type_names.

import type { CatalogAirportLight } from "../project/types";

/** One enumerated `.tmb` fixture file (no bytes — just its location). */
export interface AirportLightFile {
  folder: string; // parent dir name, e.g. "al_runway_edge_light"
  base: string; // the .tmb filename WITHOUT extension, e.g. "al_runway_edge_light"
}

export interface AirportLightBuildResult {
  lights: CatalogAirportLight[];
  warnings: string[];
}

const AL_PREFIX = "al_";

/** Display taxonomy for the lights catalog tree. First match wins; `runway_approach_` is tested
 *  before `runway_` (approach names also start with "runway_"). */
function lightCategory(typeName: string): string {
  if (typeName.startsWith("helipad_")) return "lights/helipad";
  if (typeName.startsWith("papi_")) return "lights/papi";
  if (typeName.startsWith("runway_approach_")) return "lights/approach";
  if (typeName.startsWith("taxiway_")) return "lights/taxiway";
  if (typeName.startsWith("runway_") || typeName.startsWith("center_line_light")) return "lights/runway";
  return "lights/other";
}

/** Pretty label: underscores → spaces, title-cased, digits KEPT (unlike categorize.displayName,
 *  which strips trailing numbers — here `runway_approach_light_center_1` vs `_2` are distinct
 *  fixtures, so the number is meaningful). e.g. "runway_edge_light" → "Runway Edge Light". */
function lightDisplayName(typeName: string): string {
  return typeName
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

/** Derive the airport-light catalog from enumerated `.tmb` files. Output is sorted by `typeName`
 *  so catalog.json diffs and golden fixtures stay stable regardless of readdir order. */
export function buildAirportLights(files: AirportLightFile[]): AirportLightBuildResult {
  const warnings: string[] = [];
  const lights: CatalogAirportLight[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    let typeName: string;
    if (f.base.startsWith(AL_PREFIX)) {
      typeName = f.base.slice(AL_PREFIX.length);
    } else {
      // Tolerance contract (M0 acceptance #4): an unexpected basename is INCLUDED verbatim + warned,
      // never silently lost — and the sim skips an unknown type_name anyway, so inclusion is low-harm.
      typeName = f.base;
      warnings.push(`airport light "${f.base}" (${f.folder}) has no "al_" prefix — included verbatim`);
    }
    if (/_model$/.test(typeName)) continue; // the non-fixture mesh helper — exclude the family
    if (seen.has(typeName)) continue; // de-dupe defensively (same type_name from two files)
    seen.add(typeName);
    lights.push({
      typeName,
      folder: f.folder,
      source: "install",
      category: lightCategory(typeName),
      displayName: lightDisplayName(typeName),
    });
  }

  lights.sort((a, b) => a.typeName.localeCompare(b.typeName));
  return { lights, warnings };
}
