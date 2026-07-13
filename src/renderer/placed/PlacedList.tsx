// PlacedList.tsx — the right panel's lower half: every placed object as a selectable row (design §5
// "PLACED LIST: all objects, click=select, dblclick=fly"). It's the map's twin — both are just views
// of the same store selection, so selecting here highlights the footprint and vice-versa, and the
// Inspector above follows selection[0]. Duplicate / Delete act on the current selection (the same
// store actions Ctrl+D / Del already call from the keyboard).
//
// Not virtualized: a POI is tens-to-low-hundreds of objects, not the catalog's 911; if dense scenes
// ever make this janky, it takes the same react-window treatment the catalog got.
import { useMemo } from "react";
import type { PlacedObject } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import type { EditorState } from "../state/store";
import { CategoryIcon } from "../catalog/categoryIcon";

/** The icon category + display name for a placed row, resolved per kind against the catalog indexes. */
function rowInfo(
  o: PlacedObject,
  catalogIndex: EditorState["catalogIndex"],
  airportLightIndex: EditorState["airportLightIndex"],
): { category: string; name: string } {
  if (o.kind === "xref") {
    const cat = catalogIndex.get(o.name);
    return { category: cat?.category ?? "various", name: o.label || cat?.displayName || o.name };
  }
  if (o.kind === "airport_light") {
    const meta = airportLightIndex.get(o.typeName);
    return {
      category: meta?.category ?? "lights/other",
      name: o.label || meta?.displayName || o.typeName,
    };
  }
  return { category: "lights/point", name: o.label || "Point light" };
}

export function PlacedList(): React.ReactElement {
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const catalogIndex = useEditor((s) => s.catalogIndex);
  const airportLightIndex = useEditor((s) => s.airportLightIndex);
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
            const info = rowInfo(o, catalogIndex, airportLightIndex);
            const selected = selSet.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={selected ? "pct-placed-row sel" : "pct-placed-row"}
                aria-pressed={selected}
                title={info.name}
                onClick={(e) => editorStore.getState().select([o.id], e.shiftKey)}
                onDoubleClick={() => editorStore.getState().flyTo(o.position)}
              >
                <CategoryIcon category={info.category} />
                <span className="pct-placed-text">
                  <span className="pct-placed-name">{info.name}</span>
                  <span className="pct-placed-meta">
                    lon {o.position.lon.toFixed(6)} · lat {o.position.lat.toFixed(6)}
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
