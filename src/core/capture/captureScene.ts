// captureScene.ts — build a synthetic "capture scene" for the in-sim object-photo workflow (v0.7).
//
// The scene is a straight ROW of built-in objects laid over DEEP WATER off Isla de Pascua (SCIP), where
// the sim floor is a flat, uniform blue: every object gets the same clean backdrop and sits at a trivial,
// exact height (a few metres over sea level — no terrain mesh, none of the Open-Meteo-vs-mesh error that
// leaves ASL objects floating or buried on land). A short run of tall comm-mast "boyas" trails the row's
// head back toward the island as an APPROACH PATH: take off from SCIP, follow the boyas, and you arrive
// flying straight down the row, at the right height, meeting the objects in the manifest's order.
//
// PURE + framework-agnostic (geo math only — no I/O, no Electron, no clock, no random), so it golden-tests
// byte-for-byte. buildCaptureScene returns the placed objects (the existing planExport turns them into an
// installable POI) plus a CaptureManifest: the ordered [name, lon, lat] the capture session projects the
// sim's live UDP position onto, to auto-name each screenshot `<name>.jpg` in the photo folder. Capturing
// is always a deliberate, one-press-per-photo act by the user — this module only describes WHERE the
// objects are, so a shot can be named by WHERE the plane was, never by scraping the sim.

import type { LonLat, PlacedXref, Project } from "../project/types";
import { destination, haversine } from "../geo/geo";

/** SCIP / Mataveri (Isla de Pascua): isolated, deep water on every side — the default capture site.
 *  Verbatim from data/aerofly-data/airport-coordinates.json. */
export const SCIP: LonLat = { lon: -109.421027, lat: -27.165411 };

/** The approach-path / marker objects: tall, thin, unmistakable comm masts (height encoded in the name),
 *  verbatim from the catalog (categories.data.ts, act:true). A mast on the horizon over flat water reads
 *  from kilometres away and is never confused with a captured person/vehicle/building.
 *  NB: verify both resolve in the user's own scan (getCachedCatalog) before a live run — a name the sim
 *  doesn't have fails SILENTLY (no boya drawn), per the .tmi case lesson. */
export const BOYA_GUIDE = "comm_mast_01_h150"; // ~150 m — the run of approach boyas
export const BOYA_START = "comm_mast_03_h300"; // ~300 m — the single START marker at the row's head

export interface CaptureSceneOptions {
  /** Ordered catalog names to capture — one row slot each (typically one display category's objects). */
  names: string[];
  /** Row head = the first captured object (order 0). Default: `offshoreM` from SCIP along `bearingDeg`. */
  anchor?: LonLat;
  /** Compass heading the row runs along = the flight direction (0 = N, 90 = E). Default 270 (due west,
   *  straight into open ocean from SCIP). The approach boyas trail back along `bearingDeg + 180`. */
  bearingDeg?: number;
  /** Gap between consecutive captured objects, metres. Default 35 — far enough to frame one at a time. */
  spacingM?: number;
  /** Height ASL every object is placed at, so it floats cleanly over the flat sea rather than clipping the
   *  water surface. Default 5. Uniform for the whole scene (objects AND boyas) → one flat plane. */
  seaClearanceM?: number;
  /** Object heading (PlacedXref.direction). Default: faces the incoming pass (`bearingDeg + 180`). Tuned
   *  in-sim — with the replay camera fixed to the plane, this only sets which face the run sees. */
  facingDeg?: number;
  /** Count of guide boyas trailing the head as the approach path. Default 5. */
  approachBoyas?: number;
  /** Gap between approach boyas, metres. Default 200 — spread out so they read as a path from the air. */
  boyaSpacingM?: number;
  /** Only used to derive the DEFAULT anchor from SCIP: how far offshore the row head sits. Default 8000
   *  (~4.3 NM — matches the "SCIP 4.7 NM" deep-water shot; well clear of the shallow coastal shelf). */
  offshoreM?: number;
}

/** One captured object's slot on the row — what the capture session names a screenshot by. */
export interface ManifestEntry {
  order: number; // 0-based position along the row = the capture order
  name: string; // exact catalog id → the `<name>.jpg` stem the capture writes
  lon: number;
  lat: number;
}

/** PCT's own record of the row (NOT written into the POI — the sim never sees it). The capture session
 *  projects the sim's live UDP position onto these entries to auto-name each shot. Boyas are absent —
 *  you don't photograph the markers. */
export interface CaptureManifest {
  anchor: LonLat;
  bearingDeg: number;
  spacingM: number;
  seaClearanceM: number;
  entries: ManifestEntry[];
}

