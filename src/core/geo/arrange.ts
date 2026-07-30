// arrange.ts — put a group of placed objects into a tidy row (v0.9.2).
//
// The 2D-editor vocabulary ("align left", "align top") does not survive the trip to a map: left is
// WEST, and nobody wants seven parked aircraft snapped to the westernmost meridian. On a map the real
// request is "put them on the line they already almost form", and that line is hardly ever N-S or E-W —
// the row of B747s that prompted this (ApfelFlieger's KMZJ example, forum #152) runs at about 135°.
//
// So everything here is expressed in the row's own frame: ALONG the line and ACROSS it.
//
//     lineUp      →  across := 0        (straighten; each object keeps its place along the row)
//     spaceEvenly →  along  := even     (equalise the gaps; each object keeps its offset across)
//
// Which makes the two operations orthogonal and composable — run both and you get a clean row, run one
// and the other property is untouched. Applying them is the store's job (see nudgeSelection for the
// one-undo-entry-per-gesture pattern); this file is pure and knows nothing about objects or locking.

import type { LonLat } from "../project/types";
import { destination, haversine, initialBearing, wrapLon } from "./geo";

const D2R = Math.PI / 180;

/** Below this the "row" is a cluster of coincident points and its bearing is meaningless. Well above
 *  the 7-decimal (~1.1 cm) resolution the `.toc` can even express. */
const MIN_AXIS_M = 0.05;

/** A move smaller than this cannot survive being written at 7 decimals, so it is not a move: reporting
 *  it as one would put objects that are already in place into the undo stack. */
const EPS_M = 0.005;

/** The line a selection forms, defined by its two FARTHEST-APART members.
 *
 *  Deliberately not "first and last selected": selection order is invisible state the user cannot see
 *  or verify, while "the two ends of the row stay put and everything else moves between them" is a
 *  sentence they can predict. It is also order-independent — the same objects give the same axis
 *  however they were clicked. (Best-fit/PCA was the alternative; it moves the end objects too, which
 *  reads as the tool doing something you did not ask for.) */
export interface RowAxis {
  /** Indices into the input array of the two objects that define the row. */
  startIndex: number;
  endIndex: number;
  start: LonLat;
  /** Compass bearing start → end. */
  bearing: number;
  lengthM: number;
}

/** The farthest-apart pair, or null if there is no usable row (fewer than 2 points, or all coincident).
 *
 *  O(n²), which is the right call here: a POI holds tens to low hundreds of objects (the same reason
 *  PlacedList is not virtualized), and an exact answer with no spatial index beats a clever one. */
export function rowAxis(points: LonLat[]): RowAxis | null {
  let best = -1;
  let bi = 0;
  let bj = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = haversine(points[i], points[j]);
      if (d > best) {
        best = d;
        bi = i;
        bj = j;
      }
    }
  }
  if (best < MIN_AXIS_M) return null;
  return {
    startIndex: bi,
    endIndex: bj,
    start: points[bi],
    bearing: initialBearing(points[bi], points[bj]),
    lengthM: best,
  };
}

/** Decompose a point into metres ALONG the axis (from its start) and ACROSS it (positive = right of
 *  the bearing). Negative `along` means the point sits behind the start — possible, since the farthest
 *  pair bounds the row but a third point can still project just past an end.
 *
 *  This is the tangent-plane form, on purpose. The exact spherical along-track,
 *  `acos(cos(d13)/cos(dxt))`, divides two cosines that are both ~1 at POI distances and then takes an
 *  acos near 0 — catastrophic cancellation, jittering in the last digits of exactly the values we are
 *  trying to make tidy. What the approximation costs is measured in arrange.test.ts: a decompose →
 *  rebuild round trip lands within 0.3 mm on a 300 m row, against the ~1.1 cm the `.toc`'s 7 decimals
 *  can express at all. (Most of that residue is not this formula but the walk back out: a great circle
 *  has turned a little by the time you step off it sideways.) */
export function alongCross(axis: RowAxis, p: LonLat): { along: number; cross: number } {
  const d = haversine(axis.start, p);
  if (d === 0) return { along: 0, cross: 0 };
  const delta = (initialBearing(axis.start, p) - axis.bearing) * D2R;
  return { along: d * Math.cos(delta), cross: d * Math.sin(delta) };
}

/** Rebuild a position from its along/across pair — the inverse of alongCross. */
export function fromAlongCross(axis: RowAxis, along: number, cross: number): LonLat {
  // A negative distance travels the opposite way along the bearing (sin is odd, cos is even), so the
  // sign of `along`/`cross` needs no special case.
  const onLine = destination(axis.start, along, axis.bearing);
  const p = cross === 0 ? onLine : destination(onLine, cross, axis.bearing + 90);
  return { lon: wrapLon(p.lon), lat: p.lat };
}

/** Straighten: every point moves perpendicularly onto the row's line, keeping where it sits along it.
 *  The two objects that define the axis are already on the line, so they do not move.
 *
 *  Points that are already on the line come back as the SAME reference, which is how the caller tells
 *  a real move from a no-op (and how "line up an already-straight row" produces no undo entry). */
export function lineUp(points: LonLat[]): LonLat[] {
  const axis = rowAxis(points);
  if (!axis) return points;
  return points.map((p) => {
    const { along, cross } = alongCross(axis, p);
    return Math.abs(cross) < EPS_M ? p : fromAlongCross(axis, along, 0);
  });
}

/** Equalise the gaps: the outermost two along the row keep their place, the rest are spread evenly
 *  between them in the order they already lie. Each point keeps its offset ACROSS the row, so this
 *  re-spaces a curved row without straightening it — run lineUp too for that. */
export function spaceEvenly(points: LonLat[]): LonLat[] {
  const axis = rowAxis(points);
  if (!axis || points.length < 3) return points;
  const ac = points.map((p) => alongCross(axis, p));
  const order = ac.map((_, i) => i).sort((a, b) => ac[a].along - ac[b].along);
  const first = ac[order[0]].along;
  const last = ac[order[order.length - 1]].along;
  const step = (last - first) / (points.length - 1);
  const out = points.slice();
  order.forEach((idx, k) => {
    const target = first + step * k;
    if (Math.abs(target - ac[idx].along) >= EPS_M) {
      out[idx] = fromAlongCross(axis, target, ac[idx].cross);
    }
  });
  return out;
}
