// airport.ts — read-side accessors for the airport block (types.ts ProjectAirport).
//
// They exist so nothing outside this file reaches for `airport.pad`. That field is a COMPATIBILITY
// MIRROR of `pads[0]`, written only so PCT <= 1.3 can still open the file (see types.ts); reading it
// would mean the app agreed with a shape it is supposed to be migrating away from, and would quietly
// keep working on one pad while `pads` grew a second.
//
// The v1.3 UI still shows exactly ONE pad — the reworked AIRPORT menu (forum #219/#221, where HELICOPTER
// becomes repeatable) is what turns these into list rendering. Until then `firstPad` is the honest name
// for what that UI means, and it is greppable when the time comes.

import type { AirportPad, AirportParking, LonLat, ParkingType, ProjectAirport } from "./types";

/** The pad a single-pad UI means: the first one, or undefined for an airport with none (legal — his
 *  "(1) DATA" example is identity plus a database entry and no pads at all). */
export function firstPad(airport: ProjectAirport | undefined): AirportPad | undefined {
  return airport?.pads[0];
}

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

/** The `tags` vocabulary, in the order a menu should offer it. Also the zod enum (schemas.ts) — one list,
 *  so a value the UI can produce is by construction a value the loader accepts. See types.ts ParkingType
 *  for why the spelling is `parked_`, and why a wrong one cannot be detected in-sim. */
export const PARKING_TYPES = ["parked_ga", "parked_jet", "pushback"] as const;

/** English, user-facing (the UI is English — the labels ApfelFlieger used in #232). */
export const PARKING_TYPE_LABELS: Record<ParkingType, string> = {
  parked_ga: "General Aviation",
  parked_jet: "Jet",
  pushback: "Pushback",
};

/** The stand radius each type starts at, metres.
 *
 *  ⚠️ Two of these three are HIS numbers and one is OURS. His margin note in the original SCLC gives
 *  "[parked_ga] = 7.5 M / [parked_jet] = 40 M" and says nothing at all about a size for `pushback`. 40 is
 *  our choice for it, on the grounds that a coupled pushback truck means an airliner stand — it is a
 *  starting value in a field the user can edit, not something measured. */
export const DEFAULT_PARKING_SIZE_M: Record<ParkingType, number> = {
  parked_ga: 7.5,
  parked_jet: 40,
  pushback: 40,
};
