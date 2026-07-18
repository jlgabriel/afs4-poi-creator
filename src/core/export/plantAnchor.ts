// plantAnchor.ts — the reference-POI "anchor" a POI needs when it carries plants (v0.4).
//
// A cultivation's plants are billboards with no mesh of their own, so the sim computes the tile's
// bounding volume WITHOUT the terrain height under them — as if the ground were at 0. At altitude
// (KDAG, 583 m) that puts the volume hundreds of metres below the plants, the frustum test rejects it
// from every normal viewpoint, and the plants blink in and out (forum: Jan/IPACS #3, chrispriv #5,
// ApfelFlieger #6/#136; in-sim gate 2026-07-17: the un-anchored control blinks, the anchored variants
// are rock-solid). Objects with their own mesh (every xref) carry their own bounding box and never blink.
//
// The fix is ONE reference-POI object with real geometry at terrain height: it anchors the bounding
// volume to the ground and the plants stop blinking. The mesh (`pct_anchor`) is OURS — a Blender cube
// with our own texture, run through IPACS's official content converter, carrying zero IPACS bytes — so
// it is redistributable, unlike chrispriv's `exclude000m`. See docs/CULLING_INVESTIGATION_HANDOFF.md.
//
// It stays ABSOLUTE (the place remains autoheight=false, position z = terrain ASL): the in-sim gate
// proved the anchor works in absolute mode, so PCT keeps its baked-ASL / Open-Meteo height model
// unchanged and only ADDS this one object — no migration to AGL.

import type { LonLat, ResolvedObject, ResolvedPlant } from "../project/types";
import { centroid } from "../geo/poiName";

/** The `geometry` id written into the .tsl anchor object, and the basename of the bundled mesh+texture. */
export const ANCHOR_GEOMETRY = "pct_anchor";

/** The bundled binary assets copied verbatim into any POI that has plants: the mesh and its texture. */
export const ANCHOR_ASSETS: readonly string[] = [`${ANCHOR_GEOMETRY}.tmb`, `${ANCHOR_GEOMETRY}.ttx`];

/** Where the anchor object goes: a single point at terrain height ASL. */
export interface PlantAnchor {
  position: LonLat;
  heightAsl: number;
}

/** The anchor for a resolved object set, or null when the POI has no plants — then no anchor object is
 *  emitted and no assets ship, so an xref/light-only POI stays byte-identical to before v0.4.
 *
 *  Placed at the CENTROID of the plants, at their MEAN resolved ASL. Plants sit on the ground, so their
 *  resolved height is the terrain ASL under them; the anchor only needs to be near ground level to fix
 *  the bounding volume's altitude (the bug is a hundreds-of-metres error, so a few metres of spread
 *  across plants is immaterial). One anchor per POI — plants spread over kilometres are out of scope for v0.4. */
export function computeAnchor(objects: ResolvedObject[]): PlantAnchor | null {
  const plants = objects.filter((o): o is ResolvedPlant => o.kind === "plant");
  if (plants.length === 0) return null;
  const position = centroid(plants.map((p) => p.position));
  const heightAsl = plants.reduce((sum, p) => sum + p.heightAsl, 0) / plants.length;
  return { position, heightAsl };
}
