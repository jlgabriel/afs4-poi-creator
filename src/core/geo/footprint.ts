// footprint.ts — where an object's bounding box meets the map.
//
// A placed object is anchored at its MODEL ORIGIN (the PlacedXref.position). The scanned
// bounding box (bbMin/bbMax, model-local metres, z up) is NOT centred on that origin, so the
// map polygon must be built in model-local metres and offset-rotated around the anchor — this
// reproduces the ACT idiom (blue footprint, yellow anchor dot).
//
// AXIS MAPPING — verified in-sim, matrix V3:
//   at direction 0:  model +Y = North,  +X = East   (z is up, irrelevant to the 2-D footprint)
//   `direction` rotates the object CLOCKWISE          (spec: negative = counterclockwise).
//
// So a model-local ground offset (east, north) sits at compass azimuth atan2(east, north), and
// the object's `direction` simply adds to that azimuth. geo.ts already speaks this language
// (destination(): 0 = North, 90 = East, clockwise), so footprints stay numerically consistent
// with the coordinates the Race App and the sim compute. No correction factors — see V3.

import type { LonLat, Vec3 } from "../project/types";
import { destination } from "./geo";

const R2D = 180 / Math.PI;

/** Project a model-local ground offset (metres east, metres north of the anchor) onto the map,
 *  rotated by the object's clockwise `directionDeg`. Pure composition over geo.destination — a
 *  zero offset returns the anchor itself (avoids a NaN azimuth at the origin). */
function offsetToLonLat(
  anchor: LonLat,
  east: number,
  north: number,
  directionDeg: number,
): LonLat {
  const dist = Math.hypot(east, north);
  if (dist === 0) return { lon: anchor.lon, lat: anchor.lat };
  const azimuth = Math.atan2(east, north) * R2D + directionDeg; // 0 = +Y = North, clockwise
  return destination(anchor, dist, azimuth);
}

/** The four ground corners of a placed object's bounding box, as map points.
 *
 *  Returned in perimeter order — the model-local corners walked counter-clockwise before
 *  rotation, so consumers can hand them straight to an `L.Polygon` without self-intersection:
 *    0: (minX, minY)   1: (maxX, minY)   2: (maxX, maxY)   3: (minX, maxY)
 *
 *  `scale` is AFS4's uniform `scale_factor`, applied about the model origin (the anchor) exactly
 *  as the sim scales the placed object; only the x/y extents matter for the ground footprint. */
export function footprintCorners(
  anchor: LonLat,
  bbMin: Vec3,
  bbMax: Vec3,
  directionDeg: number,
  scale: number,
): [LonLat, LonLat, LonLat, LonLat] {
  const minX = bbMin[0] * scale;
  const minY = bbMin[1] * scale;
  const maxX = bbMax[0] * scale;
  const maxY = bbMax[1] * scale;
  return [
    offsetToLonLat(anchor, minX, minY, directionDeg),
    offsetToLonLat(anchor, maxX, minY, directionDeg),
    offsetToLonLat(anchor, maxX, maxY, directionDeg),
    offsetToLonLat(anchor, minX, maxY, directionDeg),
  ];
}

/** Tip of the "which way is it facing" arrow: a point on the model's +Y (front) axis at the
 *  bounding box's forward edge (bbMax.y), rotated by `direction`. At direction 0 it points due
 *  North; the editor draws a tick from the anchor to here so orientation is readable at a glance. */
export function headingMarker(
  anchor: LonLat,
  bbMax: Vec3,
  directionDeg: number,
  scale: number,
): LonLat {
  return offsetToLonLat(anchor, 0, bbMax[1] * scale, directionDeg);
}
