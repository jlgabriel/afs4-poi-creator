// Inspector.tsx — the right panel: numeric editor for the single selected object (design §5). Reads
// selection[0] → the object reference (Object.is-stable across unrelated store changes, so panning the
// map never re-renders this) → its catalog metadata. Edits route through the store mutations so the
// map's O(changed) footprint diff stays intact. The body dispatches by `kind`: xref (footprint) |
// airport_light | light (the two point kinds) | plant (v0.4), sharing the position row + the
// height/label/lock tail.
import { useMemo, useState } from "react";
import type {
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedPlant,
  PlacedXref,
  Vec3,
} from "../../core/project/types";
import { plantKey } from "../../core/catalog/plants";
import { clampLonLat } from "../../core/project/schemas";
import { directionToHeading, headingToDirection } from "../../core/geo/orientation";
import { directionToWad, formatWad, latToWad, lonToWad } from "../../core/geo/wad";
import { rowAxis } from "../../core/geo/arrange";
import { editorStore, useEditor } from "../state/editorStore";
import { HeightControl } from "./HeightControl";
import { HeliportFields } from "./HeliportFields";
import { NumberInput } from "./NumberInput";
import { ParkingFields } from "./ParkingFields";
import { RunwayFields } from "./RunwayFields";

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

/** One read-only value + its Copy button. */
function WadRow({ label, value, title }: { label: string; value: string; title: string }): React.ReactElement {
  return (
    <div className="pct-wad-row">
      <span className="pct-field-label" title={title}>
        {label}
      </span>
      <code>{value}</code>
      <button
        type="button"
        className="pct-copy"
        title={`Copy ${label.toLowerCase()}`}
        onClick={() => void navigator.clipboard?.writeText(value)}
      >
        Copy
      </button>
    </div>
  );
}

/** Whether the FS4-internal block is open, kept OUTSIDE React because the Inspector is keyed by object
 *  id: selecting the next object remounts the whole panel. Without this, someone reading these values
 *  off a row of objects — the entire point of the feature — would re-open the block for every click. */
let wadOpen = false;

/** The same position/rotation in the units FS4 uses INSIDE its own world-airport database (`.wad`):
 *  a 0–65536 projected grid and radians (see core/geo/wad.ts). Read-only, collapsed by default —
 *  irrelevant to placing objects, and only wanted by the few people who hand-build heliport files and
 *  were converting with a private spreadsheet (forum #150). Every kind gets it; the rotation row is
 *  dropped for the two kinds that have none (a point light and a plant don't turn). */
