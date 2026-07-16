// syncDiff.ts — the pure P1-5 reference-diff decision, split out from FootprintLayer so it carries no
// Leaflet import and unit-tests under the node config (importing Leaflet in Node throws — it touches
// `window` at module load). mutate.ts keeps untouched objects at the same reference, so the layer can
// skip them and only rebuild what actually changed, keeping sync O(changed).

import { plantKey } from "../../core/catalog/plants";
import type {
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  PlacedObject,
} from "../../core/project/types";

/** Does this object name something the scanned install doesn't have? An xref names a catalog object, an
 *  airport_light names a scanned fixture and a plant names a group+species pair, so any of the three can
 *  dangle — a project shared on the forum may reference something the opener doesn't own. A parametric
 *  point light names nothing (its parameters ARE the light), so it can never be missing.
 *
 *  Missing is not fatal: the in-sim gate (V6) proved AFS4 silently SKIPS an unknown name and keeps parsing
 *  the rest of the file. But it renders as NOTHING, so the editor has to say so — before this, a placed
 *  fixture the user didn't have simply vanished at export with no warning anywhere in the UI. That silence
 *  is exactly why a plant is checked here too: every install ships the same 41 today, so this looks
 *  redundant — but a plant name is assembled from two fields, which is one more chance to dangle than an
 *  xref has, and the failure mode is an invisible object with no error anywhere. */
export function isMissing(
  obj: PlacedObject,
  xrefIndex: Map<string, CatalogObject>,
  lightIndex: Map<string, CatalogAirportLight>,
  plantIndex: Map<string, CatalogPlant>,
): boolean {
  if (obj.kind === "xref") return !xrefIndex.has(obj.name);
  if (obj.kind === "airport_light") return !lightIndex.has(obj.typeName);
  if (obj.kind === "plant") return !plantIndex.has(plantKey(obj));
  return false;
}

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
