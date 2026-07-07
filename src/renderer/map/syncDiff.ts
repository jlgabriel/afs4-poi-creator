// syncDiff.ts — the pure P1-5 reference-diff decision, split out from FootprintLayer so it carries no
// Leaflet import and unit-tests under the node config (importing Leaflet in Node throws — it touches
// `window` at module load). mutate.ts keeps untouched objects at the same reference, so the layer can
// skip them and only rebuild what actually changed, keeping sync O(changed).

import type { PlacedXref } from "../../core/project/types";

/** `skip` = untouched, `restyle` = only the selection flag flipped (same object reference),
 *  `rebuild` = geometry (object reference) changed, or the entry is brand new. */
export type SyncAction = "skip" | "restyle" | "rebuild";

export function diffEntry(
  prev: { obj: PlacedXref; selected: boolean } | undefined,
  obj: PlacedXref,
  selected: boolean,
): SyncAction {
  if (!prev) return "rebuild";
  if (prev.obj === obj && prev.selected === selected) return "skip";
  if (prev.obj === obj) return "restyle";
  return "rebuild";
}
