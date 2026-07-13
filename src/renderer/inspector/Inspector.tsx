// Inspector.tsx — the right panel: numeric editor for the single selected object (design §5). Reads
// selection[0] → the object reference (Object.is-stable across unrelated store changes, so panning the
// map never re-renders this) → its catalog metadata. Edits route through the store mutations so the
// map's O(changed) footprint diff stays intact. v0.2 dispatches the body by `kind`: xref (footprint) |
// airport_light | light (the two point kinds), sharing the position row + height/label/lock tail.
import { useState } from "react";
import type {
  CatalogAirportLight,
  CatalogObject,
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedXref,
  Vec3,
} from "../../core/project/types";
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

/** Lon/Lat row — shared by every kind. Clamps into ±180/±90 so a slipped decimal can't write an
 *  out-of-range, unloadable project (Fable C1). */
function PositionRow({ obj }: { obj: PlacedObject }): React.ReactElement {
  const store = editorStore.getState;
  return (
    <div className="pct-field pct-field-row">
      <label className="pct-field-col">
        <span className="pct-field-label">Lon</span>
        <NumberInput
          value={obj.position.lon}
          format={(n) => n.toFixed(6)}
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
  );
}

/** Height + label + lock — identical across kinds. Height resolves to absolute ASL at export for every
 *  kind (in-sim gate 2026-07-12), so the same HeightControl serves lights and xrefs. */
