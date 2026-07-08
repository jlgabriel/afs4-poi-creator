// Inspector.tsx — the right panel: numeric editor for the single selected object (design §5). Reads
// selection[0] → the object reference (Object.is-stable across unrelated store changes, so panning the
// map never re-renders this) → its catalog metadata. Edits route through the store mutations
// (moveObject / rotateObject / setHeight) so the map's O(changed) footprint diff stays intact. M1e-5
// scope: lon/lat, direction, height; label/lock, scale, duplicate/delete-here and multi-edit are M2.
import type { CatalogObject, PlacedXref } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import { HeightControl } from "./HeightControl";
import { NumberInput } from "./NumberInput";

function ObjectFields({
  obj,
  meta,
  resolvedAsl,
}: {
  obj: PlacedXref;
  meta: CatalogObject | undefined;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">{meta?.displayName ?? obj.name}</div>

      <div className="pct-field">
        <span className="pct-field-label">Object</span>
        <span className="pct-xref">
          <code title={obj.name}>{obj.name}</code>
          <button
            type="button"
            className="pct-copy"
            title="Copy object name"
            onClick={() => void navigator.clipboard?.writeText(obj.name)}
          >
            Copy
          </button>
        </span>
      </div>
      <div className="pct-field-meta">
        {meta ? `${meta.category} · ${meta.bundle}` : <span className="pct-warn">not in catalog</span>}
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={obj.position.lon}
            format={(n) => n.toFixed(6)}
            onCommit={(lon) => store().moveObject(obj.id, { lon, lat: obj.position.lat })}
            ariaLabel="Longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={obj.position.lat}
            format={(n) => n.toFixed(6)}
            onCommit={(lat) => store().moveObject(obj.id, { lon: obj.position.lon, lat })}
            ariaLabel="Latitude"
          />
        </label>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Direction °</span>
        <NumberInput
          id="pct-inspector-direction"
          value={obj.direction}
          format={(n) => n.toFixed(1)}
          onCommit={(d) => store().rotateObject(obj.id, d)}
          ariaLabel="Direction in degrees"
        />
      </label>

      <HeightControl id={obj.id} height={obj.height} resolvedAsl={resolvedAsl} />
    </div>
  );
}

export function Inspector(): React.ReactElement {
  const selCount = useEditor((s) => s.selection.length);
  // Select the object REFERENCE directly — stable across unrelated store changes (no re-render on pan).
  const obj = useEditor((s) =>
    s.selection.length === 1 ? s.project.objects.find((o) => o.id === s.selection[0]) : undefined,
  );
  const meta = useEditor((s) => (obj ? s.catalogIndex.get(obj.name) : undefined));
  const resolvedAsl = useEditor((s) => (obj ? s.resolvedElev.get(obj.id) : undefined));

  return (
    <aside className="pct-inspector">
      <h2 className="pct-panel-title">Inspector</h2>
      {obj ? (
        <ObjectFields obj={obj} meta={meta} resolvedAsl={resolvedAsl} />
      ) : (
        <p className="pct-empty">
          {selCount === 0 ? "Select an object on the map" : `${selCount} objects selected`}
        </p>
      )}
    </aside>
  );
}
