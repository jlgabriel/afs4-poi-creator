// HeightControl.tsx — the always-visible 3-mode height control (design §5, a product-owner acceptance
// condition). Radio: Terrain / Terrain + offset / ASL, a metres field, and ±0.5 / ±5 m nudge buttons.
// Nudging a terrain-mode object silently PROMOTES it to terrain-offset (the store's nudgeHeight does
// this) so "lift it half a metre" is one click, never a mode dialog. The resolved-ASL readout shows
// only when already known — the network elevation fetch itself is M2 (resolvedElev stays empty here).
import { editorStore } from "../state/editorStore";
import type { HeightSpec } from "../../core/project/types";
import { NumberInput } from "./NumberInput";

const MODES: readonly { mode: HeightSpec["mode"]; label: string }[] = [
  { mode: "terrain", label: "Terrain" },
  { mode: "terrain-offset", label: "Terrain + offset" },
  { mode: "asl", label: "ASL" },
];

interface HeightControlProps {
  id: string;
  height: HeightSpec;
  resolvedAsl: number | undefined;
}

export function HeightControl({ id, height, resolvedAsl }: HeightControlProps): React.ReactElement {
  const store = editorStore.getState;

  const selectMode = (mode: HeightSpec["mode"]): void => {
    if (mode === height.mode) return;
    if (mode === "terrain") store().setHeight(id, { mode: "terrain" });
    else if (mode === "terrain-offset")
      store().setHeight(id, {
        mode: "terrain-offset",
        offset: height.mode === "terrain-offset" ? height.offset : 0,
      });
    else
      store().setHeight(id, {
        mode: "asl",
        value: height.mode === "asl" ? height.value : (resolvedAsl ?? 0),
      });
  };

  // The metres field edits the offset (terrain-offset) or the absolute value (asl); terrain has none.
  const metres = height.mode === "terrain-offset" ? height.offset : height.mode === "asl" ? height.value : null;
  const setMetres = (n: number): void => {
    if (height.mode === "terrain-offset") store().setHeight(id, { mode: "terrain-offset", offset: n });
    else if (height.mode === "asl") store().setHeight(id, { mode: "asl", value: n });
  };

  return (
    <div className="pct-height">
      <div className="pct-field-label">Height</div>
      <div className="pct-radio-row">
        {MODES.map((m) => (
          <label key={m.mode} className="pct-radio">
            <input
              type="radio"
              name={`h-${id}`}
              checked={height.mode === m.mode}
              onChange={() => selectMode(m.mode)}
            />
            {m.label}
          </label>
        ))}
      </div>
      <div className="pct-nudge-row">
        <button type="button" onClick={() => store().nudgeHeight(id, -5)} title="−5 m">
          −5
        </button>
        <button type="button" onClick={() => store().nudgeHeight(id, -0.5)} title="−0.5 m">
          −0.5
        </button>
        {metres === null ? (
          <span className="pct-num pct-num-off">terrain</span>
        ) : (
          <NumberInput value={metres} format={(n) => n.toFixed(2)} onCommit={setMetres} ariaLabel="Height in metres" />
        )}
        <button type="button" onClick={() => store().nudgeHeight(id, 0.5)} title="+0.5 m">
          +0.5
        </button>
        <button type="button" onClick={() => store().nudgeHeight(id, 5)} title="+5 m">
          +5
        </button>
        <span className="pct-unit">m</span>
      </div>
      <div className="pct-height-resolved">
        {resolvedAsl !== undefined
          ? `≈ ${resolvedAsl.toFixed(1)} m ASL`
          : height.mode === "asl"
            ? "absolute metres ASL"
            : "resolved at export"}
      </div>
    </div>
  );
}
