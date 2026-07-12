// sortObjects.ts — the catalog browse order. Objects arrive from the .tmi scan in file order; the
// panel lists them A–Z by display name (community request — chrispriv & Michael, v0.1.1). Kept as a
// pure comparator so it's unit-tested without standing up the store. `name` is the tiebreaker so
// same-display-name install/user duplicates keep a deterministic order (and, with a stable sort, the
// original install-before-user order — which the name→object index relies on).
import type { CatalogObject } from "../../core/project/types";

export function byDisplayName(a: CatalogObject, b: CatalogObject): number {
  return a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name);
}
