// plantAnchor.ts — the reference-POI "anchor" object a POI carries in its `.tsl`. Two callers, two modes:
//
//   • v0.4 PLANTS (baked-asl): a cultivation's plants are billboards with no mesh of their own, so the sim
//     computes the tile's bounding volume WITHOUT the terrain height under them — as if the ground were at
//     0. At altitude (KDAG, 583 m) that puts the volume hundreds of metres below the plants, the frustum
//     test rejects it, and the plants blink in and out (forum: Jan/IPACS #3, chrispriv #5, ApfelFlieger
//     #6/#136; in-sim gate 2026-07-17). Objects with their own mesh (every xref) carry their own bounding
//     box and never blink — so a baked-asl POI ships the anchor ONLY when it has plants.
//
//   • v0.5 AUTOHEIGHT (forum #142; in-sim gate 2026-07-19): the same reference object is what makes the
//     place-level `autoheight=true` REACH the cultivation — with it present, each xref/plant written at
//     z=0 snaps to the terrain (AGL); without it the objects don't place (gate: the un-anchored sphere
//     didn't show). So an autoheight POI ships the anchor ALWAYS (of ALL objects, not just plants).
//
// The mesh (`pct_anchor`) is OURS — a Blender disc with our own texture, run through IPACS's official
// content converter, carrying zero IPACS bytes — so it is redistributable. The .tsl writes it ABSOLUTE for
// plants (position z = terrain ASL, autoheight=false) and AGL for autoheight (fixed low z +
// autoheight_override=-1); see tslWriter.anchorObjects. Detail: docs/CULLING_INVESTIGATION_HANDOFF.md.

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
 *  anchor object is emitted and no assets ship, so an xref/light-only baked-asl POI stays byte-identical
 *  to before v0.4.
 *
 *  Placed at the CENTROID of the plants, at their MEAN resolved ASL. Plants sit on the ground, so their
 *  resolved height is the terrain ASL under them; the anchor only needs to be near ground level to fix
 *  the bounding volume's altitude (the bug is a hundreds-of-metres error, so a few metres of spread
 *  across plants is immaterial). One anchor per POI — plants spread over kilometres are out of scope for v0.4. */
export function computeAnchor(objects: ResolvedObject[]): Anchor | null {
  const plants = objects.filter((o): o is ResolvedPlant => o.kind === "plant");
  if (plants.length === 0) return null;
  const position = centroid(plants.map((p) => p.position));
  const heightAsl = plants.reduce((sum, p) => sum + p.heightAsl, 0) / plants.length;
  return { position, heightAsl };
}

/** The AUTOHEIGHT anchor: placed at the CENTROID of ALL objects (in autoheight mode every object needs the
 *  terrain reference, not just plants — forum #142, gate 2026-07-19). `heightAsl` is unused (the .tsl
 *  writes the anchor at a fixed AGL z + autoheight_override; see tslWriter.anchorObjects), so it carries 0.
 *  Null only when the POI is empty.
 *
 *  ⚠️ Open cabo (NOT yet flown): with a SINGLE object the centroid coincides with it — the 2026-07-19 gate
 *  had the anchor 45 m off two objects, never directly under one. Cover this when the emitter's own in-sim
 *  gate runs; if a lone object floats, nudge the anchor a few metres off the centroid. */
export function computeAutoheightAnchor(objects: ResolvedObject[]): Anchor | null {
  if (objects.length === 0) return null;
  return { position: centroid(objects.map((o) => o.position)), heightAsl: 0 };
}
