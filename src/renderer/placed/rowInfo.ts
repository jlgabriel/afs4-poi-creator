// rowInfo.ts — the pure "what does this placed object look like in a list row" resolution, split out of
// PlacedList.tsx so it carries no React/store import and unit-tests under the node config. Same
// node-testable-boundary idiom as map/syncDiff.ts and map/rotate.ts.

import type { CatalogAirportLight, CatalogObject, PlacedObject } from "../../core/project/types";
import { isMissing } from "../map/syncDiff";

export interface RowInfo {
  category: string; // → CategoryIcon glyph
  name: string; // the user's label, else the catalog display name, else the raw id
  missing: boolean; // the install doesn't have it → the sim will silently skip it
}

/** Resolve a placed object's row against the catalog indexes, per kind. `missing` comes from the SAME
 *  predicate the map layer paints red (isMissing), so the two surfaces can never disagree. */
export function rowInfo(
  o: PlacedObject,
  catalogIndex: Map<string, CatalogObject>,
  airportLightIndex: Map<string, CatalogAirportLight>,
): RowInfo {
  const missing = isMissing(o, catalogIndex, airportLightIndex);
  if (o.kind === "xref") {
    const cat = catalogIndex.get(o.name);
    return { category: cat?.category ?? "various", name: o.label || cat?.displayName || o.name, missing };
  }
  if (o.kind === "airport_light") {
    const meta = airportLightIndex.get(o.typeName);
    return {
      category: meta?.category ?? "lights/other",
      name: o.label || meta?.displayName || o.typeName,
      missing,
    };
  }
  return { category: "lights/point", name: o.label || "Point light", missing };
}
