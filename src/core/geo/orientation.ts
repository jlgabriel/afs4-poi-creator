// orientation.ts — convert between an XREF object's raw `.toc` `direction` (the rotation the sim applies)
// and the COMPASS HEADING its front actually points in-sim.
//
// At `direction 0` an object faces EAST (90°) — aircraft, vehicles and buildings alike — and rotation
// runs NEGATIVE, i.e.
//
//     heading = (90 − direction) mod 360        direction = (90 − heading) mod 360
//
// The base facing (90° East) is a parameter of both functions, so a per-object override could slot in
// without touching call sites.
//
// The stored `PlacedXref.direction` stays the RAW `.toc` value (the emitter and its goldens depend on
// it); this conversion lives only at the UI boundary, so the Inspector and the on-map handle speak
// compass headings.

/** The compass heading (degrees) an XREF faces at `direction 0` — model +X = East. Global default. */
export const XREF_BASE_HEADING = 90;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** Rotate a compass azimuth measured at `direction 0` by an object's raw `.toc` `direction`.
 *
 *  THE single home of the rotation SENSE — every consumer comes through here. `direction` is a
 *  right-handed yaw about +z (up) in a model frame of +X = East / +Y = North, so it turns compass
 *  azimuths NEGATIVE; that is the same fact that makes `heading = 90 − direction`.
 *
 *  Anything that turns with an object — a facing, a bbox corner, a tick — must use this one line; if
 *  the sense is spelled out twice the footprint polygon can rotate against its own heading tick. */
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
