// CatalogPanel.tsx — the left panel: a search box over a plain list of catalog objects. Clicking a
// card arms placement (click the armed card again to disarm); the map then drops the object on click.
// M1e-5 scope: plain text cards (displayName · size · category), no SVG thumbnails / virtualization —
// those are M2. The filtered list is derived with useMemo over stably-selected catalog + filter (never
// build arrays inside a selector, or every unrelated store change re-renders the panel).
import { useMemo } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { matchesFilter } from "./catalogFilter";

export function CatalogPanel(): React.ReactElement {
  const catalog = useEditor((s) => s.catalog);
  const filter = useEditor((s) => s.filter);
  const placing = useEditor((s) => s.placing);

  const objects = useMemo(
    () => (catalog ? catalog.xref.filter((o) => matchesFilter(o, filter)) : []),
    [catalog, filter],
  );

  return (
    <section className="pct-catalog">
      <h2 className="pct-panel-title">Catalog</h2>
      <input
        className="pct-search"
        type="search"
        placeholder="Search objects…"
        value={filter.query}
        onChange={(e) => editorStore.getState().setFilter({ query: e.target.value })}
      />
      <div className="pct-catalog-list">
        {objects.length === 0 ? (
          <p className="pct-empty">{catalog ? "No matching objects" : "No catalog loaded"}</p>
        ) : (
          objects.map((o) => (
            <button
              key={o.name}
              type="button"
              className={placing === o.name ? "pct-obj-card armed" : "pct-obj-card"}
              title={o.name}
              onClick={() =>
                editorStore.getState().armPlacement(placing === o.name ? null : o.name)
              }
            >
              <span className="pct-obj-name">{o.displayName}</span>
              <span className="pct-obj-meta">
                {o.size.x.toFixed(1)} × {o.size.y.toFixed(1)} × {o.size.z.toFixed(1)} m
              </span>
              <span className="pct-obj-cat">{o.category}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
