// sizeLabel.ts — how a card writes an object's dimensions. One spelling for all three families, so the
// Lights and Plants sections say "2.0 × 0.5 × 4.0 m" exactly as the XREF gallery has since M2a.
//
// A light or a plant only HAS dimensions once the user measured them (v0.9), so the suffix form collapses
// to "" when there are none — a card with no measurement looks precisely as it did before this feature.
import type { UserFootprint } from "../../core/project/types";

export interface Size3 {
  x: number;
  y: number;
  z: number;
}

/** "2.0 × 0.5 × 4.0 m" — width × depth × height, the order the footprint dialog asks for them in. */
export function sizeLabel(size: Size3): string {
  return `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} m`;
}

/** The same, as a subtitle tail (" · 2.0 × 0.5 × 4.0 m"), or "" for an entry nobody has measured. */
export function sizeSuffix(entry: UserFootprint | undefined): string {
  return entry?.size === undefined ? "" : ` · ${sizeLabel(entry.size)}`;
}
