// Inspector.tsx — the right panel: numeric editor for the single selected object (design §5). Reads
// selection[0] → the object reference (Object.is-stable across unrelated store changes, so panning the
// map never re-renders this) → its catalog metadata. Edits route through the store mutations
// (moveObject / rotateObject / setHeight / scaleObject / setLabel / setLocked) so the map's O(changed)
// footprint diff stays intact. M2d added scale, label, lock and the lazy elevation fetch (HeightControl).
import { useState } from "react";
import type { CatalogObject, PlacedXref } from "../../core/project/types";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { HeightControl } from "./HeightControl";
import { NumberInput } from "./NumberInput";

/** Object note — local draft committed on blur/Enter (one undo entry, not one per key; Escape reverts).
 *  Empty/whitespace clears the field (mutate.setLabel drops it). Mirrors TopBar's ProjectNameField. */
function LabelField({ id, label }: { id: string; label: string | undefined }): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft !== null) {
      const next = draft.trim();
      if (next !== (label ?? "")) editorStore.getState().setLabel(id, next || undefined);
    }
    setDraft(null);
  };
  return (
    <label className="pct-field pct-field-col">
      <span className="pct-field-label">Label</span>
      <input
        className="pct-text"
        type="text"
        value={draft ?? label ?? ""}
        placeholder="Add a note…"
        aria-label="Object label"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setDraft(null);
        }}
      />
    </label>
  );
}

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
            // clamp into ±180/±90 so a slipped decimal can't write an out-of-range, unloadable project (C1)
            onCommit={(lon) => store().moveObject(obj.id, clampLonLat({ lon, lat: obj.position.lat }))}
            ariaLabel="Longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={obj.position.lat}
            format={(n) => n.toFixed(6)}
            onCommit={(lat) => store().moveObject(obj.id, clampLonLat({ lon: obj.position.lon, lat }))}
            ariaLabel="Latitude"
          />
        </label>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Direction °</span>
          <NumberInput
            id="pct-inspector-direction"
            value={obj.direction}
            format={(n) => n.toFixed(1)}
            onCommit={(d) => store().rotateObject(obj.id, d)}
            ariaLabel="Direction in degrees"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Scale ×</span>
          <NumberInput
            value={obj.scale}
            format={(n) => n.toFixed(2)}
            // scale_factor must stay > 0 (design §2.2); a non-positive entry reverts to the store value.
            onCommit={(f) => {
              if (f > 0) store().scaleObject(obj.id, f);
            }}
            ariaLabel="Scale factor"
          />
        </label>
      </div>

      <HeightControl id={obj.id} height={obj.height} resolvedAsl={resolvedAsl} />

      <LabelField id={obj.id} label={obj.label} />
      <label className="pct-lock">
        <input
          type="checkbox"
          checked={obj.locked ?? false}
          onChange={(e) => store().setLocked(obj.id, e.target.checked)}
        />
        <span>Lock — ignore map drag &amp; rotate</span>
      </label>
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
        // Key by id so every draft (lon/lat/direction/scale/label + the fetch spinner) resets on a
        // selection change; an EDIT to the same object keeps the id, so the panel is not torn down.
        <ObjectFields key={obj.id} obj={obj} meta={meta} resolvedAsl={resolvedAsl} />
      ) : (
        <p className="pct-empty">
          {selCount === 0 ? "Select an object on the map" : `${selCount} objects selected`}
        </p>
      )}
    </aside>
  );
}
