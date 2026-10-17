// MarkFields.tsx — the Inspector's panels for the four one-point TAP elements: GROUND TEXT, TAXI SIGN,
// JETWAY and CAR LOT. Everything here is for Export TAP only.
//
// Each panel starts with the position and the heading, like a stand's, and then the element's own fields.
// The menus offer exactly the converter's vocabulary (marks.ts) and show it verbatim.
//
// ★ THE HELP TEXTS ARE TESTS: each one names gestures MarkLayer must answer (drag the shape, turn the cyan
// grip).
//
// The taxi sign's COMPONENTS are an ordered list edited in place: a row per component (type, value, move
// up, move down, remove), the add buttons under it, and the arrow and hold buttons under the destination
// row being edited. Every edit replaces the whole list in one store call.
import { useState } from "react";
import type {
  AirportCarlot,
  AirportGroundText,
  AirportJetway,
  AirportTaxisign,
  AirportTaxisignElement,
  LonLat,
} from "../../core/project/types";
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
  TAXISIGN_BRIGHTNESS_STEPS,
  TAXISIGN_ELEMENT_TYPES,
  TAXISIGN_SIZE_TYPES,
  TAXISIGN_TOKENS,
  type TaxisignElementType,
  taxisignValueProblem,
} from "../../core/project/marks";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore } from "../state/editorStore";
import type { MarkKind } from "../state/store";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";

const fmtDeg = (n: number): string => n.toFixed(6);
const range = ([lo, hi]: readonly [number, number], unit: string): string =>
  lo < 0 ? `−${-lo} to +${hi}${unit}` : `${lo}–${hi}${unit}`;

