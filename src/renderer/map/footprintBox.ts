// footprintBox.ts — WHICH box a placed object draws and HOW it is turned. Split out of FootprintLayer for
// the same reason syncDiff was: this file carries no Leaflet import, so it unit-tests under the node
// config (importing Leaflet in Node throws — it touches `window` at module load). It is also the subtlest
// arithmetic in v0.9, and untested subtle arithmetic about rotation is exactly what forum #120 was.
//
// Until v0.9 "has a footprint" and "is an XREF" were the same question, because only an XREF is indexed
// in a `.tmi`. A user measurement (core/catalog/footprints) gives a light or a plant a box too, so the
// question splits — and with it comes the fact these functions exist for: the three kinds do not store
// their facing in the same units.

import type {
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  PlacedObject,
  Vec3,
} from "../../core/project/types";
import { catalogBox } from "../../core/catalog/footprints";
import { plantKey } from "../../core/catalog/plants";
import { headingToDirection } from "../../core/geo/orientation";

/** A model-local bounding box to draw, in metres (z up) — either scanned or user-measured. */
export interface Box {
  bbMin: Vec3;
  bbMax: Vec3;
}

/** Half-extent of the 10 × 10 m square drawn for a catalog-missing object. */
export const PLACEHOLDER_M = 5;
export const PLACEHOLDER_BOX: Box = {
  bbMin: [-PLACEHOLDER_M, -PLACEHOLDER_M, 0],
  bbMax: [PLACEHOLDER_M, PLACEHOLDER_M, 0],
};

/** The facing an object stores, or null for a kind that has none. A parametric point light shines in
 *  every direction (mutate.rotateObject is a deliberate no-op for it) and a plant is a billboard that
 *  turns to face the camera — neither has a heading for a grip or a tick to act on. */
export function orientationOf(obj: PlacedObject): number | null {
  if (obj.kind === "xref") return obj.direction;
  if (obj.kind === "airport_light") return obj.orientation;
  return null;
}

/** The rotation `footprintCorners` turns a box by, from whatever field the kind stores its facing in:
 *
 *   • an xref's `direction` IS that rotation (the raw `.toc` value) — passed straight through;
 *   • an airport light's `orientation` is a COMPASS BEARING (the direction it illuminates), so it goes
 *     through headingToDirection — which lands the box's +X axis, and the map's facing tick, on that same
 *     bearing. That the fixture's model is built along +X is an ASSUMPTION, not a finding: a light has no
 *     `.tmi` to read an axis convention out of. It is the only self-consistent choice available (box and
 *     tick can never disagree), and the person who typed the numbers can correct it — if the box comes
 *     out turned 90°, swapping width and depth fixes it, which is what the dialog tells them;
 *   • a plant has no facing at all, so its box sits axis-aligned (+Y = North).
 */
export function boxDirection(obj: PlacedObject, stored: number): number {
  if (obj.kind === "xref") return stored;
  if (obj.kind === "airport_light") return headingToDirection(stored);
  return 0;
}

/** AFS4's uniform `scale_factor`, which only an xref has. */
export function scaleOf(obj: PlacedObject): number {
  return obj.kind === "xref" ? obj.scale : 1;
}

/** How far the box reaches from the model origin on the ground plane — the radius the facing tick spans
 *  and the grip sits past. Model-local metres, before scale. */
export function extentOf(box: Box): number {
  return Math.max(
    Math.abs(box.bbMin[0]),
    Math.abs(box.bbMax[0]),
    Math.abs(box.bbMin[1]),
    Math.abs(box.bbMax[1]),
  );
}

/** The box an object draws, or null when it draws as a point. An XREF always has one — a name the catalog
 *  lacks falls back to the red-dashed placeholder — while a light or plant has one only where the user
 *  measured it (v0.9); a parametric point light never does, since its parameters ARE the light and there
 *  is nothing to measure. */
export function boxFor(
  obj: PlacedObject,
  xrefIndex: Map<string, CatalogObject>,
  lightIndex: Map<string, CatalogAirportLight>,
  plantIndex: Map<string, CatalogPlant>,
): Box | null {
  if (obj.kind === "xref") return xrefIndex.get(obj.name) ?? PLACEHOLDER_BOX;
  if (obj.kind === "airport_light") return catalogBox(lightIndex.get(obj.typeName));
  if (obj.kind === "plant") return catalogBox(plantIndex.get(plantKey(obj)));
  return null;
}