function Fs4Internal({ obj }: { obj: PlacedObject }): React.ReactElement {
  const [open, setOpen] = useState(wadOpen);
  // The RAW `.toc` rotation, which is what a `.wad` wants in radians — not the compass heading the
  // xref panel shows. For an airport light the raw value is already what the Inspector edits.
  const rotation =
    obj.kind === "xref" ? obj.direction : obj.kind === "airport_light" ? obj.orientation : undefined;
  const lon = formatWad(lonToWad(obj.position.lon));
  const lat = formatWad(latToWad(obj.position.lat));
  return (
    <details
      className="pct-wad"
      open={open}
      onToggle={(e) => setOpen((wadOpen = e.currentTarget.open))}
    >
      <summary title="The projected values FS4 stores internally. PCT does not write .wad files — this is a read-out.">
        FS4 internal (.wad)
      </summary>
      <WadRow label="Longitude" value={lon} title="0 = 180° W · 32768 = Greenwich · 65536 = 180° E" />
      <WadRow label="Latitude" value={lat} title="0 = 90° S · 32768 = Equator · 65536 = 90° N (tangent projection)" />
      {rotation !== undefined && (
        <WadRow
          label="Direction"
          value={formatWad(directionToWad(rotation))}
          title="The raw .toc rotation in radians — the form a .wad stores it in"
        />
      )}
      <button
        type="button"
        className="pct-copy pct-wad-pair"
        title="Copy both as one line, the way a .wad position field carries them"
        onClick={() => void navigator.clipboard?.writeText(`${lon} ${lat}`)}
      >
        Copy position pair
      </button>
    </details>
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
      <Fs4Internal obj={obj} />
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
        {meta ? (
          `${meta.category} · ${meta.bundle}`
        ) : (
          <span className="pct-warn">not in your install — the sim will skip it</span>
        )}
      </div>

      <PositionRow obj={obj} />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span
            className="pct-field-label"
            title="Compass heading the object faces in-sim: 0 = North, 90 = East, clockwise, normalized to 0–360°. Calibrated in-sim (heading = 90 − the raw .toc direction). Drag the cyan handle on the map (hold Shift to snap to 5°) or type it here."
          >
            Heading °
          </span>
          <NumberInput
            id="pct-inspector-direction"
            value={directionToHeading(obj.direction)}
            format={(n) => n.toFixed(1)}
            onCommit={(h) => store().rotateObject(obj.id, headingToDirection(h))}
            ariaLabel="Heading in degrees"
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

      <div className="pct-field-meta">
        {meta ? (
          meta.category
        ) : (
          <span className="pct-warn">not in your install — the sim will skip it</span>
        )}
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Fixture</span>
        <select
          className="pct-select"
          value={obj.typeName}
          onChange={(e) => store().setAirportLightType(obj.id, e.target.value)}
        >
          {/* A <select> whose value matches no <option> renders BLANK — so a project shared from a forum
              user with a fixture we don't have used to show an empty, lying dropdown. Carry the dangling
              name as a disabled option so the field states what it actually holds. */}
          {!meta && (
            <option value={obj.typeName} disabled>
              {obj.typeName} (missing)
            </option>
          )}
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
          title="Raw rotation the light shines toward (model axis, not a compass heading). Drag the cyan handle on the map (hold Shift to snap to 5°) or type it here. Matters when the colour has an opposite."
        >
          Orientation °
        </span>
        <NumberInput
          // Same id as the xref's Direction field: the `R` shortcut focuses "the rotation field", and the
          // kind dispatch renders exactly one of the two, so they can never collide.
          id="pct-inspector-direction"
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

/** Flash pattern [A B C D] editor (types.ts: A cycle · B sequence · C flash-length · D unused). The
 *  checkbox toggles steady↔flashing; when on, A/B/C are editable. Staggering B (sequence) across a row
 *  of point lights is how you build a "running light" sweep (forum #94) — the reason a raw [A B C D]
 *  editor beats a single on/off toggle. D stays as-is (unused, 0). */
function FlashingField({
  id,
  value,
}: {
  id: string;
  value: [number, number, number, number];
}): React.ReactElement {
  const store = editorStore.getState;
  const on = value.some((n) => n > 0);
  const setPart = (i: 0 | 1 | 2, n: number): void => {
    const next: [number, number, number, number] = [value[0], value[1], value[2], value[3]];
    next[i] = Math.max(0, n);
    store().setFlashing(id, next);
  };
  const parts: Array<[0 | 1 | 2, string, string]> = [
    [0, "Cycle", "A — cycle time (bigger = slower blink)"],
    [1, "Sequence", "B — sequence / phase. Stagger 1, 2, 3… across lights for a running-light sweep."],
    [2, "Length", "C — flash length"],
  ];
  return (
    <div className="pct-field pct-field-col">
      <label className="pct-lock">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => store().setFlashing(id, e.target.checked ? [1, 0, 3, 0] : [0, 0, 0, 0])}
        />
        <span title="Blink pattern [A B C D]. Steady = all zero. Toggle on to edit cycle, sequence and flash length.">
          Flashing
        </span>
      </label>
      {on && (
        <div className="pct-field pct-field-row">
          {parts.map(([i, label, tip]) => (
            <label key={label} className="pct-field-col">
              <span className="pct-field-label" title={tip}>
                {label}
              </span>
              <NumberInput
                value={value[i]}
                format={(n) => String(Math.round(n))}
                onCommit={(v) => setPart(i, v)}
                ariaLabel={`Flash ${label}`}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LightFields({
  obj,
  resolvedAsl,
}: {
  obj: PlacedLight;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Point light</div>

      <PositionRow obj={obj} />

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

      <FlashingField id={obj.id} value={obj.flashing} />

      <GroupIndexField id={obj.id} value={obj.groupIndex} />

      <SharedTail obj={obj} resolvedAsl={resolvedAsl} />
    </div>
  );
}

function PlantFields({
  obj,
  meta,
  resolvedAsl,
}: {
  obj: PlacedPlant;
  meta: CatalogPlant | undefined;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  // v0.4 always keeps MIN = MAX (see mutate.setPlantHeightRange), so one number drives the pair.
  const height = obj.heightRange[0];
  const natural = meta?.naturalHeight;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">{meta?.displayName ?? plantKey(obj)}</div>

      <PositionRow obj={obj} />

      {/* ⚠️ "Plant height" ≠ the "Height" control in SharedTail below. That one is WHERE THE BASE
          SITS (terrain / ASL, shared by every kind); this one is HOW TALL THE PLANT GROWS — a plant
          is the only kind that has both, because it's the only element whose size is a field rather
          than a property of a fixed mesh. Naming them both "Height" would be the whole bug. */}
      <label className="pct-field pct-field-col">
        <span
          className="pct-field-label"
          title={
            natural !== undefined
              ? `How tall this plant grows. Its texture is naturally ${natural} m.`
              : "How tall this plant grows."
          }
        >
          Plant height (m)
        </span>
        <NumberInput
          value={height}
          format={(n) => n.toFixed(2)}
          onCommit={(v) => {
            // A plant 0 m tall is, at best, invisible — and it's the value the format bible's template
            // shows, so it's exactly the one a curious user would try. Refuse it rather than let the
            // editor write an object that silently renders as nothing.
            if (v > 0) store().setPlantHeightRange(obj.id, [v, v]);
          }}
          ariaLabel="Plant height in metres"
        />
      </label>

      <SharedTail obj={obj} resolvedAsl={resolvedAsl} />
    </div>
  );
}

// ── multi-selection: arrange (v0.9.2) ─────────────────────────────────────────
/** The RAW `.toc` rotation an object carries, if it has one at all (a point light and a plant don't). */
function rawRotation(o: PlacedObject): number | undefined {
  return o.kind === "xref" ? o.direction : o.kind === "airport_light" ? o.orientation : undefined;
}

/** A rotation field for the WHOLE selection. Shows the shared value, or nothing with a "mixed"
 *  placeholder when they disagree — a number that claims to be "the" heading of seven objects pointing
 *  seven ways would be the whole bug. Typing one writes it to all of them, as one undo entry. */
function BulkRotationField({
  label,
  title,
  common,
  onCommit,
}: {
  label: string;
  title: string;
  common: number | undefined;
  onCommit: (deg: number) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft !== null) {
      const n = Number.parseFloat(draft);
      if (Number.isFinite(n)) onCommit(n);
    }
    setDraft(null);
  };
  return (
    <label className="pct-field-col">
      <span className="pct-field-label" title={title}>
        {label}
      </span>
      <input
        className="pct-num"
        type="text"
        inputMode="decimal"
        value={draft ?? (common === undefined ? "" : common.toFixed(1))}
        placeholder={common === undefined ? "mixed" : undefined}
        aria-label={`${label} for the whole selection`}
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

/** What the Inspector shows for 2+ selected objects: put them in a tidy row.
 *
 *  The 2D-editor "align left / align top" does not survive the trip to a map — left is WEST, and the
 *  row you actually want is almost never axis-aligned (the parked B747s that prompted this run at
 *  135°). So the two position tools work in the row's own frame: LINE UP zeroes each object's offset
 *  across the line through the two farthest apart, SPACE EVENLY equalises the gaps along it. They are
 *  orthogonal, so running both gives a clean row and running one leaves the other property alone. */
function ArrangePanel(): React.ReactElement {
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const store = editorStore.getState;

  // Both inputs are stable store references, so the derived work happens here rather than in a
  // selector — a selector that built a new array every call would re-render this panel on every pan.
  const picked = useMemo(() => {
    const wanted = new Set(selection);
    return objects.filter((o) => wanted.has(o.id));
  }, [objects, selection]);
  const axis = useMemo(() => rowAxis(picked.map((o) => o.position)), [picked]);

  const canArrange = picked.length >= 3 && axis !== null;
  const lockedCount = picked.filter((o) => o.locked).length;

  // A bulk rotation must mean ONE thing. An xref's field is a calibrated compass heading; an airport
  // light's is the raw model rotation it shines along — same slot in the file, different quantity. So
  // the control appears only for a selection of a single kind, and speaks that kind's language.
  const kind = new Set(picked.map((o) => o.kind)).size === 1 ? picked[0].kind : undefined;
  const isXref = kind === "xref";
  const shown = isXref || kind === "airport_light" ? picked.map((o) => rawRotation(o) ?? 0) : null;
  const displayed = shown?.map((raw) => (isXref ? directionToHeading(raw) : raw));
  const common =
    displayed && displayed.every((v) => Math.abs(v - displayed[0]) < 0.05) ? displayed[0] : undefined;

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">{picked.length} objects selected</div>

      {/* `pct-field` only — NOT `pct-field-col`, which carries `flex: 1 1 0` for the side-by-side
          Lon/Lat columns. As a direct child of the column-flex body it would grow into all the free
          vertical space and shove the heading row to the bottom of the panel. It goes unnoticed in the
          single-object panel because that one has enough fields to fill the height; this one doesn't. */}
      <div className="pct-field">
        <span className="pct-field-label">Arrange</span>
        <div className="pct-arrange-row">
          <button
            type="button"
            disabled={!canArrange}
            title="Move every selected object onto the straight line through the two farthest apart. The two ends stay where they are."
            onClick={() => store().lineUpSelection()}
          >
            Line up
          </button>
          <button
            type="button"
            disabled={!canArrange}
            title="Give every gap along that line the same length, keeping each object's offset across it."
            onClick={() => store().spaceSelectionEvenly()}
          >
            Space evenly
          </button>
        </div>
        <span className="pct-field-meta">
          {canArrange
            ? `Row: ${axis.lengthM.toFixed(1)} m at ${axis.bearing.toFixed(1)}°`
            : picked.length < 3
              ? "Select 3 or more to line them up."
              : "They're all in the same spot — no row to line up."}
        </span>
        {lockedCount > 0 && (
          <span className="pct-field-meta">
            {lockedCount} locked — {lockedCount === 1 ? "it helps" : "they help"} define the row but
            won&apos;t move.
          </span>
        )}
      </div>

      {displayed && (
        <div className="pct-field pct-field-row">
          <BulkRotationField
            label={isXref ? "Heading °" : "Orientation °"}
            title={
              isXref
                ? "Give every selected object the same compass heading. Blank means they currently differ."
                : "Give every selected light the same raw rotation. Blank means they currently differ."
            }
            common={common}
            onCommit={(deg) => store().setSelectionRotation(isXref ? headingToDirection(deg) : deg)}
          />
          {/* Only for xrefs: this button asserts that a compass bearing IS the object's facing, which
              is the mapping calibrated in-sim for xrefs and never measured for a light fixture. */}
          {isXref && axis && (
            <label className="pct-field-col">
              <span className="pct-field-label">&nbsp;</span>
              <button
                type="button"
                className="pct-arrange-btn"
                title={`Face every object along the row (${axis.bearing.toFixed(1)}°). Add 180 to face the other way.`}
                onClick={() => store().setSelectionRotation(headingToDirection(axis.bearing))}
              >
                Match row
              </button>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Dispatch the editor body by object kind. */
function ObjectFields({
  obj,
  xrefMeta,
  airportLightMeta,
  plantMeta,
  resolvedAsl,
}: {
  obj: PlacedObject;
  xrefMeta: CatalogObject | undefined;
  airportLightMeta: CatalogAirportLight | undefined;
  plantMeta: CatalogPlant | undefined;
  resolvedAsl: number | undefined;
}): React.ReactElement {
  if (obj.kind === "xref") return <XrefFields obj={obj} meta={xrefMeta} resolvedAsl={resolvedAsl} />;
  if (obj.kind === "airport_light")
    return <AirportLightFields obj={obj} meta={airportLightMeta} resolvedAsl={resolvedAsl} />;
  if (obj.kind === "plant") return <PlantFields obj={obj} meta={plantMeta} resolvedAsl={resolvedAsl} />;
  return <LightFields obj={obj} resolvedAsl={resolvedAsl} />;
}

export function Inspector(): React.ReactElement {
  const selCount = useEditor((s) => s.selection.length);
  // The helipad is not in `objects`, so it is not in `selection` either — it has its own field. Guarded
  // on the block still existing: undoing the placement leaves the selection set for one render otherwise,
  // and the panel would be editing an airport that is no longer there.
  const airport = useEditor((s) =>
    s.airportSelection?.kind === "pad" ? s.project.airport : undefined,
  );
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
  // Same guard as the pad's, for the same reason: the stand may already be gone (undo, or a delete from
  // the list) while the selection still names it for one render.
  const parking = useEditor((s) =>
    s.airportSelection?.kind === "parking"
      ? s.project.airport?.parkings?.find((p) => p.id === s.airportSelection?.id)
      : undefined,
  );
  const runway = useEditor((s) =>
    s.airportSelection?.kind === "runway"
      ? s.project.airport?.runways?.find((r) => r.id === s.airportSelection?.id)
      : undefined,
  );
  const plantMeta = useEditor((s) => (obj?.kind === "plant" ? s.plantIndex.get(plantKey(obj)) : undefined));
  const resolvedAsl = useEditor((s) => (obj ? s.resolvedElev.get(obj.id) : undefined));

  return (
    <aside className="pct-inspector">
      <h2 className="pct-panel-title">Inspector</h2>
      {airport !== undefined ? (
        <HeliportFields airport={airport} />
      ) : parking !== undefined ? (
        // Keyed by id for the same reason ObjectFields is: every numeric draft resets when the selection
        // moves to another stand, but editing THIS one keeps the panel alive.
        <ParkingFields key={parking.id} parking={parking} />
      ) : runway !== undefined ? (
        <RunwayFields key={runway.id} runway={runway} />
      ) : obj ? (
        // Key by id so every draft (numeric fields + the fetch spinner) resets on a selection change;
        // an EDIT to the same object keeps the id, so the panel is not torn down.
        <ObjectFields
          key={obj.id}
          obj={obj}
          xrefMeta={xrefMeta}
          airportLightMeta={airportLightMeta}
          plantMeta={plantMeta}
          resolvedAsl={resolvedAsl}
        />
      ) : selCount === 0 ? (
        <p className="pct-empty">Select an object on the map</p>
      ) : (
        <ArrangePanel />
      )}
    </aside>
  );
}
