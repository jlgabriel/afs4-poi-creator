// plants.ts — enumerate the AFS4 plant library into CatalogPlant[] (v0.4).
// PURE: filenames in, typed catalog out. Like airportLights there is NOTHING TO PARSE:
// `<install>/scenery/plants/` holds only `.ttx` textures, no geometry. The sim draws a plant from its
// texture alone, so the whole "scan" is name derivation and PCT ships zero proprietary bytes.
//
// The filename carries the entire record we need:
//
//     broadleaf__i00__h1750_color.ttx
//     └─ group ─┘  └sp┘ └─h─┘
//
//   • group   → the `.toc` `group` value, VERBATIM ("conifer_forest" — groups contain `_`, so the
//               field separator is the DOUBLE underscore, not a single one). The plant property is
//               `group`; `type` is not a member of `plant`.
//   • species → the `.toc` `species` value: the filename's own 2 zero-padded digits ("08", not "0").
//               ⚠️ Do NOT "fix" this to a 0-based ordinal: the numbering has real gaps (i04–i07) and
//               `species` carries the filename's number (e.g. `palm`/`11` is valid).
//   • h####   → the texture's natural height in CENTIMETRES (h1750 = 17.50 m).
//               ⚠️ The `h` is OPTIONAL: some stock files omit it (`shrub__i16__0150_color`). The digits
//               are decoded as centimetres all the same; skipping the plant would lose one the user can
//               see in the sim.

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

/** `<group>__i<species>__[h]<centimetres>` plus an optional `_<channel>` suffix.
 *  `(.+?)` is lazy so the group keeps its own underscores up to the first `__i` ("conifer_forest").
 *  The suffix is optional and ignored: install plant files are `_color`, but the sim's texture naming
 *  elsewhere pairs `_color` with a `_light` map, and a second channel for the same plant must not
 *  become a second catalog entry (see the group/species de-dupe below).
 *  `h?` cannot make the parse ambiguous: `\d` never matches `h`, so the optional letter is consumed
 *  when present and skipped when absent. */
const PLANT_RE = /^(.+?)__i(\d+)__h?(\d+)(?:_[a-z]+)?$/;

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
      warnings.push(`plant texture "${f.base}" doesn't match <group>__i##__[h]#### — skipped`);
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
