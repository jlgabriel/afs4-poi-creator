// runwayStrip.ts — the four corners of a runway drawn at its real width.
//
// Its own module, leaflet-free, for the same reason footprintBox and syncDiff are: RunwayLayer imports
// leaflet, which needs a DOM, and the unit tests run under the node environment. The geometry is the part
// worth testing; the Leaflet plumbing around it is not.

import type { LonLat } from "../../core/project/types";
import { destination, initialBearing } from "../../core/geo/geo";

/** The four corners of the strip, in draw order (a-left, b-left, b-right, a-right): each threshold pushed
 *  half the width to either side of the runway's own bearing.
 *
 *  ★ `width` is the FULL width, and it is halved here. That is the one thing to get right and the one
 *  place the model differs from its neighbours — a pad's `radius` and a stand's `size` are radii, but a
 *  runway's `width` really is the whole strip (types.ts: "here it really is the full width"; his
 *  reference airports carry 40 for a 40 m runway). Reading it as a radius would draw every runway twice
 *  as wide as the sim lands on.
 *
 *  Degenerate input is not special-cased: two identical thresholds give a zero-length strip (initialBearing
 *  returns 0, so the corners collapse onto a line across the point), which is exactly what the map should
 *  show for a runway whose ends have been dragged together — a mistake made visible, not hidden. */
export function stripCorners(a: LonLat, b: LonLat, width: number): LonLat[] {
  const half = Math.max(width, 0) / 2;
  const bearing = initialBearing(a, b);
  const left = bearing - 90;
  const right = bearing + 90;
  return [
    destination(a, half, left),
    destination(b, half, left),
    destination(b, half, right),
    destination(a, half, right),
  ];
}
