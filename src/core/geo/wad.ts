// wad.ts — degrees → the values FS4 stores INTERNALLY in its world-airport database (`.wad`).
//
// A `.wad` does not hold lon/lat in degrees: it holds a projected pair on a 0–65536 grid (0 = 180° W,
// 32768 = Greenwich, 65536 = 180° E) and rotations in radians. The `.toc`/`.tsl` PCT exports are plain
// degrees; these conversions feed the Inspector's read-out (values a user pastes into a hand-built
// heliport) and the airport writer.
import { headingToDirection } from "./orientation";

/** Grid span of the `.wad` coordinate system: the full 360° of longitude / 180° of latitude. */
export const WAD_SPAN = 65536;

/** Latitude-projection constant. It is the root of `tan(K/2) = K`, which is exactly what makes ±90°
 *  land on 0 and 65536 — so this is a TANGENT projection, not Mercator (they differ by 53 km at 49°). */
export const WAD_LAT_K = 2.3311223704144;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

// The heading↔direction mapping stays in orientation.ts; this module only composes with it.

/** Longitude in degrees → its `.wad` value. Linear: −180 → 0, 0 → 32768, +180 → 65536. */
export function lonToWad(lonDeg: number): number {
  return WAD_SPAN * (0.5 + (0.5 * lonDeg) / 180);
}

/** Latitude in degrees → its `.wad` value. −90 → 0, 0 → 32768, +90 → 65536. */
export function latToWad(latDeg: number): number {
  return WAD_SPAN * (0.5 + 0.5 * (Math.tan((WAD_LAT_K * latDeg) / 180) / WAD_LAT_K));
}

/** A raw `.toc` rotation (degrees) → the same rotation in radians, which is how a `.wad` stores it.
 *
 *  There is no second formula here on purpose: the `.wad` value is `radians((90 − heading) mod 360)`,
 *  and `(90 − heading) mod 360` IS the raw `direction` PCT already stores (see orientation.ts) — so
 *  this is a unit change only, and the heading mapping stays in exactly one place. */
export function directionToWad(directionDeg: number): number {
  return (norm360(directionDeg) * Math.PI) / 180;
}

/** A COMPASS HEADING, the thing the Inspector's fields actually hold, → the `.wad` direction in radians.
 *
 *  Two callers must agree to the last digit: the writer that puts the number in the file, and the
 *  read-out that shows the user the number to paste (inspector/WadReadout.tsx). Don't "simplify" either
 *  to `directionToWad(heading)` — that prints a plausible wrong number (the two agree only at 45°). */
export function headingToWadDirection(headingDeg: number): number {
  return directionToWad(headingToDirection(headingDeg));
}

/** Decimals used to print every `.wad` value — the precision `.wad` files use, so what the panel shows
 *  can be pasted verbatim. */
export const WAD_DECIMALS = 10;

/** Format a `.wad` value the way the files do. */
export function formatWad(value: number): string {
  return value.toFixed(WAD_DECIMALS);
}
