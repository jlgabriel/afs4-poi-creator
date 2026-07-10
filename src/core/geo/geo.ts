// geo.ts — numeric twin of afs4-pylon-race editor/js/geo.js (itself a twin of geo.py).
//
// IMPORTANT: keep this numerically identical to geo.js — same constants, same formulas,
// same order of operations. Then the footprints and coordinates PCT computes match what the
// Race App and the sim use. Parity vectors live in tests/unit/geo.test.ts.
//
// Conventions (same as geo.js):
//   - points are { lon, lat } in degrees.
//   - bearing/orientation is a compass azimuth: 0 = North, 90 = East, clockwise.

import type { LonLat } from "../project/types";

export const EARTH_RADIUS_M = 6371008.8; // mean Earth radius (IUGG) — one radius everywhere

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Great-circle distance in metres. */
export function haversine(a: LonLat, b: LonLat): number {
  const lat1 = a.lat * D2R;
  const lat2 = b.lat * D2R;
  const dlat = (b.lat - a.lat) * D2R;
  const dlon = (b.lon - a.lon) * D2R;
  const h =
    Math.sin(dlat / 2) * Math.sin(dlat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) * Math.sin(dlon / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Initial great-circle bearing from a to b, degrees in [0, 360). */
export function initialBearing(a: LonLat, b: LonLat): number {
  const lat1 = a.lat * D2R;
  const lat2 = b.lat * D2R;
  const dlon = (b.lon - a.lon) * D2R;
  const x = Math.sin(dlon) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon);
  return (Math.atan2(x, y) * R2D + 360) % 360;
}

/** Point reached from p after distanceM metres along bearingDeg. */
export function destination(p: LonLat, distanceM: number, bearingDeg: number): LonLat {
  const ang = distanceM / EARTH_RADIUS_M;
  const br = bearingDeg * D2R;
  const lat1 = p.lat * D2R;
  const lon1 = p.lon * D2R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lon: lon2 * R2D, lat: lat2 * R2D };
}

/** Nudge a point by (east, north) metres — a compass-consistent wrapper over `destination`
 *  (0 = North, 90 = East). Either component may be negative; (0, 0) returns the point unchanged.
 *  Used for the project-global export shift (design: Project.shift / forum #12). */
export function shiftEastNorth(p: LonLat, east: number, north: number): LonLat {
  if (east === 0 && north === 0) return p;
  const distanceM = Math.hypot(east, north);
  const bearingDeg = (Math.atan2(east, north) * R2D + 360) % 360;
  return destination(p, distanceM, bearingDeg);
}