/** Lon, lat and the heading: what every one of the three has. */
function PlaceFields({
  kind,
  id,
  position,
  heading,
  label,
  headingLabel = "Heading",
}: {
  kind: MarkKind;
  id: string;
  position: LonLat;
  heading: number;
  label: string;
  headingLabel?: string;
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
        <span className="pct-field-label">{headingLabel} — true</span>
        <NumberInput
          value={heading}
          onCommit={(h) => store().rotateAirportMark(kind, id, h)}
          ariaLabel={`${label} ${headingLabel.toLowerCase()}, true degrees`}
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

/** What each component type looks like and takes, for its menu entry and its placeholder. */
const TAXISIGN_TYPE_HINTS: Record<TaxisignElementType, { look: string; takes: string }> = {
  runway: { look: "white on red", takes: "0–9, A–Z, space, -" },
  destination: { look: "black on yellow", takes: "A–Z, 0–9, space, -, arrows" },
  location: { look: "yellow on black", takes: "A–Z" },
  remainingrunway: { look: "white on black", takes: "0–9" },
  linebreak: { look: "turns to the back face", takes: "" },
};

/** A token's button face: an arrow turned like the sign turns it, or the hold mark's name. */
function TokenFace({ token }: { token: string }): React.ReactElement {
  const m = /^<(LEFT|RIGHT)(\d+)>$/.exec(token);
  if (m === null) return <>{token.slice(1, -1)}</>;
  const deg = (m[1] === "RIGHT" ? 1 : -1) * Number(m[2]);
  return <span style={{ display: "inline-block", transform: `rotate(${deg}deg)` }}>↑</span>;
}

export function TaxisignFields({ sign, index }: { sign: AirportTaxisign; index: number }): React.ReactElement {
  const store = editorStore.getState;
  const patch = (p: Parameters<ReturnType<typeof store>["updateAirportTaxisign"]>[1], typing?: number): void =>
    store().updateAirportTaxisign(sign.id, p, typing);
  const elements = sign.elements;
  const setElements = (next: AirportTaxisignElement[], typing?: number): void => patch({ elements: next }, typing);
  const edit = (i: number, e: Partial<AirportTaxisignElement>, typing?: number): void =>
    setElements(
      elements.map((x, k) => (k === i ? { ...x, ...e } : x)),
      typing,
    );
  const swap = (i: number, j: number): void => {
    const next = [...elements];
    [next[i], next[j]] = [next[j], next[i]];
    setElements(next);
  };
  // The destination row the arrow buttons write into: the one last focused, else the first.
  const [active, setActive] = useState<number | null>(null);
  const tokenRow =
    active !== null && elements[active]?.type === "destination"
      ? active
      : elements.findIndex((e) => e.type === "destination");
  const back = elements.findIndex((e) => e.type === "linebreak");

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Taxi Sign {index + 1}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Taxi Sign
          <Help>
            A taxiway sign, for Export TAP. Drag the shape to move it, and the cyan grip to turn it: the front face
            looks toward the grip.
          </Help>
        </span>
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Components
          <Help>
            Shown left to right on the front face. After a linebreak the rest goes on the back face, again left to
            right. Arrows and hold marks go inside a destination: click in its text, then on an arrow. An arrow
            can take any angle from 0 to 180: change the number in its text, for example <code>&lt;RIGHT30&gt;</code>.
          </Help>
        </span>
        {elements.length === 0 && <span className="pct-warn">No components: the sign is blank.</span>}
        {elements.map((e, i) => {
          const problem = taxisignValueProblem(e.type, e.value);
          return (
            <div key={i} className="pct-sign-item">
              {back >= 0 && i === back + 1 && <span className="pct-field-meta">Back face</span>}
              <div className="pct-sign-row">
                <select
                  className="pct-num"
                  value={e.type}
                  aria-label={`Component ${i + 1} type`}
                  title={TAXISIGN_TYPE_HINTS[e.type].look}
                  onChange={(ev) => edit(i, { type: ev.target.value as TaxisignElementType })}
                >
                  {TAXISIGN_ELEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {e.type === "linebreak" ? (
                  <span className="pct-num pct-num-off">→ back</span>
                ) : (
                  <input
                    className="pct-text"
                    value={e.value}
                    placeholder={TAXISIGN_TYPE_HINTS[e.type].takes}
                    aria-label={`Component ${i + 1} value`}
                    onFocus={() => setActive(i)}
                    onChange={(ev) => edit(i, { value: ev.target.value }, i)}
                  />
                )}
                <button
                  type="button"
                  title="Move up (left on the sign)"
                  aria-label={`Move component ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => swap(i, i - 1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  title="Move down (right on the sign)"
                  aria-label={`Move component ${i + 1} down`}
                  disabled={i === elements.length - 1}
                  onClick={() => swap(i, i + 1)}
                >
                  ▼
                </button>
                <button
                  type="button"
                  title="Remove"
                  aria-label={`Remove component ${i + 1}`}
                  onClick={() => setElements(elements.filter((_, k) => k !== i))}
                >
                  ✕
                </button>
              </div>
              {problem !== null && <span className="pct-warn">{problem}</span>}
              {i === tokenRow && (
                <div className="pct-nudge-row pct-sign-tokens">
                  {TAXISIGN_TOKENS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      title={`Add ${t}`}
                      aria-label={`Add ${t}`}
                      onClick={() => edit(i, { value: e.value + t })}
                    >
                      <TokenFace token={t} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div className="pct-nudge-row pct-sign-add">
          {TAXISIGN_ELEMENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              title={`Add a ${t} component: ${TAXISIGN_TYPE_HINTS[t].look}`}
              onClick={() => setElements([...elements, { type: t, value: "" }])}
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      <PlaceFields
        kind="taxisign"
        id={sign.id}
        position={sign.position}
        heading={sign.heading}
        label="Taxi sign"
        headingLabel="Facing"
      />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Size type</span>
          <select
            className="pct-num"
            value={sign.sizeType}
            aria-label="Taxi sign size type"
            onChange={(ev) => patch({ sizeType: Number(ev.target.value) })}
          >
            {TAXISIGN_SIZE_TYPES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Brightness</span>
          <select
            className="pct-num"
            value={sign.brightness.toFixed(1)}
            aria-label="Taxi sign brightness"
            onChange={(ev) => patch({ brightness: Number(ev.target.value) })}
          >
            {TAXISIGN_BRIGHTNESS_STEPS.map((b) => (
              <option key={b} value={b.toFixed(1)}>
                {b.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name</span>
        <input
          className="pct-text"
          value={sign.name}
          placeholder="TAXISIGN"
          aria-label="Taxi sign name"
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
