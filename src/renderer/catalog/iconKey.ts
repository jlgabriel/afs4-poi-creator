// iconKey.ts — which glyph a catalog category gets. Kept apart from categoryIcon.tsx (the SVGs) so the
// mapping is plain data in, plain data out, and testable without React.

export type IconKey =
  | "plane"
  | "truck"
  | "car"
  | "tower"
  | "hangar"
  | "factory"
  | "tank"
  | "house"
  | "building"
  | "church"
  | "antenna"
  | "crane"
  | "chair"
  | "person"
  | "jetway"
  | "light"
  | "tree"
  | "box"
  | "generic";

/** Map a display-taxonomy category path to an icon key. Prefix-aware so it works for both the exact
 *  sub-category ("buildings/tower") and, defensively, a bare top-level. */
export function iconKey(category: string): IconKey {
  const c = category.toLowerCase();
  if (c === "aircraft") return "plane";
  if (c.startsWith("user/")) return userBundleIconKey(c.slice("user/".length));
  if (c.startsWith("lights/")) return "light"; // v0.2 airport lights
  if (c.startsWith("plants/")) return "tree"; // v0.4 plants — every group shares the one glyph

  if (c.startsWith("vehicles/")) {
    if (c.includes("truck") || c.includes("airport") || c.includes("caravan")) return "truck";
    return "car";
  }
  if (c.startsWith("buildings/")) {
    if (c.includes("tower")) return "tower";
    if (c.includes("hangar")) return "hangar";
    if (c.includes("factory")) return "factory";
    if (c.includes("reservoir") || c.includes("fuel")) return "tank";
    if (c.includes("residential")) return "house";
    return "building"; // office, terminal
  }
  if (c === "churches") return "church";
  if (c === "comm-towers") return "antenna";
  if (c === "construction") return "crane";
  if (c === "furniture") return "chair";
  if (c === "people") return "person";
  if (c === "jetways") return "jetway";
  if (c.startsWith("items/")) {
    if (c.includes("lighting")) return "light";
    if (c.includes("watertank")) return "tank";
    return "box"; // barrel, box, container, trashcan, technical, other
  }
  return "generic"; // various + anything unmapped
}

// A user's own objects browse under `user/<bundle>` (buildCatalog), and the curated table can't say
// what they are — so the glyph comes from the bundle's NAME instead. FS4 names its own xref folders
// by kind (xref_aircraft, xref_vehicles, xref_buildings…), and a creator who follows that convention
// gets the matching icon on every machine the folder is shared to, with no per-object photo (forum PM
// #335: Michael's xref_aircraft rendered as the generic box). Whole WORDS only, so a bundle like
// "air_race_pylons" isn't read as an aircraft.
const USER_BUNDLE_WORDS: Array<[RegExp, IconKey]> = [
  [/^(aircraft|airplanes?|planes?|helicopters?|helis?|gliders?)$/, "plane"],
  [/^(trucks?|lkw)$/, "truck"],
  [/^(vehicles?|cars?)$/, "car"],
  [/^(hangars?)$/, "hangar"],
  [/^(towers?)$/, "tower"],
  [/^(buildings?)$/, "building"],
  [/^(churches|church)$/, "church"],
  [/^(jetways?)$/, "jetway"],
  [/^(lights?|lighting)$/, "light"],
  [/^(trees?|plants?)$/, "tree"],
  [/^(people|persons?)$/, "person"],
];

function userBundleIconKey(bundle: string): IconKey {
  const words = bundle.split(/[^a-z0-9]+/).filter(Boolean);
  for (const [re, key] of USER_BUNDLE_WORDS) {
    if (words.some((w) => re.test(w))) return key;
  }
  return "generic";
}
