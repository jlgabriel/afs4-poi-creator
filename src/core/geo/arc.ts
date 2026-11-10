// arc.ts — an edge of a painted line bent into a CIRCULAR ARC, described by one signed number: its
// SAGITTA, the distance in metres from the middle of the straight edge to the middle of the arc.
// Positive bends to the LEFT of travel (from the edge's first point to its second), negative to the right,
// 0 is straight.
//
// Why a sagitta and not a control point: it is relative to the edge, so moving either end — or the whole
// line — keeps the curve's shape without touching it, and a straight edge is literally 0. Why a circle and
// not a Bézier: two edges bent by half their chord each make an exact circle, and airport fillets are arcs.
//
// The arcs are expanded into points only where points are needed (the map's path, Export TAP); the
// document keeps the few vertices the user placed.
//
// Distances are worked out in a local flat frame around the edge (east/north metres). At the size of an
// airport the error is far below anything the sim or the map can show.
import type { LonLat } from "../project/types";
import { EARTH_RADIUS_M } from "./geo";

const D2R = Math.PI / 180;

/** How far the polyline that replaces an arc may stray from the true arc, metres. */
const ARC_TOLERANCE_M = 0.1;
/** The widest turn one segment of an expanded arc may take, radians (15°). */
const MAX_STEP = Math.PI / 12;
/** The most segments one edge expands into. */
const MAX_SEGMENTS = 64;

interface XY {
  x: number;
  y: number;
}

/** The flat frame around `o`: x east, y north, metres. */
function frame(o: LonLat): { to(p: LonLat): XY; from(q: XY): LonLat } {
  const k = EARTH_RADIUS_M * D2R;
  const c = Math.cos(o.lat * D2R);
  return {
    to: (p) => ({ x: (p.lon - o.lon) * k * c, y: (p.lat - o.lat) * k }),
    from: (q) => ({ lon: o.lon + q.x / (k * c), lat: o.lat + q.y / k }),
  };
}

/** The straight distance between two points in that flat frame, metres. */
export function chordLength(a: LonLat, b: LonLat): number {
  const f = frame(a);
  const q = f.to(b);
  return Math.hypot(q.x, q.y);
}

/** A sagitta kept inside what an edge of this length can carry: at most the chord itself either way (an
 *  arc of about 253°), and 0 for anything that is not a finite number. */
export function clampSagitta(s: number, chord: number): number {
  if (!Number.isFinite(s)) return 0;
  return Math.max(-chord, Math.min(chord, s));
}

/** The middle of the bent edge — where the map puts the handle that bends it. */
export function arcMidpoint(a: LonLat, b: LonLat, sagitta: number): LonLat {
  const f = frame(a);
  const B = f.to(b);
  const c = Math.hypot(B.x, B.y);
  const s = clampSagitta(sagitta, c);
  if (c === 0 || s === 0) return f.from({ x: B.x / 2, y: B.y / 2 });
  // Left normal of a→b.
  return f.from({ x: B.x / 2 - (B.y / c) * s, y: B.y / 2 + (B.x / c) * s });
}

/** The signed distance of `p` from the straight edge a→b, metres, + = left of travel. Dragging the handle
 *  to `p` bends the edge by this much. */
export function sagittaAt(a: LonLat, b: LonLat, p: LonLat): number {
  const f = frame(a);
  const B = f.to(b);
  const P = f.to(p);
  const c = Math.hypot(B.x, B.y);
  if (c === 0) return 0;
  return clampSagitta((B.x * P.y - B.y * P.x) / c, c);
}

/** The sagitta of each HALF of a bent edge, when a point is put at its middle: both halves lie on the same
 *  circle, so the curve does not move. */
export function halfSagitta(a: LonLat, b: LonLat, sagitta: number): number {
  const c = chordLength(a, b);
  const s = clampSagitta(sagitta, c);
  if (c === 0 || s === 0) return 0;
  const r = (c * c) / (8 * Math.abs(s)) + Math.abs(s) / 2;
  const half = Math.hypot(c / 2, Math.abs(s)) / 2; // half of the chord from an end to the arc's middle
  return Math.sign(s) * (r - Math.sqrt(Math.max(0, r * r - half * half)));
}

/** The points strictly BETWEEN a and b along the arc (none for a straight edge). */
export function arcInterior(a: LonLat, b: LonLat, sagitta: number): LonLat[] {
  const f = frame(a);
  const B = f.to(b);
  const c = Math.hypot(B.x, B.y);
  const s = clampSagitta(sagitta, c);
  if (c === 0 || Math.abs(s) < 1e-6) return [];
  const abs = Math.abs(s);
  const r = (c * c) / (8 * abs) + abs / 2;
  // The centre sits on the perpendicular through the chord's middle, on the side away from the bulge
  // (or beyond the chord when the arc is more than half a circle).
  const nx = -B.y / c;
  const ny = B.x / c;
  const toCentre = r - abs; // from the chord's middle, measured AGAINST the bulge
  const sign = Math.sign(s);
  const cx = B.x / 2 - nx * sign * toCentre;
  const cy = B.y / 2 - ny * sign * toCentre;
  const sweep = 4 * Math.atan((2 * abs) / c); // the arc's whole angle
  const start = Math.atan2(-cy, -cx);
  // Walk the way that passes through the bulge: a bulge to the LEFT is passed clockwise around the centre.
  const dir = -sign;
  const step = Math.min(MAX_STEP, ARC_TOLERANCE_M < r ? 2 * Math.acos(1 - ARC_TOLERANCE_M / r) : MAX_STEP);
  const n = Math.min(MAX_SEGMENTS, Math.max(2, Math.ceil(sweep / step)));
  const out: LonLat[] = [];
  for (let i = 1; i < n; i++) {
    const t = start + dir * (sweep * i) / n;
    out.push(f.from({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }));
  }
  return out;
}

/** A polyline (or, `closed`, a ring) with each edge bent by its sagitta, as plain points. `bends[i]` bends
 *  the edge that leaves point i; missing entries are straight. Points are copied; no bends returns the
 *  points themselves. */
export function curvedPath(points: readonly LonLat[], bends: readonly number[] | undefined, closed = false): LonLat[] {
  if (bends === undefined || bends.every((s) => s === 0) || points.length < 2) return [...points];
  const n = points.length;
  const edges = closed ? n : n - 1;
  const out: LonLat[] = [];
  for (let i = 0; i < edges; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    out.push(a, ...arcInterior(a, b, bends[i] ?? 0));
  }
  if (!closed) out.push(points[n - 1]!);
  return out;
}

/** The bends once vertex `index` of `n` is removed: the two edges that met there become one, straight. */
export function bendsWithout(bends: number[], index: number, n: number, closed: boolean): number[] {
  if (!closed) {
    if (index === 0) return bends.slice(1);
    if (index === n - 1) return bends.slice(0, -1);
    return [...bends.slice(0, index - 1), 0, ...bends.slice(index + 1)];
  }
  if (index === 0) return [...bends.slice(1, n - 1), 0];
  return [...bends.slice(0, index - 1), 0, ...bends.slice(index + 1)];
}