export interface CaptureScene {
  /** Approach boyas + START marker first, then the captured objects in row order. Array order is
   *  irrelevant to the sim; the manifest carries the capture order. */
  objects: PlacedXref[];
  manifest: CaptureManifest;
}

const DEFAULTS = {
  bearingDeg: 270,
  spacingM: 35,
  seaClearanceM: 5,
  approachBoyas: 5,
  boyaSpacingM: 200,
  offshoreM: 8000,
} as const;

/** Normalise an angle into [0, 360). */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function xref(id: string, name: string, position: LonLat, direction: number, heightAsl: number): PlacedXref {
  return { id, kind: "xref", name, position, height: { mode: "asl", value: heightAsl }, direction, scale: 1 };
}

/** Build the capture scene: the boya approach path + the row of captured objects, plus the manifest. */
export function buildCaptureScene(opts: CaptureSceneOptions): CaptureScene {
  const bearingDeg = norm360(opts.bearingDeg ?? DEFAULTS.bearingDeg);
  const spacingM = opts.spacingM ?? DEFAULTS.spacingM;
  const seaClearanceM = opts.seaClearanceM ?? DEFAULTS.seaClearanceM;
  const approachBoyas = opts.approachBoyas ?? DEFAULTS.approachBoyas;
  const boyaSpacingM = opts.boyaSpacingM ?? DEFAULTS.boyaSpacingM;
  const offshoreM = opts.offshoreM ?? DEFAULTS.offshoreM;
  const facingDeg = norm360(opts.facingDeg ?? bearingDeg + 180);
  const anchor = opts.anchor ?? destination(SCIP, offshoreM, bearingDeg);
  const back = norm360(bearingDeg + 180); // island side — where the approach path trails

  const objects: PlacedXref[] = [];

  // Approach boyas: farthest-from-head FIRST, so the array reads in the order the run-in meets them. They
  // step back toward the island along `back`, one boyaSpacingM apart, the nearest sitting one gap behind head.
  for (let j = approachBoyas; j >= 1; j--) {
    objects.push(xref(`cap-boya-${j}`, BOYA_GUIDE, destination(anchor, j * boyaSpacingM, back), facingDeg, seaClearanceM));
  }
  // START marker: the tall h300, half a gap behind the head — between the last approach boya and object 0.
  objects.push(xref("cap-boya-start", BOYA_START, destination(anchor, boyaSpacingM / 2, back), facingDeg, seaClearanceM));

  // The row: one captured object per name. Head (order 0) sits exactly on the anchor; the rest step out
  // along `bearingDeg`. `destination(_, 0, _)` would only add float noise, so the head uses `anchor` as-is.
  const entries: ManifestEntry[] = [];
  opts.names.forEach((name, i) => {
    const pos = i === 0 ? anchor : destination(anchor, i * spacingM, bearingDeg);
    objects.push(xref(`cap-${i}`, name, pos, facingDeg, seaClearanceM));
    entries.push({ order: i, name, lon: pos.lon, lat: pos.lat });
  });

  return { objects, manifest: { anchor, bearingDeg, spacingM, seaClearanceM, entries } };
}

/** Wrap a scene's objects into a Project the export pipeline (planExport) consumes. Timestamps are
 *  injected (`now`) rather than read from a clock so this stays pure/testable; planExport ignores them
 *  anyway (only name/poiName/reference/objects reach the POI). Baked-ASL: the objects are literal ASL. */
export function buildCaptureProject(scene: CaptureScene, meta: { name: string; poiName: string; now: string }): Project {
  const anchor = scene.manifest.anchor;
  return {
    schemaVersion: 1,
    app: "pct",
    name: meta.name,
    poiName: meta.poiName,
    createdAt: meta.now,
    modifiedAt: meta.now,
    reference: anchor, // → the POI folder-name coordinate prefix
    camera: { lon: anchor.lon, lat: anchor.lat, zoom: 15 },
    objects: scene.objects,
    heightMode: "baked-asl",
  };
}

/** Which captured object is the plane over? Nearest manifest entry by great-circle distance to `pos`, or
 *  null if the closest is still farther than `maxDistanceM`. With the row well-spaced this is unambiguous;
 *  the capture session uses it to name a screenshot by WHERE the plane is. (Projection onto the row line is
 *  a possible refinement, but nearest-point already returns the object you're closest to / just passed.) */
export function matchNearestEntry(
  manifest: CaptureManifest,
  pos: LonLat,
  maxDistanceM = Infinity,
): ManifestEntry | null {
  let best: ManifestEntry | null = null;
  let bestD = Infinity;
  for (const e of manifest.entries) {
    const d = haversine(pos, { lon: e.lon, lat: e.lat });
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best !== null && bestD <= maxDistanceM ? best : null;
}
