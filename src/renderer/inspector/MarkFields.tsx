// MarkFields.tsx — the Inspector's panels for the three one-point TAP elements: GROUND TEXT, JETWAY and
// CAR LOT. Everything here is for Export TAP only.
//
// Each panel starts with the position and the heading, like a stand's, and then the element's own fields.
// The menus offer exactly the converter's vocabulary (marks.ts) and show it verbatim.
//
// ★ THE HELP TEXTS ARE TESTS: each one names gestures MarkLayer must answer (drag the shape, turn the cyan
// grip).
import type { AirportCarlot, AirportGroundText, AirportJetway, LonLat } from "../../core/project/types";
import {
  CARLOT_COUNT_RANGE,
  GROUNDTEXT_BACKGROUNDS,
  GROUNDTEXT_COLORS,
  GROUNDTEXT_POINTING,
  GROUNDTEXT_STANDARD_SIZES,
  JETWAY_EXIT_DIRECTION_RANGE,
  JETWAY_EXTENSION_AMOUNT_RANGE,
  JETWAY_EXTENSION_DIRECTION_RANGE,
  JETWAY_MOUNTING_RANGE,
} from "../../core/project/marks";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore } from "../state/editorStore";
import type { MarkKind } from "../state/store";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";

const fmtDeg = (n: number): string => n.toFixed(6);
const range = ([lo, hi]: readonly [number, number], unit: string): string => `${lo}–${hi}${unit}`;

