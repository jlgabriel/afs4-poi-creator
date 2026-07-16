// rowInfo.ts — the pure "what does this placed object look like in a list row" resolution, split out of
// PlacedList.tsx so it carries no React/store import and unit-tests under the node config. Same
// node-testable-boundary idiom as map/syncDiff.ts and map/rotate.ts.

import type {
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  PlacedObject,
} from "../../core/project/types";
import { plantKey } from "../../core/catalog/plants";
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
  plantIndex: Map<string, CatalogPlant>,
): RowInfo {
  const missing = isMissing(o, catalogIndex, airportLightIndex, plantIndex);
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
  if (o.kind === "plant") {
    const meta = plantIndex.get(plantKey(o));
    // The fallback label is the raw pair, not a prettified guess: if the catalog lacks it, the row is
    // already flagged missing, and the exact `group/species` is what the user needs in order to see WHY.
    return {
      category: meta?.category ?? "plants/other",
      name: o.label || meta?.displayName || plantKey(o),
      missing,
    };
  }
  return { category: "lights/point", name: o.label || "Point light", missing };
}
