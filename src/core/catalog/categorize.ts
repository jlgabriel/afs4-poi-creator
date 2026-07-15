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

/** Derived pretty label — the fallback for objects NOT covered by an authoritative table.
 *  Strips only the IPACS decoration runs (_ds_.., _sh_.., _mw_.., _lod_..), splits
 *  camelCase / underscores, title-cases. Trailing numeric tokens are KEPT on purpose:
 *   - for community objects they're the meaningful discriminator — pylon_air_race_18_4 vs
 *     _25_5 collapsed to the same label (forum #110), making variants indistinguishable;
 *   - no built-in needs them gone — every IPACS size code sits behind a _ds/_sh/_mw/_lod
 *     marker (stripped above), and IPACS's own curated names keep the number as often as not
 *     (car_00 → "Car 00", glider_02 → "Glider 02"), so keeping is the closer default.
 *  The raw name is always shown alongside, so this is a display nicety only.
 *  e.g. "tower00_small_plates_ds_00_08_08" → "Tower00 Small Plates". */
export function displayName(name: string): string {
  let s = name.replace(/_(ds|sh|mw|lod)(_[0-9a-z]+)*$/i, ""); // drop _ds_00_08_08 style runs
  s = s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"); // split camelCase
  s = s.replace(/_+/g, " ").trim();
  s = s.replace(/\b\w/g, (c) => c.toUpperCase()); // title-case
  return s || name;
}
