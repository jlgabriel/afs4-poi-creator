// airport.ts — read-side accessors for the airport block (types.ts ProjectAirport).
//
// They exist so nothing outside this file reaches for `airport.pad`. That field is a COMPATIBILITY
// MIRROR of `pads[0]`, written only so PCT <= 1.3 can still open the file (see types.ts); reading it
// would mean the app agreed with a shape it is supposed to be migrating away from, and would quietly
// keep working on one pad while `pads` grew a second.
//
// ★ `firstPad()` USED TO LIVE HERE and is gone (v1.4, forum #221). It was the honest name for what a
// one-pad UI meant while the model already held a list, and it was written to be greppable for the day
// the UI caught up. That day came: the catalog card adds instead of moving, the list draws one row per
// pad, the map draws them all and the Inspector edits the selected one — so every caller became a list
// or an id, and the last one to go was the CLI, which had been exporting pad one and dropping the rest.

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

// ⛔ `airportIsEmpty` / `airportIsBlank` LIVED HERE AND ARE GONE (#278). They answered one question —
// "has this airport been reduced to nothing?" — for one caller, the Del handler, which used it to drop
// the whole block when its last part went. He asked us to stop: "As long as the PCT is only in the
// labour process ... only the affected elements themselves may change." With that rule gone there is no
// caller left, and the pair is not worth keeping warm: the check the app actually needs is not "is this
// empty" but Aerofly's own floor, one helipad or one runway, and the install already asks it in those
// words (renderer/dialogs/HeliportDialog). Deleting them here rather than leaving them unused is the
// house rule — an accessor nobody calls, with a docblock that states a rule the app no longer follows,
// is how the next reader gets misled.

/** How far apart two side-by-side gliders stand on a winch launch, metres. His number: "When I enter a
 *  value here, it is usually [25], but each user has to decide for himself" — a glider's span. */
export const DEFAULT_WINCH_SPACING_M = 25;

/** The approach-lighting vocabulary, split the way ApfelFlieger's two sample airports split it, and in the
 *  order a menu should offer it. Both halves are literals in the sim's binary (types.ts
 *  ApproachLightSystem) — the split is about what his ACT offers, not about what FS4 accepts. */
export const APPROACH_LIGHT_SYSTEMS_ACT = ["none", "std", "alsf-1", "alsf-2", "malsf", "malsr"] as const;
export const APPROACH_LIGHT_SYSTEMS_LEGACY = ["calvert", "calvert-2", "odals", "rail", "sals"] as const;
export const APPROACH_LIGHT_SYSTEMS = [
  ...APPROACH_LIGHT_SYSTEMS_ACT,
  ...APPROACH_LIGHT_SYSTEMS_LEGACY,
] as const;

export const PAPI_SIDES = ["none", "left", "right", "both"] as const;
export const REIL_KINDS = ["none", "uni", "omni"] as const;

/** The width a new runway starts at, metres. Not invented: every runway in his reference airports carries
 *  40 (33 of the 44 `width` rows we hold; the other 11 are the 10 m strip of his tiny SCLC test field). */
export const DEFAULT_RUNWAY_WIDTH_M = 40;

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
