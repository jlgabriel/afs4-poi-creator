// polygon.ts — plane geometry for the airport polygons and lines (boundary, tarmacs, lines), on raw lon/lat.
//
// Lon/lat is treated as a plane here. That is exact for what these answer — whether two segments cross,
// where a segment's midpoint is — at airport scale, away from the antimeridian, which no airport spans.
import type { LonLat } from "../project/types";

/** The midpoint of a segment. */
export function midpoint(a: LonLat, b: LonLat): LonLat {
  return { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2 };
}

const cross = (o: LonLat, a: LonLat, b: LonLat): number =>
  (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon);

/** Do segments ab and cd cross at a point interior to both? Touching at an end point does not count. */
function segmentsCross(a: LonLat, b: LonLat, c: LonLat, d: LonLat): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Does a CLOSED ring (given open: the last point joins back to the first) cross itself? Two edges that
 *  share a vertex are never compared — they always meet there. */
export function ringSelfIntersects(points: readonly LonLat[]): boolean {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // the closing edge shares vertex 0 with edge 0
      if (segmentsCross(a, b, points[j]!, points[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/** The area of a CLOSED ring (given open), square metres. A local flat projection around the ring's
 *  first point — exact enough for a readout at airport scale. */
export function ringAreaM2(points: readonly LonLat[]): number {
  if (points.length < 3) return 0;
  const o = points[0]!;
  const kx = 111320 * Math.cos((o.lat * Math.PI) / 180);
  const ky = 110540;
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twice += (a.lon - o.lon) * kx * ((b.lat - o.lat) * ky) - (b.lon - o.lon) * kx * ((a.lat - o.lat) * ky);
  }
  return Math.abs(twice) / 2;
}
