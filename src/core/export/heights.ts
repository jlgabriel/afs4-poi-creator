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

// ── Autoheight (AGL) mode — forum #142 / in-sim gate 2026-07-19 ─────────────────────────────────────

/** Objects that an AUTOHEIGHT export cannot represent (types.ts HeightMode). Two reasons:
 *  • "asl"    — an absolute-ASL height: the place is autoheight=true, so the sim would read the number as
 *               metres-ABOVE-GROUND, not ASL. The fix is the user's — switch those to Terrain / Terrain+offset,
 *               or export in Baked ASL. (Deliberately NOT NeedsElevationError, whose "enter a base elevation"
 *               recovery is the wrong advice here.)
 *  • "lights" — a `light` / `airport_light`: the sim can't place lights in autoheight. In-sim gate
 *               (2026-07-20): a silo in an autoheight POI lands on the terrain, but airport lights in the
 *               same POI drop far below the surface — lights need an absolute (ASL) height, which autoheight
 *               (all ground-relative) can't give them. Use Baked ASL for lights. */
export class UnsupportedInAutoheightError extends Error {
  readonly points: PlacedObject[];
  readonly reason: "asl" | "lights";
  constructor(points: PlacedObject[], reason: "asl" | "lights") {
    super(
      reason === "lights"
        ? `${points.length} light(s): Sim autoheight can't place lights (the sim buries them below the terrain) — export in Baked ASL, or remove them`
        : `${points.length} object(s) use an absolute ASL height, which autoheight can't represent — switch them to Terrain / Terrain + offset, or export in Baked ASL`,
    );
    this.name = "UnsupportedInAutoheightError";
    this.points = points;
    this.reason = reason;
  }
}

/** What (if anything) blocks an autoheight export, for the ExportDialog to warn about BEFORE trying (same
 *  role as the registration guard). Lights are checked first — a kind the mode doesn't handle at all —
 *  then `asl`. Returns null when the project exports cleanly in autoheight. PURE, no I/O. */
export function unsupportedInAutoheight(
  objects: PlacedObject[],
): { reason: "asl" | "lights"; points: PlacedObject[] } | null {
  const lights = objects.filter((o) => o.kind === "airport_light" || o.kind === "light");
  if (lights.length > 0) return { reason: "lights", points: lights };
  const asl = objects.filter((o) => o.height.mode === "asl");
  if (asl.length > 0) return { reason: "asl", points: asl };
  return null;
}

/** Resolve every object for an AUTOHEIGHT export: the SIM resolves the terrain, so a terrain-relative
 *  height becomes the AGL value written into the `.toc` — `terrain → 0`, `terrain-offset → offset`. PURE
 *  and OFFLINE (no terrain lookup — that is the whole point of the mode). Throws UnsupportedInAutoheightError
 *  if any object can't be represented (lights, or an absolute `asl` height); check unsupportedInAutoheight
 *  first to warn without throwing. The resolved `heightAsl` field carries the AGL z here (its name is kept
 *  to avoid renaming ~15 files; under autoheight the sim reads it as metres-above-ground). */
export function resolveHeightsAgl(objects: PlacedObject[]): ResolvedObject[] {
  const blocked = unsupportedInAutoheight(objects);
  if (blocked) throw new UnsupportedInAutoheightError(blocked.points, blocked.reason);
  return objects.map((o): ResolvedObject => {
    const { height, ...rest } = o;
    const z = height.mode === "terrain-offset" ? height.offset : 0; // terrain → 0; asl already rejected above
    return { ...rest, heightAsl: z } as ResolvedObject;
  });
}
