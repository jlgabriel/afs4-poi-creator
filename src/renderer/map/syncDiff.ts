// syncDiff.ts — the pure P1-5 reference-diff decision, split out from FootprintLayer so it carries no
// Leaflet import and unit-tests under the node config (importing Leaflet in Node throws — it touches
// `window` at module load). mutate.ts keeps untouched objects at the same reference, so the layer can
// skip them and only rebuild what actually changed, keeping sync O(changed).

import type { PlacedObject } from "../../core/project/types";

/** `skip` = untouched, `restyle` = only the selection flag flipped (same object reference),
 *  `rebuild` = geometry (object reference) changed, the catalog changed, or the entry is brand new. */
export type SyncAction = "skip" | "restyle" | "rebuild";

/** `indexChanged` = the catalog index was swapped (a Rescan). It changes an object's footprint bbox and
 *  its missing (red) state even though the object reference is untouched, so the reference-diff must NOT
 *  skip it — force a rebuild of every existing entry (Fable I3). */
export function diffEntry(
  prev: { obj: PlacedObject; selected: boolean } | undefined,
  obj: PlacedObject,
  selected: boolean,
  indexChanged = false,
): SyncAction {
  if (!prev) return "rebuild";
  if (indexChanged) return "rebuild";
  if (prev.obj === obj && prev.selected === selected) return "skip";
  if (prev.obj === obj) return "restyle";
  return "rebuild";
}
