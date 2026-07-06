// categorize.ts — assign a display category to an object name.
// Resolution order (design §2.4):
//   1. exact curated table (categories.data.ts, from the community format list) → act:true
//   2. prefix/regex rules for stragglers & future DLC (case-insensitive)        → act:false
//   3. fallback "other/<bundle>" — an unknown object is browsable, never lost   → act:false

import { CATEGORY_BY_NAME } from "./categories.data";

export interface CategoryResult {
  category: string;
  act: boolean;
}

// First match wins; ordered specific → general. Tuned against the real 911-object scan so
// ≥95% land outside other/* (M0 acceptance #3). Case-insensitive.
const PREFIX_RULES: Array<[RegExp, string]> = [
  // Buildings
  [/^hangar/i, "buildings/hangar"],
  [/^tower00/i, "buildings/tower"],
  [/^terminal/i, "buildings/terminal"],
  [/^office/i, "buildings/office"],
  [/^factory/i, "buildings/factory"],
  [/^fuelstation/i, "buildings/fuelstation"],
  [/^(reservoir|watertank|watertower)/i, "buildings/reservoir"],
  // Jetways — Jetway_* (curated) plus airport passenger bridges PBridge*/PBRidge*/PBrucke*
  [/^jetway/i, "jetways"],
  [/^pb(ridge|rucke)/i, "jetways"],
  // People & vehicles
  [/^(staticpeople|people)/i, "people"],
  [/^(car_|taxi|us_pkw|pkw)/i, "vehicles/cars"],
  [/^(truck|lkw)/i, "vehicles/truck"],
  // Items
  [/^(floodlight|streetlight|street_lamp|parkinglamp|lamp_pole|mobile_light)/i, "items/lighting"],
  [/^barrel/i, "items/barrel"],
  [/^container/i, "items/container"],
  [/^cardboard/i, "items/box"],
  // Structures
  [/^comm_/i, "comm-towers"],
  [/^construction/i, "construction"],
  [/^church/i, "churches"],
  [/^(powerline|airport_blast_fence)/i, "various"],
];

export function categorize(name: string, bundle: string): CategoryResult {
  const exact = CATEGORY_BY_NAME[name];
  if (exact !== undefined) return { category: exact, act: true };
  for (const [re, cat] of PREFIX_RULES) {
    if (re.test(name)) return { category: cat, act: false };
  }
  return { category: `other/${bundle}`, act: false };
}

/** Derived pretty label. Strips trailing decoration runs (_ds_.., _sh_.., size codes),
 *  splits camelCase / underscores, title-cases. The raw name is what the UI copies into a
 *  `.toc`, so it's always shown alongside — this is a display nicety only.
 *  e.g. "tower00_small_plates_ds_00_08_08" → "Tower00 Small Plates". */
export function displayName(name: string): string {
  let s = name.replace(/_(ds|sh|mw|lod)(_[0-9a-z]+)*$/i, ""); // drop _ds_00_08_08 style runs
  s = s.replace(/(_[0-9]+)+$/, ""); // drop trailing numeric size codes like _16_13
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"); // split camelCase
  s = s.replace(/_+/g, " ").trim();
  s = s.replace(/\b\w/g, (c) => c.toUpperCase()); // title-case
  return s || name;
}
