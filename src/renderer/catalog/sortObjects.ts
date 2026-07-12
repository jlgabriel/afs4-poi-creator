// sortObjects.ts — the catalog browse order. Objects arrive from the .tmi scan in file order; the
// panel lists them A–Z by display name (community request — chrispriv & Michael, v0.1.1), then within
// a shared display name by physical size, smallest-first (Michael, v0.1.2 — the size is shown on each
// card but the same-name variants came out unordered). Kept as a pure comparator so it's unit-tested
// without standing up the store. `name` is the final tiebreaker so same-display-name AND same-size
// install/user duplicates keep a deterministic order (and, with a stable sort, the original
// install-before-user order — which the name→object index relies on).
import type { CatalogObject } from "../../core/project/types";

export function byDisplayName(a: CatalogObject, b: CatalogObject): number {
  return a.displayName.localeCompare(b.displayName) || bySize(a, b) || a.name.localeCompare(b.name);
}

/** Order same-name variants small → large by their dimensions sorted descending (longest side, then
 *  next, then shortest). Orientation-independent, so it doesn't matter which model axis holds the
 *  "length": the 20 "Jetway Footway" pieces (only their length varies) read 7.5 → 13.5 m instead of
 *  the raw _1.._20 name order, and any other same-name family (hangars, tanks…) reads shortest-first. */
function bySize(a: CatalogObject, b: CatalogObject): number {
  const da = [a.size.x, a.size.y, a.size.z].sort((m, n) => n - m);
  const db = [b.size.x, b.size.y, b.size.z].sort((m, n) => n - m);
  return da[0] - db[0] || da[1] - db[1] || da[2] - db[2];
}
