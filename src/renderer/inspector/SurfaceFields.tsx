// SurfaceFields.tsx — the Inspector's panels for a TARMAC polygon and a painted LINE, and the SURFACE
// block of a runway (material, brightness, side and centre lines). Everything here is for Export TAP only.
//
// The menus offer exactly the converter's vocabulary (surfaces.ts) and show the names VERBATIM: the name
// is what the converter matches, and a friendlier label would hide which of two near-identical names
// (`…__typestd` / `…__typeblue`) is picked. A project carrying a name the list does not have (hand-edited)
// keeps it: the menu shows it as an extra entry instead of silently switching to another.
//
// No coordinate fields: a shape is edited on the map. The help text says how — and it is a promise
// PolyShape keeps.
import type { AirportLine, AirportRunway, AirportTarmac, LonLat } from "../../core/project/types";
import {
  BRIGHTNESS_STEPS,
  DEFAULT_BRIGHTNESS,
  DEFAULT_RUNWAY_MATERIAL,
  LINE_NAMES,
  MIN_TARMAC_LEVEL,
  RUNWAY_MATERIALS,
  RUNWAY_MATERIAL_GROUPS,
  TARMAC_GROUPS,
  TARMAC_GROUP_LABELS,
  TARMAC_MATERIALS,
  fmtBrightness,
  isFlatten,
  materialHasBrightness,
  tarmacLevel,
} from "../../core/project/surfaces";
import { haversine } from "../../core/geo/geo";
import { ringAreaM2, ringSelfIntersects } from "../../core/geo/polygon";
import { editorStore } from "../state/editorStore";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";

