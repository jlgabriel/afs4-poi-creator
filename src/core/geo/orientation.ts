// orientation.ts — convert between an XREF object's raw `.toc` `direction` (the rotation the sim applies)
// and the COMPASS HEADING its front actually points in-sim.
//
// Empirically calibrated 2026-07-15 via a dedicated PCT in-sim gate (Juan flew it at KDAG with three
// MAXIMALLY DIVERSE objects — an A320 airliner, a fuel truck, and a hangar): at `direction 0` all three
// faced EAST (90°), and rotation runs NEGATIVE, i.e.
//
//     heading = (90 − direction) mod 360        direction = (90 − heading) mod 360
//
// This matches chrispriv's forum formula (#74), now confirmed across aircraft + vehicle + building — which
// overturns the earlier "aircraft-vs-buildings behave differently" reading (the hangar sided with the
// aircraft). The GLOBAL base facing (90° East) is a strong default; a per-object calibration override for
// any exceptions (e.g. a report of an object flipping at 270°) is a planned layer, so both functions take
// the base as a parameter and it slots in without touching call sites. See docs/notes on xref orientation.
//
// The stored `PlacedXref.direction` stays the RAW `.toc` value (no format change — the emitter and its
// goldens are untouched); this conversion lives only at the UI boundary, so the Inspector and the on-map
// handle can finally speak compass headings instead of the raw rotation users misread as a facing.

/** The compass heading (degrees) an XREF faces at `direction 0` — model +X = East. Global default. */
export const XREF_BASE_HEADING = 90;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Rotate a compass azimuth measured at `direction 0` by an object's raw `.toc` `direction`.
 *
 *  THE single home of the rotation SENSE — every consumer comes through here. `direction` is a
 *  right-handed yaw about +z (up) in a model frame of +X = East / +Y = North, so it turns compass
 *  azimuths NEGATIVE; that is the same fact that makes `heading = 90 − direction`.
 *
 *  It exists because v0.3.0 spelled that sense out in two places — the facing (below, calibrated) and
 *  the map footprint's corners, which still ADDED `direction` from the pre-calibration guess. They
 *  rotated opposite ways and the polygon visibly fought its own heading tick (forum #120). Anything
 *  that turns with an object — a facing, a bbox corner, a tick — is one rotation and shares one line. */
export function rotateAzimuth(azimuthAtDir0: number, direction: number): number {
  return norm360(azimuthAtDir0 - direction);
}

/** Raw `.toc` `direction` → the compass heading the object's front points in-sim. */
export function directionToHeading(direction: number, base: number = XREF_BASE_HEADING): number {
  return rotateAzimuth(base, direction);
}

/** Desired compass heading → the raw `.toc` `direction` to write. Inverse of directionToHeading (an
 *  involution for a fixed base: base − (base − x) = x). */
export function headingToDirection(heading: number, base: number = XREF_BASE_HEADING): number {
  return norm360(base - heading);
}
