// plants.ts — enumerate the AFS4 plant library into CatalogPlant[] (v0.4).
// PURE: filenames in, typed catalog out. Like airportLights there is NOTHING TO PARSE — but here the
// reason is stronger: `<install>/scenery/plants/` holds 41 files and ALL 41 are `.ttx` textures, with
// no `.tmb` and no geometry anywhere. The sim draws a plant from its texture alone, so the whole
// "scan" is name derivation and PCT ships zero proprietary bytes.
//
// The filename carries the entire record we need:
//
//     broadleaf__i00__h1750_color.ttx
//     └─ group ─┘  └sp┘ └─h─┘
//
//   • group   → the `.toc` `group` value, VERBATIM ("conifer_forest" — groups contain `_`, so the
//               field separator is the DOUBLE underscore, not a single one).
//   • species → the `.toc` `species` value, VERBATIM as 2 zero-padded digits ("00", not "0"). A name
//               that doesn't resolve fails SILENTLY in-sim, so it is never re-derived from memory
//               (the lesson that cost a whole gate — see the .tmi catalog notes).
//   • h####   → the texture's natural height in CENTIMETRES (h1750 = 17.50 m). Range across the real
//               41: 0.80 m (shrub__i11) … 28.20 m (conifer_forest__i01).
//
// Cross-validated: the format bible's plant list (group → species indices) matches these filenames
// EXACTLY, 41 = 41, down to the i04–i07 gaps absent from every group in both sources. Two
// independent sources agreeing is as close to ground truth as this feature gets — every real
// `list_plant` in the install is inside a binary-packed cultivation `.toc` we cannot read.

import type { CatalogPlant } from "../project/types";

/** One enumerated `.ttx` texture file (no bytes — just its name). */
export interface PlantFile {
  base: string; // the .ttx filename WITHOUT extension, e.g. "broadleaf__i00__h1750_color"
}

/** The identity of a plant: unlike an xref (one unique `name`) or an airport light (one `typeName`), a
 *  plant is named by a PAIR, so anything keying plants by identity — the catalog index, the map's
 *  missing check, the placement spec — has to agree on one string. This is that string, in one place. */
export function plantKey(p: { group: string; species: string }): string {
  return `${p.group}/${p.species}`;
}

export interface PlantBuildResult {
  plants: CatalogPlant[];
  warnings: string[];
}

/** `<group>__i<species>__h<centimetres>` plus an optional `_<channel>` suffix.
 *  `(.+?)` is lazy so the group keeps its own underscores up to the first `__i` ("conifer_forest").
 *  The suffix is optional and ignored: all 41 install files are `_color`, but the sim's texture naming
 *  elsewhere pairs `_color` with a `_light` map, and a second channel for the same plant must not
 *  become a second catalog entry (see the group/species de-dupe below). */
const PLANT_RE = /^(.+?)__i(\d+)__h(\d+)(?:_[a-z]+)?$/;

/** Pretty label: underscores → spaces, title-cased, keeping the species index — `broadleaf__i00` and
 *  `__i01` are different textures of different heights, so the number is meaningful (same rule as
 *  airport lights, opposite of categorize.displayName which strips trailing numbers).
 *  e.g. ("conifer_forest", "01") → "Conifer Forest 01". */
function plantDisplayName(group: string, species: string): string {
  const pretty = group
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
  return `${pretty} ${species}`;
}

/** Derive the plant catalog from enumerated `.ttx` files. Output is sorted by group then species so
 *  catalog.json diffs and golden fixtures stay stable regardless of readdir order. */
export function buildPlants(files: PlantFile[]): PlantBuildResult {
  const warnings: string[] = [];
  const plants: CatalogPlant[] = [];
  const seen = new Set<string>();

  for (const f of files) {
    const m = PLANT_RE.exec(f.base);
    if (!m) {
      // Tolerance contract (M0 acceptance #4): an unexpected filename is WARNED, never silently
      // dropped. Unlike the airport-light case we cannot include it verbatim — group/species/height
      // are only knowable by parsing the name, and a guessed group would place an invisible plant.
      warnings.push(`plant texture "${f.base}" doesn't match <group>__i##__h#### — skipped`);
      continue;
    }
    const [, group, species, centimetres] = m;
    const key = `${group}/${species}`;
    if (seen.has(key)) continue; // a second texture channel for the same plant — not a second entry
    seen.add(key);
    plants.push({
      group,
      species,
      naturalHeight: Number(centimetres) / 100,
      source: "install",
      category: `plants/${group}`,
      displayName: plantDisplayName(group, species),
    });
  }

  plants.sort((a, b) => a.group.localeCompare(b.group) || a.species.localeCompare(b.species));
  return { plants, warnings };
}