const fmtLength = (m: number): string => (m < 10000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const fmtArea = (m2: number): string =>
  m2 < 100000 ? `${Math.round(m2).toLocaleString("en-US")} m²` : `${(m2 / 1e6).toFixed(2)} km²`;
const lineLength = (points: readonly LonLat[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + haversine(points[i]!, p), 0);

/** An extra entry for a name the list does not carry, so the select still shows what the project has. */
function UnlistedOption({ value, listed }: { value: string; listed: boolean }): React.ReactElement | null {
  return listed ? null : <option value={value}>{value} (not in the list)</option>;
}

function BrightnessSelect({
  material,
  value,
  onChange,
  ariaLabel,
}: {
  material: string;
  value: number;
  onChange: (b: number) => void;
  ariaLabel: string;
}): React.ReactElement {
  const takes = materialHasBrightness(material);
  return (
    <label className="pct-field pct-field-col">
      <span className="pct-field-label">Brightness</span>
      <select
        className="pct-num"
        value={takes ? fmtBrightness(value) : ""}
        disabled={!takes}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {takes ? (
          BRIGHTNESS_STEPS.map((b) => (
            <option key={b} value={fmtBrightness(b)}>
              {fmtBrightness(b)}
            </option>
          ))
        ) : (
          <option value="">— not used by this material —</option>
        )}
      </select>
    </label>
  );
}

/** A runway's surface: the Runway panel's own block. */
export function RunwaySurfaceFields({ runway }: { runway: AirportRunway }): React.ReactElement {
  const store = editorStore.getState;
  const material = runway.material ?? DEFAULT_RUNWAY_MATERIAL;
  const brightness = runway.brightness ?? DEFAULT_BRIGHTNESS;
  return (
    <>
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Material
          <Help>The runway's surface, for Export TAP. The other exports do not use it.</Help>
        </span>
        <select
          className="pct-num"
          value={material}
          aria-label="Runway material"
          onChange={(e) => store().setAirportRunwaySurface(runway.id, { material: e.target.value })}
        >
          {RUNWAY_MATERIAL_GROUPS.map((g) => (
            <optgroup key={g} label={TARMAC_GROUP_LABELS[g]}>
              {RUNWAY_MATERIALS.filter((m) => m.group === g).map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
          <UnlistedOption value={material} listed={RUNWAY_MATERIALS.some((m) => m.name === material)} />
        </select>
      </label>
      <BrightnessSelect
        material={material}
        value={brightness}
        ariaLabel="Runway brightness"
        onChange={(b) => store().setAirportRunwaySurface(runway.id, { brightness: b })}
      />
      <div className="pct-field pct-check-grid">
        <label className="pct-check">
          <input
            type="checkbox"
            checked={runway.sidelines ?? true}
            aria-label="Runway sidelines"
            onChange={(e) => store().setAirportRunwaySurface(runway.id, { sidelines: e.target.checked })}
          />
          SIDELINES
        </label>
        <label className="pct-check">
          <input
            type="checkbox"
            checked={runway.centerline ?? true}
            aria-label="Runway centerlines"
            onChange={(e) => store().setAirportRunwaySurface(runway.id, { centerline: e.target.checked })}
          />
          CENTERLINES
        </label>
      </div>
    </>
  );
}

export function TarmacFields({ tarmac, index }: { tarmac: AirportTarmac; index: number }): React.ReactElement {
  const store = editorStore.getState;
  const patch = (p: { level?: number; material?: string; brightness?: number }): void =>
    store().updateAirportTarmac(tarmac.id, p);
  const crosses = ringSelfIntersects(tarmac.points);
  const flatten = isFlatten(tarmac.material);
  const level = tarmacLevel(tarmac.material, tarmac.level);
  const listed = TARMAC_MATERIALS.some((m) => m.name === tarmac.material);
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Tarmac {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Tarmac
          {/* ★ THIS TEXT IS A TEST: every gesture it names is one PolyShape must answer. */}
          <Help>
            A paved, grass or flattened area, for Export TAP. Drag a white point to move it, drag a grey point
            to add one there, right-click a white point to remove it. Drag inside the area to move all of it.
          </Help>
        </span>
        <span className="pct-field-meta">
          {tarmac.points.length} points · {fmtArea(ringAreaM2(tarmac.points))}
        </span>
        {crosses && (
          <span className="pct-warn">The area crosses itself. Drag its points so that no two edges cross.</span>
        )}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Level
          <Help>
            Where two areas overlap, the higher level covers the lower one. Flatten is always level 0, below
            everything; every other material is level 1 or higher.
          </Help>
        </span>
        <div className="pct-nudge-row">
          <button
            type="button"
            onClick={() => patch({ level: level - 1 })}
            disabled={flatten || level <= MIN_TARMAC_LEVEL}
            title="One level down"
            aria-label="Level down"
          >
            −
          </button>
          <NumberInput
            value={level}
            onCommit={(n) => patch({ level: n })}
            ariaLabel="Tarmac level"
            disabled={flatten}
          />
          <button
            type="button"
            onClick={() => patch({ level: level + 1 })}
            disabled={flatten}
            title="One level up"
            aria-label="Level up"
          >
            +
          </button>
        </div>
        {flatten && <span className="pct-field-meta">Flatten is always level 0.</span>}
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Material</span>
        <select
          className="pct-num"
          value={tarmac.material}
          aria-label="Tarmac material"
          onChange={(e) => patch({ material: e.target.value })}
        >
          {TARMAC_GROUPS.map((g) => (
            <optgroup key={g} label={TARMAC_GROUP_LABELS[g]}>
              {TARMAC_MATERIALS.filter((m) => m.group === g).map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
          <UnlistedOption value={tarmac.material} listed={listed} />
        </select>
      </label>

      <BrightnessSelect
        material={tarmac.material}
        value={tarmac.brightness}
        ariaLabel="Tarmac brightness"
        onChange={(b) => patch({ brightness: b })}
      />
    </div>
  );
}

export function LineFields({ line, index }: { line: AirportLine; index: number }): React.ReactElement {
  const store = editorStore.getState;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Line {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Line
          {/* ★ THIS TEXT IS A TEST: every gesture it names is one PolyShape must answer. */}
          <Help>
            A painted line, for Export TAP. Drag a white point to move it, drag a grey point to add one there,
            right-click a white point to remove it. Drag the line itself to move all of it.
          </Help>
        </span>
        <span className="pct-field-meta">
          {line.points.length} points · {fmtLength(lineLength(line.points))} long
        </span>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Marking
          <Help>
            A name with <code>_dashed</code> is the dashed version of the same line; <code>_black</code> adds a
            black border, for light pavement.
          </Help>
        </span>
        <select
          className="pct-num"
          value={line.name}
          aria-label="Line marking"
          onChange={(e) => store().setAirportLineName(line.id, e.target.value)}
        >
          {LINE_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <UnlistedOption value={line.name} listed={LINE_NAMES.includes(line.name)} />
        </select>
      </label>
    </div>
  );
}
