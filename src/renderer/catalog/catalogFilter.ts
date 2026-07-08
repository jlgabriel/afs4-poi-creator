// catalogFilter.ts — the pure predicate behind the CatalogPanel search. Kept React-free so it
// unit-tests under the node config. Case-insensitive substring across displayName / name / category,
// gated by the optional category filter (design §5: "search filters across name/displayName/category").
import type { CatalogObject } from "../../core/project/types";
import type { Filter } from "../state/store";

export function matchesFilter(o: CatalogObject, f: Filter): boolean {
  if (f.category !== null && o.category !== f.category) return false;
  if (f.query === "") return true;
  const q = f.query.toLowerCase();
  return (
    o.displayName.toLowerCase().includes(q) ||
    o.name.toLowerCase().includes(q) ||
    o.category.toLowerCase().includes(q)
  );
}
