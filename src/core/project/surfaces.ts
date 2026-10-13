// surfaces.ts — the TAP converter's vocabulary for painted surfaces: the MATERIAL of a runway or a
// TARMAC polygon, its BRIGHTNESS and LEVEL, and the NAME of a LINE.
//
// These are values of the `.tap` format, not data read from the user's install: the converter turns each
// name into a texture of its own, and the names appear nowhere else on disk. So they are listed here, like
// the row names the writer emits. Spelling is exact — `asphalt_apron__typestd` has TWO underscores — and a
// name the converter does not know is not reported as an error, so the menus only ever offer these.
//
// A project may still carry a name that is not listed (a hand-edited project.json): it is kept and written
// as is, and the menus show it as an extra entry rather than replacing it.

/** The four groups of tarmac materials. The group decides the level a material is meant for. */
export type TarmacGroup = "flatten" | "ground" | "apron" | "runway";

export interface TarmacMaterial {
  name: string;
  group: TarmacGroup;
  /** Whether the material takes a brightness. The ones that do not get an EMPTY `brightness` row. */
  brightness: boolean;
}

/** Every tarmac material, in menu order, grouped. */
export const TARMAC_MATERIALS: readonly TarmacMaterial[] = [
  // Invisible: levels the terrain under the airport.
  { name: "flatten", group: "flatten", brightness: false },
  // Ground outside apron, taxiway and runway.
  { name: "hole", group: "ground", brightness: false },
  { name: "grass00", group: "ground", brightness: false },
  { name: "concrete_ground_green__typestd__variation00", group: "ground", brightness: true },
  { name: "concrete_ground_green__typestd__variation01", group: "ground", brightness: true },
  { name: "concrete_ground_green__typestd__variation02", group: "ground", brightness: true },
  { name: "concrete_ground_green__typestd__variation03", group: "ground", brightness: true },
  { name: "concrete_ground_green__typestd__variation04", group: "ground", brightness: true },
  { name: "concrete_ground_green__typestd__variation05", group: "ground", brightness: true },
  // Apron and taxiway.
  { name: "asphalt_apron__typeblue", group: "apron", brightness: true },
  { name: "asphalt_apron__typestd", group: "apron", brightness: true },
  { name: "concrete_apron__typeblue", group: "apron", brightness: true },
  { name: "concrete_apron__typestd", group: "apron", brightness: true },
  { name: "concrete_plate__typeblue", group: "apron", brightness: true },
  { name: "concrete_plate__typestd", group: "apron", brightness: true },
  // Runway.
  { name: "asphalt_runway__typeblue", group: "runway", brightness: true },
  { name: "asphalt_runway__typestd", group: "runway", brightness: true },
  { name: "grass01", group: "runway", brightness: false },
];

export const TARMAC_GROUPS: readonly TarmacGroup[] = ["flatten", "ground", "apron", "runway"];

export const TARMAC_GROUP_LABELS: Record<TarmacGroup, string> = {
  flatten: "Flatten — levels the airport area",
  ground: "Ground — outside apron, taxiway and runway",
  apron: "Apron and taxiway",
  runway: "Runway",
};

/** The materials a RUNWAY offers: the runway group. */
export const RUNWAY_MATERIALS: readonly TarmacMaterial[] = TARMAC_MATERIALS.filter((m) => m.group === "runway");

export const DEFAULT_RUNWAY_MATERIAL = "asphalt_runway__typestd";
export const DEFAULT_TARMAC_MATERIAL = "asphalt_apron__typestd";
export const DEFAULT_BRIGHTNESS = 0.5;
export const DEFAULT_TARMAC_LEVEL = 1;
export const DEFAULT_LINE_NAME = "taxi_center";

/** The brightness values the converter takes: 0.1 to 1.0 in steps of 0.1. */
export const BRIGHTNESS_STEPS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

/** The material entry for a name, or undefined for a name that is not listed. */
export function tarmacMaterial(name: string): TarmacMaterial | undefined {
  return TARMAC_MATERIALS.find((m) => m.name === name);
}

/** Whether a material takes a brightness. An unlisted name is assumed to, so its value is not dropped. */
export function materialHasBrightness(name: string): boolean {
  return tarmacMaterial(name)?.brightness ?? true;
}

/** A brightness as the `.tap` writes it: one decimal ("0.5", "1.0"). */
export function fmtBrightness(b: number): string {
  return b.toFixed(1);
}

/** Snap a brightness onto the converter's steps, inside [0.1, 1.0]. */
export function clampBrightness(b: number): number {
  if (!Number.isFinite(b)) return DEFAULT_BRIGHTNESS;
  return Math.min(1, Math.max(0.1, Math.round(b * 10) / 10));
}

/** Why a tarmac's level does not suit its material, or null. A higher level covers a lower one; the
 *  FLATTEN material belongs on level 1 and the GROUND materials on level 2 or higher, so the ground
 *  outside the paved area is drawn over the flattened area. */
export function tarmacLevelProblem(material: string, level: number): string | null {
  const group = tarmacMaterial(material)?.group;
  if (group === "flatten" && level !== 1) return "Flatten is meant for level 1.";
  if (group === "ground" && level < 2) return "Ground materials are meant for level 2 or higher.";
  return null;
}

/** Every line name, in menu order. A plain name is a solid line; `_dashed` is its dashed variant and
 *  `_black` its version with a black border, for light pavement. */
export const LINE_NAMES: readonly string[] = [
  "double_yellow",
  "equipment_parking_line",
  "equipment_parking_line_black",
  "fat_yellow",
  "inter_holding_pos",
  "inter_holding_pos_black",
  "hold_pos_a_lighted",
  "hold_pos_a_lighted_black",
  "hold_pos_b",
  "hold_pos_b_black",
  "holdshort",
  "non_move_area",
  "non_move_area_black",
  "pushback_line",
  "pushback_line_black",
  "restricted_standby_area",
  "restricted_standby_area_dashed",
  "stand_lead_in",
  "stand_lead_in_dashed",
  "stand_lead_in_black",
  "stand_lead_in_dashed_black",
  "stand_lead_in_blue",
  "stand_lead_in_blue_dashed",
  "stand_lead_in_blue_black",
  "stand_lead_in_blue_dashed_black",
  "stand_lead_in_orange",
  "stand_lead_in_orange_dashed",
  "stand_lead_in_orange_black",
  "stand_lead_in_orange_dashed_black",
  "stand_safety_line",
  "stand_safety_line_b",
  "stand_safety_line_b_dashed",
  "stand_safety_line_white",
  "taxi_edge",
  "taxi_edge_dashed",
  "taxi_edge_black",
  "taxi_edge_dashed_black",
  "taxi_center",
  "taxi_center_enhanced_lighted",
  "taxi_center_enhanced_lighted_black",
  "taxi_center_lighted",
  "taxi_center_lighted_black",
  "taxi_center_lighted_blue",
  "taxi_center_lighted_blue_black",
  "taxi_center_lighted_orange",
  "taxi_center_lighted_orange_black",
  "taxilight_line",
  "taxilight_v2_line",
  "white",
];
