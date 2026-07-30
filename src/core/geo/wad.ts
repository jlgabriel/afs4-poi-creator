// wad.ts — degrees → the values FS4 stores INTERNALLY in its world-airport database (`.wad`).
//
// A `.wad` does not hold lon/lat in degrees: it holds a projected pair on a 0–65536 grid (0 = 180° W,
// 32768 = Greenwich, 65536 = 180° E) and rotations in radians. Nothing PCT writes needs this — the
// `.toc`/`.tsl` it exports are plain degrees. It exists purely as a READ-OUT (forum #150, ApfelFlieger):
// people who hand-build heliports must translate every coordinate into these units, and were doing it
// with a private spreadsheet. PCT already knows the numbers, so it can just show the conversion.
//
// ⚠️ Displaying is the whole feature. PCT still does not emit `.wad`/`.tsc` — a user `.tsc` silently
// OVERWRITES a base airport that shares its ICAO, and PCT cannot validate an ICAO on a machine it has
// never seen, while POIs get shared. Staying additive and reversible is the product line; a read-out
// does not cross it.
//
// PROVENANCE: the three conversions are ApfelFlieger's (forum #113, his TAP/TOC/TSC/WAD/TSL sheet). They
// were verified INDEPENDENTLY before shipping — by inverting float64s out of 47 binary IPACS `.wad`
// files, where the tangent latitude beats a Mercator hypothesis 46 to 1 — and they reproduce his own
// hand-built `de0869.wad` to all ten printed decimals. Both facts are documented in
// `reference/AFS4_KNOWLEDGE_BASE_EN.md` §12.

/** Grid span of the `.wad` coordinate system: the full 360° of longitude / 180° of latitude. */
export const WAD_SPAN = 65536;

/** Latitude-projection constant. It is the root of `tan(K/2) = K`, which is exactly what makes ±90°
 *  land on 0 and 65536 — so this is a TANGENT projection, not Mercator (they differ by 53 km at 49°). */
export const WAD_LAT_K = 2.3311223704144;

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

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
 *  There is no second formula here on purpose. The sheet states it as `radians((90 − heading) mod 360)`,
 *  and `(90 − heading) mod 360` IS the raw `direction` PCT already stores (see orientation.ts) — so the
 *  conversion the user needs is a unit change on a number the project already holds, and the calibrated
 *  heading mapping stays in exactly one place. */
export function directionToWad(directionDeg: number): number {
  return (norm360(directionDeg) * Math.PI) / 180;
}

/** Decimals used to print every `.wad` value. Matches the ten that IPACS's own files carry, so what the
 *  panel shows can be pasted verbatim. */
export const WAD_DECIMALS = 10;

/** Format a `.wad` value the way the files do. */
export function formatWad(value: number): string {
  return value.toFixed(WAD_DECIMALS);
}
