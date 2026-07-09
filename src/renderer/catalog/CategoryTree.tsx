// CategoryTree.tsx — the category navigator above the object list (design §5: "Category tree from
// §2.4 with per-node counts"). Two levels: "All objects", then top-level nodes that expand to their
// sub-categories. Selecting a node writes its `path` to filter.category; matchesFilter treats a
// top-level path as a whole-segment prefix, so "buildings" shows every building while "buildings/tower"
// narrows to towers. Expand/collapse is local view state — it never touches the store or the document.
import { useState } from "react";
import type { CatalogTree } from "./catalogTree";

export interface CategoryTreeProps {
  tree: CatalogTree;
  active: string | null; // filter.category
  onSelect: (category: string | null) => void;
}

export function CategoryTree({ tree, active, onSelect }: CategoryTreeProps): React.ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (path: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <nav className="pct-cat-tree" aria-label="Categories">
      <button
        type="button"
        className={active === null ? "pct-cat-node all sel" : "pct-cat-node all"}
        aria-pressed={active === null}
        onClick={() => onSelect(null)}
      >
        <span className="pct-cat-label">All objects</span>
        <span className="pct-cat-count">{tree.total}</span>
      </button>

      {tree.nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.path);
        return (
          <div key={node.path} className="pct-cat-group">
            <div className="pct-cat-row">
              {hasChildren ? (
                <button
                  type="button"
                  className="pct-cat-toggle"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.label}`}
                  onClick={() => toggle(node.path)}
                >
                  {isOpen ? "▾" : "▸"}
                </button>
              ) : (
                <span className="pct-cat-toggle pct-cat-toggle-empty" aria-hidden="true" />
              )}
              <button
                type="button"
                className={active === node.path ? "pct-cat-node top sel" : "pct-cat-node top"}
                aria-pressed={active === node.path}
                onClick={() => onSelect(node.path)}
              >
                <span className="pct-cat-label">{node.label}</span>
                <span className="pct-cat-count">{node.count}</span>
              </button>
            </div>

            {hasChildren && isOpen && (
              <div className="pct-cat-children">
                {node.children.map((child) => (
                  <button
                    key={child.path}
                    type="button"
                    className={active === child.path ? "pct-cat-node sub sel" : "pct-cat-node sub"}
                    aria-pressed={active === child.path}
                    onClick={() => onSelect(child.path)}
                  >
                    <span className="pct-cat-label">{child.label}</span>
                    <span className="pct-cat-count">{child.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
