// airport.ts — read-side accessors for the airport block (types.ts ProjectAirport).
//
// They exist so nothing outside this file reaches for `airport.pad`. That field is a COMPATIBILITY
// MIRROR of `pads[0]`, written only so PCT <= 1.3 can still open the file (see types.ts); reading it
// would mean the app agreed with a shape it is supposed to be migrating away from, and would quietly
// keep working on one pad while `pads` grew a second. Every caller works on the list or on a pad id;
// don't reintroduce a "first pad" accessor.

import type {
  AirportAerotow,
  AirportCarlot,
  AirportGroundText,
  AirportJetway,
  AirportLine,
  AirportParking,
  AirportRunway,
  AirportTarmac,
  AirportTaxisign,
  AirportWinch,
  LonLat,
  ParkingType,
  ProjectAirport,
} from "./types";
import { curvedPath } from "../geo/arc";
import { EARTH_RADIUS_M, initialBearing } from "../geo/geo";

/** Where the AIRPORT itself sits.
 *
 *  Its explicit `position` when it has one; otherwise the first pad's, which is exactly how v1.2/v1.3
 *  behaved — the two were one number then. Null only for an airport with neither, which has no point on
 *  the map at all and so cannot be written. */
export function airportPosition(airport: ProjectAirport): LonLat | null {
  return airport.position ?? airport.pads[0]?.position ?? null;
}

/** The parking positions, with "absent" and "empty" collapsed into one thing. `parkings` is optional in
 *  the document so a project without stands does not carry an empty array (types.ts); every reader wants
 *  a list, and this is the only place that `?? []` should appear. */
export function parkingsOf(airport: ProjectAirport | undefined): AirportParking[] {
  return airport?.parkings ?? [];
}

/** The runways, with "absent" and "empty" collapsed into one thing — same contract as parkingsOf. */
export function runwaysOf(airport: ProjectAirport | undefined): AirportRunway[] {
  return airport?.runways ?? [];
}

/** The glider starts, absent and empty collapsed — same contract as parkingsOf. */
export function aerotowsOf(airport: ProjectAirport | undefined): AirportAerotow[] {
  return airport?.aerotows ?? [];
}
export function winchesOf(airport: ProjectAirport | undefined): AirportWinch[] {
  return airport?.winches ?? [];
}

/** The tarmac polygons and painted lines, absent and empty collapsed — same contract as parkingsOf. */
export function tarmacsOf(airport: ProjectAirport | undefined): AirportTarmac[] {
  return airport?.tarmacs ?? [];
}
export function linesOf(airport: ProjectAirport | undefined): AirportLine[] {
  return airport?.lines ?? [];
}

/** A line's bends, one per edge (points − 1), missing ones as 0 — what the editor works on. */
export function lineBends(line: AirportLine): number[] {
  const edges = Math.max(0, line.points.length - 1);
  return Array.from({ length: edges }, (_, i) => line.bends?.[i] ?? 0);
}

/** The line as it is painted: its points with every bent edge expanded into an arc (geo/arc.ts). The map
 *  draws this and Export TAP writes it. A line with no bends is its own points. */
export function linePath(line: AirportLine): LonLat[] {
  return curvedPath(line.points, line.bends);
}

/** The ground texts, taxi signs, jetways and car lots, absent and empty collapsed — same contract as
 *  parkingsOf. */
export function groundTextsOf(airport: ProjectAirport | undefined): AirportGroundText[] {
  return airport?.groundtexts ?? [];
}
export function taxisignsOf(airport: ProjectAirport | undefined): AirportTaxisign[] {
  return airport?.taxisigns ?? [];
}
export function jetwaysOf(airport: ProjectAirport | undefined): AirportJetway[] {
  return airport?.jetways ?? [];
}
export function carlotsOf(airport: ProjectAirport | undefined): AirportCarlot[] {
  return airport?.carlots ?? [];
}

/** Every part an airport holds — what deleting the airport takes with it. Counted in one place so the
 *  placed list's Airport row and the Inspector's delete question always give the same number. */
export function airportPartCount(airport: ProjectAirport): number {
  return (
    airport.pads.length +
    parkingsOf(airport).length +
    runwaysOf(airport).length +
    aerotowsOf(airport).length +
    winchesOf(airport).length +
    (airport.boundary !== undefined ? 1 : 0) +
    tarmacsOf(airport).length +
    linesOf(airport).length +
    groundTextsOf(airport).length +
    taxisignsOf(airport).length +
    jetwaysOf(airport).length +
    carlotsOf(airport).length
  );
}