/** Lon, lat and the heading: what every one of the three has. */
function PlaceFields({
  kind,
  id,
  position,
  heading,
  label,
}: {
  kind: MarkKind;
  id: string;
  position: LonLat;
  heading: number;
  label: string;
}): React.ReactElement {
  const store = editorStore.getState;
  return (
    <>
      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={position.lon}
            format={fmtDeg}
            onCommit={(lon) => store().moveAirportMark(kind, id, clampLonLat({ lon, lat: position.lat }))}
            ariaLabel={`${label} longitude`}
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={position.lat}
            format={fmtDeg}
            onCommit={(lat) => store().moveAirportMark(kind, id, clampLonLat({ lon: position.lon, lat }))}
            ariaLabel={`${label} latitude`}
          />
        </label>
      </div>
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Heading — true</span>
        <NumberInput
          value={heading}
          onCommit={(h) => store().rotateAirportMark(kind, id, h)}
          ariaLabel={`${label} heading, true degrees`}
        />
      </label>
    </>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <label className="pct-field pct-field-col">
      <span className="pct-field-label">{label}</span>
      <select
        className="pct-num"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GroundTextFields({ text, index }: { text: AirportGroundText; index: number }): React.ReactElement {
  const store = editorStore.getState;
  const patch = (p: Parameters<ReturnType<typeof store>["updateAirportGroundText"]>[1]): void =>
    store().updateAirportGroundText(text.id, p);
  const [w, h] = text.size;
  const standard = GROUNDTEXT_STANDARD_SIZES.findIndex(([sw, sh]) => sw === w && sh === h);
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Ground Text {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Ground Text
          <Help>
            Letters painted on the pavement, for Export TAP. Drag the shape to move it, and the cyan grip to turn
            it: the tops of the letters point along the heading.
          </Help>
        </span>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Text
          <Help>Capital letters, digits, spaces, + and -. Anything else is left out.</Help>
        </span>
        <input
          className="pct-text"
          value={text.value}
          placeholder="e.g. A1"
          aria-label="Ground text"
          onChange={(e) => patch({ value: e.target.value })}
        />
        {text.value.trim() === "" && <span className="pct-warn">No text: nothing is painted.</span>}
      </label>

      <PlaceFields kind="groundtext" id={text.id} position={text.position} heading={text.heading} label="Ground text" />

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Letter size — m
          <Help>Width and height of ONE letter. The standard sizes are 1 × 3 and 3 × 4.25.</Help>
        </span>
        <div className="pct-field-row">
          <label className="pct-field-col">
            <span className="pct-field-label">Width</span>
            <NumberInput value={w} onCommit={(n) => patch({ size: [n, h] })} ariaLabel="Letter width, metres" />
          </label>
          <label className="pct-field-col">
            <span className="pct-field-label">Height</span>
            <NumberInput value={h} onCommit={(n) => patch({ size: [w, n] })} ariaLabel="Letter height, metres" />
          </label>
        </div>
        <div className="pct-nudge-row">
          {GROUNDTEXT_STANDARD_SIZES.map(([sw, sh], i) => (
            <button
              key={i}
              type="button"
              aria-pressed={standard === i}
              className={standard === i ? "armed" : undefined}
              onClick={() => patch({ size: [sw, sh] })}
            >
              {sw} × {sh}
            </button>
          ))}
        </div>
      </div>

      <Choice
        label="Text colour"
        value={text.textColor}
        options={GROUNDTEXT_COLORS}
        onChange={(v) => patch({ textColor: v })}
      />
      <Choice
        label="Background"
        value={text.background}
        options={GROUNDTEXT_BACKGROUNDS}
        onChange={(v) => patch({ background: v })}
      />
      <Choice
        label="Background colour"
        value={text.backgroundColor}
        options={GROUNDTEXT_COLORS}
        onChange={(v) => patch({ backgroundColor: v })}
      />
      <Choice
        label="Outline colour"
        value={text.strokeColor}
        options={GROUNDTEXT_COLORS}
        onChange={(v) => patch({ strokeColor: v })}
      />
      <Choice
        label="Arrow"
        value={text.pointing}
        options={GROUNDTEXT_POINTING}
        onChange={(v) => patch({ pointing: v })}
      />

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name</span>
        <input
          className="pct-text"
          value={text.name}
          placeholder="GROUNDTEXT"
          aria-label="Ground text name"
          onChange={(e) => patch({ name: e.target.value })}
        />
      </label>
    </div>
  );
}

export function JetwayFields({ jetway, index }: { jetway: AirportJetway; index: number }): React.ReactElement {
  const store = editorStore.getState;
  const patch = (p: Parameters<ReturnType<typeof store>["updateAirportJetway"]>[1]): void =>
    store().updateAirportJetway(jetway.id, p);
  const num = (
    label: string,
    value: number,
    onCommit: (n: number) => void,
    hint: string,
  ): React.ReactElement => (
    <label className="pct-field pct-field-col">
      <span className="pct-field-label">
        {label}
        <span className="pct-field-meta"> {hint}</span>
      </span>
      <NumberInput value={value} onCommit={onCommit} ariaLabel={label} />
    </label>
  );
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Jetway {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Jetway
          <Help>
            A boarding bridge, for Export TAP. Put the point where it is mounted on the terminal. Drag the shape to
            move it, and the cyan grip to turn it.
          </Help>
        </span>
      </div>

      <PlaceFields kind="jetway" id={jetway.id} position={jetway.position} heading={jetway.heading} label="Jetway" />

      {num(
        "Mounting elevation — m",
        jetway.mountingElevation,
        (n) => patch({ mountingElevation: n }),
        range(JETWAY_MOUNTING_RANGE, " m"),
      )}
      {num(
        "Extension direction — °",
        jetway.extensionDirection,
        (n) => patch({ extensionDirection: n }),
        `${range(JETWAY_EXTENSION_DIRECTION_RANGE, "°")}, counter-clockwise`,
      )}
      {num("Extension pitch — °", jetway.extensionPitch, (n) => patch({ extensionPitch: n }), "")}
      {num(
        "Extension amount — m",
        jetway.extensionAmount,
        (n) => patch({ extensionAmount: n }),
        range(JETWAY_EXTENSION_AMOUNT_RANGE, " m"),
      )}
      {num(
        "Exit direction — °",
        jetway.exitDirection,
        (n) => patch({ exitDirection: n }),
        range(JETWAY_EXIT_DIRECTION_RANGE, "°"),
      )}

      <label className="pct-field pct-check">
        <input type="checkbox" checked={jetway.docked} onChange={(e) => patch({ docked: e.target.checked })} />
        Docked
      </label>
    </div>
  );
}

export function CarlotFields({ carlot, index }: { carlot: AirportCarlot; index: number }): React.ReactElement {
  const store = editorStore.getState;
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Car Lot {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Car Lot
          <Help>
            Rows of parking spaces, filled with cars at random, for Export TAP. Drag the shape to move it, and the
            cyan grip to turn it.
          </Help>
        </span>
      </div>

      <PlaceFields kind="carlot" id={carlot.id} position={carlot.position} heading={carlot.heading} label="Car lot" />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Rows</span>
          <NumberInput
            value={carlot.rows}
            onCommit={(n) => store().updateAirportCarlot(carlot.id, { rows: n })}
            ariaLabel="Car lot rows"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Spaces per row</span>
          <NumberInput
            value={carlot.columns}
            onCommit={(n) => store().updateAirportCarlot(carlot.id, { columns: n })}
            ariaLabel="Car lot spaces per row"
          />
        </label>
      </div>
      <span className="pct-field-meta">{range(CARLOT_COUNT_RANGE, "")} each</span>
    </div>
  );
}
