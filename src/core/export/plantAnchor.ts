// plantAnchor.ts — the reference-POI "anchor" object a POI carries in its `.tsl`. Two callers, two modes:
//
//   • PLANTS (baked-asl): without a meshed object near the ground, a POI's plants blink in and out at
//     elevated sites. Objects with their own mesh (every xref) never blink — so a baked-asl POI ships the
//     anchor ONLY when it has plants. It must sit at the plants' height.
//
//   • AUTOHEIGHT: the same reference object is what makes the place-level `autoheight=true` REACH the
//     cultivation — with it present, each xref/plant written at z=0 snaps to the terrain (AGL); without it
//     the objects don't place. So an autoheight POI ships the anchor ALWAYS (of ALL objects, not just plants).
//
// The mesh (`pct_anchor`) is PCT's own — a disc with our own texture, carrying zero IPACS bytes — so it is
// redistributable. The .tsl writes it ABSOLUTE for plants (position z = terrain ASL, autoheight=false) and
// AGL for autoheight (fixed low z + autoheight_override=-1); see tslWriter.anchorObjects.

import type { LonLat, ResolvedObject, ResolvedPlant } from "../project/types";
import { centroid } from "../geo/poiName";

/** The `geometry` id written into the .tsl anchor object, and the basename of the bundled mesh+texture. */
export const ANCHOR_GEOMETRY = "pct_anchor";

/** The bundled binary assets copied verbatim into any POI that carries the anchor: the mesh and its texture. */
export const ANCHOR_ASSETS: readonly string[] = [`${ANCHOR_GEOMETRY}.tmb`, `${ANCHOR_GEOMETRY}.ttx`];

/** Where the anchor object goes. `heightAsl` is the terrain ASL for a baked-asl (plant) anchor — written
 *  as the anchor's absolute z — and UNUSED for an autoheight anchor (the .tsl writes it at a fixed AGL z;
 *  see tslWriter.anchorObjects), where it carries 0. */
export interface Anchor {
  position: LonLat;
  heightAsl: number;
}

/** The BAKED-ASL (plant) anchor for a resolved object set, or null when the POI has no plants — then no
 *  anchor object is emitted and no assets ship for an xref/light-only baked-asl POI.
 *
 *  Placed at the CENTROID of the plants, at their MEAN resolved ASL. Plants sit on the ground, so their
 *  resolved height is the terrain ASL under them; the anchor only needs to be near ground level (a few
 *  metres of spread across plants is immaterial). One anchor per POI — plants spread over kilometres are
 *  out of scope. */
export function computeAnchor(objects: ResolvedObject[]): Anchor | null {
  const plants = objects.filter((o): o is ResolvedPlant => o.kind === "plant");
  if (plants.length === 0) return null;
  const position = centroid(plants.map((p) => p.position));
  const heightAsl = plants.reduce((sum, p) => sum + p.heightAsl, 0) / plants.length;
  return { position, heightAsl };
}

/** The AUTOHEIGHT anchor: placed at the CENTROID of ALL objects (in autoheight mode every object needs the
 *  terrain reference, not just plants). `heightAsl` is unused (the .tsl writes the anchor at a fixed AGL
 *  z + autoheight_override; see tslWriter.anchorObjects), so it carries 0. Null only when the POI is empty.
 *
 *  ⚠️ Unverified case: with a SINGLE object the centroid coincides with it. If a lone object floats,
 *  nudge the anchor a few metres off the centroid. */
export function computeAutoheightAnchor(objects: ResolvedObject[]): Anchor | null {
  if (objects.length === 0) return null;
  return { position: centroid(objects.map((o) => o.position)), heightAsl: 0 };
}