// Deleting a part never drops the whole airport block: editing changes only the affected elements. The
// check the app needs is FS4's own floor — at least one helipad or one runway — and the install asks it
// (renderer/dialogs/HeliportDialog).

/** How far apart two side-by-side gliders stand on a winch launch, metres. 0 is the default and a valid
 *  value: one glider on one rope. A two-rope winch sets roughly a wingspan. */
export const DEFAULT_WINCH_SPACING_M = 0;

/** The approach-lighting vocabulary, in the order a menu should offer it: the common modern systems
 *  first, then older ones FS4 still loads. FS4 accepts both halves (types.ts ApproachLightSystem). */
export const APPROACH_LIGHT_SYSTEMS_COMMON = ["none", "std", "alsf-1", "alsf-2", "malsf", "malsr"] as const;
export const APPROACH_LIGHT_SYSTEMS_LEGACY = ["calvert", "calvert-2", "odals", "rail", "sals"] as const;
export const APPROACH_LIGHT_SYSTEMS = [
  ...APPROACH_LIGHT_SYSTEMS_COMMON,
  ...APPROACH_LIGHT_SYSTEMS_LEGACY,
] as const;

export const PAPI_SIDES = ["none", "left", "right", "both"] as const;
export const REIL_KINDS = ["none", "uni", "omni"] as const;

/** The width a new runway starts at, metres — a typical full runway width. */
export const DEFAULT_RUNWAY_WIDTH_M = 40;

/** The `tags` vocabulary, in the order a menu should offer it. Also the zod enum (schemas.ts) — one list,
 *  so a value the UI can produce is by construction a value the loader accepts. See types.ts ParkingType
 *  for why the spelling is `parked_`, and why a wrong one cannot be detected in-sim. */
export const PARKING_TYPES = ["parked_ga", "parked_jet", "pushback"] as const;

/** English, user-facing labels. */
export const PARKING_TYPE_LABELS: Record<ParkingType, string> = {
  parked_ga: "General Aviation",
  parked_jet: "Jet",
  pushback: "Pushback",
};

/** The stand radius each type starts at, metres.
 *
 *  7.5 for GA and 40 for a jet are the conventional sizes. `pushback` has no conventional size; 40 is a
 *  choice (a coupled pushback truck means an airliner stand) — a starting value the user can edit, not
 *  something measured. */
export const DEFAULT_PARKING_SIZE_M: Record<ParkingType, number> = {
  parked_ga: 7.5,
  parked_jet: 40,
  pushback: 40,
};

/** How far `p` is from the runway's centreline (the segment between its two ends), metres — in a flat
 *  frame around `p`, which at the size of an airport is exact enough to tell which runway is nearest. */
function distanceToRunway(p: LonLat, r: AirportRunway): number {
  const k = (EARTH_RADIUS_M * Math.PI) / 180;
  const c = Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: LonLat): [number, number] => [(q.lon - p.lon) * k * c, (q.lat - p.lat) * k];
  const [ax, ay] = xy(r.ends[0].threshold);
  const [bx, by] = xy(r.ends[1].threshold);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** The heading that turns something standing at `p` and facing `heading` EXACTLY parallel or at a right
 *  angle to the nearest runway — whichever of the four is closest to how it faces now, so a small
 *  correction never flips it round. The runway's direction is taken at its middle (the average of the
 *  bearings from each end). Null when there is no runway. Rounded to 0.01°. */
export function runwayAlignedHeading(p: LonLat, heading: number, runways: readonly AirportRunway[]): number | null {
  let nearest: AirportRunway | null = null;
  let best = Infinity;
  for (const r of runways) {
    const d = distanceToRunway(p, r);
    if (d < best) {
      best = d;
      nearest = r;
    }
  }
  if (nearest === null) return null;
  const a = nearest.ends[0].threshold;
  const b = nearest.ends[1].threshold;
  if (a.lon === b.lon && a.lat === b.lat) return null;
  const fwd = initialBearing(a, b);
  const back = (initialBearing(b, a) + 180) % 360;
  // Average of two angles that are within a hair of each other, safe across north.
  const diff = ((back - fwd + 540) % 360) - 180;
  const axis = (fwd + diff / 2 + 360) % 360;
  const h = ((heading % 360) + 360) % 360;
  let out = axis;
  let off = Infinity;
  for (let k = 0; k < 4; k++) {
    const cand = (axis + 90 * k) % 360;
    const d = Math.abs(((cand - h + 540) % 360) - 180);
    if (d < off) {
      off = d;
      out = cand;
    }
  }
  return (Math.round(out * 100) / 100) % 360;
}
