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

import type { AirportPad, LonLat, ProjectAirport } from "./types";

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
