// footprint.ts — where an object's bounding box meets the map.
//
// A placed object is anchored at its MODEL ORIGIN (the PlacedXref.position). The scanned
// bounding box (bbMin/bbMax, model-local metres, z up) is NOT centred on that origin, so the
// map polygon must be built in model-local metres and offset-rotated around the anchor — this
// reproduces the ACT idiom (blue footprint, yellow anchor dot).
//
// AXIS MAPPING — verified in-sim, matrix V3:
//   at direction 0:  model +Y = North,  +X = East   (z is up, irrelevant to the 2-D footprint)
//
// ROTATION SENSE — NOT spelled out here: orientation.rotateAzimuth owns it, so a corner and the map's
// facing tick turn as one. That split is deliberate. V3 looked like it settled the sense too ("+Y = North,
// clockwise"), but it never could: its evidence was an elongated hangar swinging N–S → E–W, which happens
// under −90 exactly as under +90 — a 180°-symmetric box is blind to the sign. The sense was only ever
// pinned by the 2026-07-15 in-sim gate (three ASYMMETRIC objects, whose front you can actually see):
// `direction` turns compass azimuths NEGATIVE, despite the format bible's `("-"=COUNTERCLOCKWISE)` note.
// This file believed the wrong half of V3 until forum #120 — users saw the polygon turn against its tick.
//
// So a model-local ground offset (east, north) sits at azimuth rotateAzimuth(atan2(east, north), direction).
// geo.ts already speaks this language (destination(): 0 = North, 90 = East, clockwise), so footprints stay
// numerically consistent with the coordinates the Race App and the sim compute. No correction factors.

import type { LonLat, Vec3 } from "../project/types";
import { destination } from "./geo";
import { rotateAzimuth } from "./orientation";

const R2D = 180 / Math.PI;

/** Project a model-local ground offset (metres east, metres north of the anchor) onto the map,
 *  turned by the object's `directionDeg`. Pure composition over geo.destination — a zero offset
 *  returns the anchor itself (avoids a NaN azimuth at the origin). */
function offsetToLonLat(
  anchor: LonLat,
  east: number,
  north: number,
  directionDeg: number,
): LonLat {
  const dist = Math.hypot(east, north);
  if (dist === 0) return { lon: anchor.lon, lat: anchor.lat };
  const azimuth = rotateAzimuth(Math.atan2(east, north) * R2D, directionDeg); // 0 = +Y = North
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
