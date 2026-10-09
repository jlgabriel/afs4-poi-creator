// airport.ts — read-side accessors for the airport block (types.ts ProjectAirport).
//
// They exist so nothing outside this file reaches for `airport.pad`. That field is a COMPATIBILITY
// MIRROR of `pads[0]`, written only so PCT <= 1.3 can still open the file (see types.ts); reading it
// would mean the app agreed with a shape it is supposed to be migrating away from, and would quietly
// keep working on one pad while `pads` grew a second. Every caller works on the list or on a pad id;
// don't reintroduce a "first pad" accessor.

import type {
  AirportAerotow,
  AirportParking,
  AirportRunway,
  AirportWinch,
  LonLat,
  ParkingType,
  ProjectAirport,
} from "./types";

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

// Deleting a part never drops the whole airport block: editing changes only the affected elements. The
// check the app needs is FS4's own floor — at least one helipad or one runway — and the install asks it
// (renderer/dialogs/HeliportDialog).

/** How far apart two side-by-side gliders stand on a winch launch, metres — roughly a glider's span.
 *  A starting value; the user edits it. */
export const DEFAULT_WINCH_SPACING_M = 25;

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
