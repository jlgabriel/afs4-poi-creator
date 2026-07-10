// rotate.ts — the pure math behind the map's rotate handle, split out of FootprintLayer so it carries
// no Leaflet import and unit-tests under the node config (importing Leaflet in Node throws — it touches
// `window` at module load). Same node-testable-boundary idiom as syncDiff.ts.
//
// The bearing itself comes from geo.initialBearing (already parity-tested); the only new logic worth a
// test is the Shift-snap, so that lives here.

/** Round an angle (degrees) to the nearest multiple of `step`, normalised into [0, 360).
 *  Used for the rotate handle's Shift-snap (design §5): snapAngle(bearing, 5). Wraps 360 → 0 and
 *  folds negatives back into range, so the committed `direction` is always clean. */
export function snapAngle(deg: number, step: number): number {
  return (((Math.round(deg / step) * step) % 360) + 360) % 360;
}
