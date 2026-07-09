// PlacedList.tsx — the right panel's lower half: every placed object as a selectable row (design §5
// "PLACED LIST: all objects, click=select, dblclick=fly"). It's the map's twin — both are just views
// of the same store selection, so selecting here highlights the footprint and vice-versa, and the
// Inspector above follows selection[0]. Duplicate / Delete act on the current selection (the same
// store actions Ctrl+D / Del already call from the keyboard).
//
// Not virtualized: a POI is tens-to-low-hundreds of objects, not the catalog's 911; if dense scenes
// ever make this janky, it takes the same react-window treatment the catalog got.
import { useMemo } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { CategoryIcon } from "../catalog/categoryIcon";

export function PlacedList(): React.ReactElement {
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const catalogIndex = useEditor((s) => s.catalogIndex);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const hasSelection = selection.length > 0;

  return (
    <section className="pct-placed">
      <div className="pct-placed-head">
        <h2 className="pct-panel-title">Placed ({objects.length})</h2>
        <div className="pct-placed-actions">
          <button
            type="button"
            disabled={!hasSelection}
            title="Duplicate selection (Ctrl+D)"
            onClick={() => editorStore.getState().duplicateSelection()}
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={!hasSelection}
            title="Delete selection (Del)"
            onClick={() => editorStore.getState().deleteSelection()}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="pct-placed-list">
        {objects.length === 0 ? (
          <p className="pct-empty">No objects yet — click the map to place one.</p>
        ) : (
          objects.map((o) => {
            const cat = catalogIndex.get(o.name);
            const selected = selSet.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={selected ? "pct-placed-row sel" : "pct-placed-row"}
                aria-pressed={selected}
                title={o.name}
                onClick={(e) => editorStore.getState().select([o.id], e.shiftKey)}
                onDoubleClick={() => editorStore.getState().flyTo(o.position)}
              >
                <CategoryIcon category={cat?.category ?? "various"} />
                <span className="pct-placed-text">
                  <span className="pct-placed-name">{o.label || cat?.displayName || o.name}</span>
                  <span className="pct-placed-meta">
                    {o.position.lat.toFixed(4)}, {o.position.lon.toFixed(4)}
                    {o.locked ? " · locked" : ""}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
