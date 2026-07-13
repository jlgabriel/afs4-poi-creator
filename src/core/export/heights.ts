// heights.ts — resolve each object's HeightSpec to absolute metres ASL (design §2.2 / R1).
//
// POI xref heights are absolute ASL (format bible; matrix V2 confirms), so before export every
// object's height must become a single ASL number. This module is the PURE, offline path: it
// takes a terrain elevation you already have (or null) and does the arithmetic. The networked
// per-point lookup (Open-Meteo) lands later in main/elevation.ts and feeds the same shape.

import type { HeightSpec, PlacedObject, ResolvedObject } from "../project/types";

/** Objects that couldn't be resolved because their height is terrain-relative but no terrain
 *  elevation was available. The UI/CLI catches this and asks for a manual base elevation. */
export class NeedsElevationError extends Error {
  readonly points: PlacedObject[];
  constructor(points: PlacedObject[]) {
    super(`${points.length} object(s) need a terrain elevation to resolve their height`);
    this.name = "NeedsElevationError";
    this.points = points;
  }
}

/** Resolve one HeightSpec to metres ASL given the terrain ASL under the object (null = unknown).
 *  Returns null when terrain is needed but unknown; `asl` never needs terrain. */
export function resolveHeight(spec: HeightSpec, terrainAsl: number | null): number | null {
  switch (spec.mode) {
    case "asl":
      return spec.value;
    case "terrain":
      return terrainAsl;
    case "terrain-offset":
      return terrainAsl === null ? null : terrainAsl + spec.offset;
  }
}

/** Resolve every object to a ResolvedXref using a SINGLE terrain elevation for the whole POI —
 *  the manual/offline fallback (design §7 R1). `terrainAsl` null means "no elevation": any
 *  non-`asl` object then can't resolve, and the call throws NeedsElevationError listing them. */
export function resolveHeightsFlat(
  objects: PlacedObject[],
  terrainAsl: number | null,
): ResolvedObject[] {
  const missing: PlacedObject[] = [];
  const resolved = objects.map((o): ResolvedObject => {
    const { height, ...rest } = o; // drop HeightSpec; Resolved* carries heightAsl instead
    const h = resolveHeight(height, terrainAsl);
    if (h === null) missing.push(o);
    return { ...rest, heightAsl: h ?? 0 } as ResolvedObject;
  });
  if (missing.length > 0) throw new NeedsElevationError(missing);
  return resolved;
}