function SharedTail({
  obj,
  resolvedAsl,
}: {
  obj: PlacedObject;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  return (
    <>
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
    </>
  );
}

/** Night-visibility group — carried by both light kinds. Doubles as the "lights only render at night"
 *  teaching cue (without it, "I placed a light and see nothing at noon" is the #1 support thread). */
function GroupIndexField({ id, value }: { id: string; value: number }): React.ReactElement {
  const store = editorStore.getState;
  return (
    <label className="pct-field pct-field-col">
      <span
        className="pct-field-label"
        title="Night-visibility window. Lights render around night; group 3 stays on 24 h."
      >
        Visibility group
      </span>
      <select
        className="pct-select"
        value={String(value)}
        onChange={(e) => store().setGroupIndex(id, Number(e.target.value))}
      >
        <option value="0">0 — night ±40 min</option>
        <option value="1">1 — night ±90 min</option>
        <option value="2">2 — night ±90 min</option>
        <option value="3">3 — always on (24 h)</option>
      </select>
    </label>
  );
}

// ── xref ───────────────────────────────────────────────────────────────────────
function XrefFields({
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

      <PositionRow obj={obj} />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span
            className="pct-field-label"
            title="Raw rotation stored in the .toc — not a compass heading. 0 = the object's built-in pose (varies per object); increases clockwise, normalized to 0–360°. To align, match the footprint rectangle to the imagery."
          >
            Direction °
          </span>
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
            onCommit={(f) => {
              if (f > 0) store().scaleObject(obj.id, f);
            }}
            ariaLabel="Scale factor"
          />
        </label>
      </div>

      <SharedTail obj={obj} resolvedAsl={resolvedAsl} />
    </div>
  );
}

// ── airport_light ────────────────────────────────────────────────────────────────
const COLOR_LETTERS: Array<[string, string]> = [
  ["", "—"],
  ["w", "White"],
  ["r", "Red"],
  ["g", "Green"],
  ["b", "Blue"],
  ["y", "Yellow"],
];

/** configuration = a primary colour letter + an optional opposite-direction letter ("wr" = white one
 *  way, red the other). Empty primary = the fixture's own default colour (and forces empty opposite). */
function ConfigurationField({ id, value }: { id: string; value: string }): React.ReactElement {
  const store = editorStore.getState;
  const primary = value[0] ?? "";
  const opposite = value[1] ?? "";
  const set = (p: string, o: string): void => store().setConfiguration(id, `${p}${o}`);
  return (
    <div className="pct-field pct-field-row">
      <label className="pct-field-col">
        <span className="pct-field-label" title="Empty = the fixture's own default colour">
          Colour
        </span>
        <select
          className="pct-select"
          value={primary}
          onChange={(e) => set(e.target.value, e.target.value ? opposite : "")}
        >
          {COLOR_LETTERS.map(([v, l]) => (
            <option key={v || "none"} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="pct-field-col">
        <span className="pct-field-label" title="A second colour shown toward the opposite direction">
          Opposite
        </span>
        <select
          className="pct-select"
          value={opposite}
          disabled={!primary}
          onChange={(e) => set(primary, e.target.value)}
        >
          {COLOR_LETTERS.map(([v, l]) => (
            <option key={v || "none"} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AirportLightFields({
  obj,
  meta,
  resolvedAsl,
}: {
  obj: PlacedAirportLight;
  meta: CatalogAirportLight | undefined;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  const fixtures = useEditor((s) => s.catalog?.airportLights);
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">{meta?.displayName ?? obj.typeName}</div>

      <div className="pct-field">
        <span className="pct-field-label">Airport light</span>
        <span className="pct-xref">
          <code title={obj.typeName}>{obj.typeName}</code>
          <button
            type="button"
            className="pct-copy"
            title="Copy type name"
            onClick={() => void navigator.clipboard?.writeText(obj.typeName)}
          >
            Copy
          </button>
        </span>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Fixture</span>
        <select
          className="pct-select"
          value={obj.typeName}
          onChange={(e) => store().setAirportLightType(obj.id, e.target.value)}
        >
          {(fixtures ?? []).map((l) => (
            <option key={l.typeName} value={l.typeName}>
              {l.displayName}
            </option>
          ))}
        </select>
      </label>

      <PositionRow obj={obj} />

      <label className="pct-field pct-field-col">
        <span
          className="pct-field-label"
          title="Raw rotation the light shines toward (model axis, not a compass heading). Drag the map handle or type it here. Matters when the colour has an opposite."
        >
          Orientation °
        </span>
        <NumberInput
          value={obj.orientation}
          format={(n) => n.toFixed(1)}
          onCommit={(d) => store().rotateObject(obj.id, d)}
          ariaLabel="Orientation in degrees"
        />
      </label>

      <ConfigurationField id={obj.id} value={obj.configuration} />
      <GroupIndexField id={obj.id} value={obj.groupIndex} />

      <SharedTail obj={obj} resolvedAsl={resolvedAsl} />
    </div>
  );
}

// ── light (parametric point light) ─────────────────────────────────────────────
const COLOR_CORNERS: Array<[string, Vec3]> = [
  ["Red", [1, 0, 0]],
  ["Green", [0, 1, 0]],
  ["Blue", [0, 0, 1]],
  ["Cyan", [0, 1, 1]],
  ["Magenta", [1, 0, 1]],
  ["Yellow", [1, 1, 0]],
  ["White", [1, 1, 1]],
];
const sameColor = (a: Vec3, b: Vec3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function LightFields({
  obj,
  resolvedAsl,
}: {
  obj: PlacedLight;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  const flashing = obj.flashing[0] > 0;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Point light</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Colour</span>
        <div className="pct-swatches">
          {COLOR_CORNERS.map(([name, c]) => {
            const sel = sameColor(obj.color, c);
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={sel}
                className={sel ? "pct-swatch sel" : "pct-swatch"}
                style={{ background: `rgb(${c[0] * 255}, ${c[1] * 255}, ${c[2] * 255})` }}
                onClick={() => store().setLightColor(obj.id, c)}
              />
            );
          })}
        </div>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label" title="0 = off · 1000 ≈ visible · up to 100000 = very bright">
          Intensity
        </span>
        <NumberInput
          value={obj.intensity}
          format={(n) => String(Math.round(n))}
          onCommit={(v) => {
            if (v >= 0) store().setIntensity(obj.id, v);
          }}
          ariaLabel="Intensity"
        />
      </label>

      <label className="pct-lock">
        <input
          type="checkbox"
          checked={flashing}
          onChange={(e) => store().setFlashing(obj.id, e.target.checked ? [1, 0, 3, 0] : [0, 0, 0, 0])}
        />
        <span>Flashing (slow, ~6 s cycle)</span>
      </label>

      <GroupIndexField id={obj.id} value={obj.groupIndex} />

      <SharedTail obj={obj} resolvedAsl={resolvedAsl} />
    </div>
  );
}

/** Dispatch the editor body by object kind. */
function ObjectFields({
  obj,
  xrefMeta,
  airportLightMeta,
  resolvedAsl,
}: {
  obj: PlacedObject;
  xrefMeta: CatalogObject | undefined;
  airportLightMeta: CatalogAirportLight | undefined;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  if (obj.kind === "xref") return <XrefFields obj={obj} meta={xrefMeta} resolvedAsl={resolvedAsl} />;
  if (obj.kind === "airport_light")
    return <AirportLightFields obj={obj} meta={airportLightMeta} resolvedAsl={resolvedAsl} />;
  return <LightFields obj={obj} resolvedAsl={resolvedAsl} />;
}

export function Inspector(): React.ReactElement {
  const selCount = useEditor((s) => s.selection.length);
  // Select the object REFERENCE directly — stable across unrelated store changes (no re-render on pan).
  const obj = useEditor((s) =>
    s.selection.length === 1 ? s.project.objects.find((o) => o.id === s.selection[0]) : undefined,
  );
  const xrefMeta = useEditor((s) =>
    obj?.kind === "xref" ? s.catalogIndex.get(obj.name) : undefined,
  );
  const airportLightMeta = useEditor((s) =>
    obj?.kind === "airport_light" ? s.airportLightIndex.get(obj.typeName) : undefined,
  );
  const resolvedAsl = useEditor((s) => (obj ? s.resolvedElev.get(obj.id) : undefined));

  return (
    <aside className="pct-inspector">
      <h2 className="pct-panel-title">Inspector</h2>
      {obj ? (
        // Key by id so every draft (numeric fields + the fetch spinner) resets on a selection change;
        // an EDIT to the same object keeps the id, so the panel is not torn down.
        <ObjectFields
          key={obj.id}
          obj={obj}
          xrefMeta={xrefMeta}
          airportLightMeta={airportLightMeta}
          resolvedAsl={resolvedAsl}
        />
      ) : (
        <p className="pct-empty">
          {selCount === 0 ? "Select an object on the map" : `${selCount} objects selected`}
        </p>
      )}
    </aside>
  );
}
