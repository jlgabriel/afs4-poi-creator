// catalogTree.ts — pure derivation of the catalog's category tree (top-level → sub-category) with
// per-node counts, for the CatalogPanel's CategoryTree (design §2.4: "category tree ... with
// per-node counts"). React-free so it unit-tests under the node config, exactly like catalogFilter.ts.
//
// Categories are display-taxonomy paths: two-level ("buildings/tower", "vehicles/cars") or
// single-level ("jetways", "people", "various"). The FIRST "/" splits top from sub; a category
// with no "/" is its own top-level leaf. A node's `path` is exactly what goes into filter.category
// — matchesFilter treats it as a PREFIX, so selecting a top-level node ("buildings") matches every
// object under it while a sub node ("buildings/tower") matches just that leaf.
import type { CatalogObject } from "../../core/project/types";

export interface CategoryNode {
  path: string; // the filter value: "buildings" or "buildings/tower"
  label: string; // display label of this node alone: "buildings" or "tower"
  count: number; // objects at or under this node
  children: CategoryNode[]; // sub-categories, sorted; empty for single-level tops
}

export interface CatalogTree {
  total: number; // every object (the "All" count)
  nodes: CategoryNode[]; // top-level nodes, sorted by label
}

/** Split a category path at its first "/". "buildings/tower" → ["buildings", "tower"];
 *  "jetways" → ["jetways", null]. */
function splitCategory(category: string): [string, string | null] {
  const i = category.indexOf("/");
  return i === -1 ? [category, null] : [category.slice(0, i), category.slice(i + 1)];
}

const byLabel = (a: { label: string }, b: { label: string }): number =>
  a.label.localeCompare(b.label);

/** Group a scanned catalog's objects into a two-level category tree with counts. Pure: array in,
 *  tree out. Stable alphabetical order at both levels so the panel never reshuffles between renders. */
export function buildCatalogTree(objects: readonly CatalogObject[]): CatalogTree {
  // top label → { objects under it, sub label → count }
  const tops = new Map<string, { count: number; subs: Map<string, number> }>();
  for (const o of objects) {
    const [top, sub] = splitCategory(o.category);
    let entry = tops.get(top);
    if (!entry) {
      entry = { count: 0, subs: new Map() };
      tops.set(top, entry);
    }
    entry.count += 1;
    if (sub !== null) entry.subs.set(sub, (entry.subs.get(sub) ?? 0) + 1);
  }

  const nodes: CategoryNode[] = [];
  for (const [top, entry] of tops) {
    const children: CategoryNode[] = [...entry.subs]
      .map(([sub, count]) => ({ path: `${top}/${sub}`, label: sub, count, children: [] }))
      .sort(byLabel);
    nodes.push({ path: top, label: top, count: entry.count, children });
  }
  nodes.sort(byLabel);
  return { total: objects.length, nodes };
}
