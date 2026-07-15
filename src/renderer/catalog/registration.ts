// registration.ts — pure helpers for the user-XREF registration UI (design B2). React-free so they
// unit-test under the node config, like catalogFilter / browseVisibility.
import type { CatalogObject, PlacedObject } from "../../core/project/types";

/** Unique names of PLACED xref objects that resolve to an UNREGISTERED catalog entry — a loose user
 *  `.tmb` that won't render in the sim until it's registered. Drives the export dialog's warning. (You
 *  can't arm placement for an unregistered object, so these arrive only via an opened project.json that
 *  references a user model the current install hasn't registered.) */
export function unregisteredPlacedNames(
  objects: PlacedObject[],
  catalogIndex: Map<string, CatalogObject>,
): string[] {
  const names = new Set<string>();
  for (const o of objects) {
    if (o.kind !== "xref") continue;
    if (catalogIndex.get(o.name)?.unregistered) names.add(o.name);
  }
  return [...names];
}
