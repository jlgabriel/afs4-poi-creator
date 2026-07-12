// HeightControl.tsx — the always-visible 3-mode height control (design §5, a product-owner acceptance
// condition). Radio: Terrain / Terrain + offset / ASL, a metres field, and ±0.5 / ±5 m nudge buttons.
// Nudging a terrain-mode object silently PROMOTES it to terrain-offset (the store's nudgeHeight does
// this) so "lift it half a metre" is one click, never a mode dialog. The resolved-ASL readout shows
// the terrain elevation under the object once fetched — the lazy network lookup (M2d) is the "Fetch
// elevation" button, which populates the store's ephemeral resolvedElev cache via app/commands.
import { useState } from "react";
import { editorStore } from "../state/editorStore";
import type { HeightSpec } from "../../core/project/types";
import { fetchElevation } from "../app/commands";
import { hasPct } from "../app/pct";
import { NumberInput } from "./NumberInput";

const NO_BRIDGE = "Not available in browser preview";

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

  // Local fetch state. ObjectFields is keyed by object id, so this component remounts on selection
  // change → fetching/fetchErr reset per object automatically (no stale spinner from a prior object).
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const bridge = hasPct();
  const onFetch = async (): Promise<void> => {
    setFetching(true);
    setFetchErr(null);
    const r = await fetchElevation(id);
    setFetching(false);
    if (!r.ok) setFetchErr(r.message);
  };

  // Just switched to ASL with no known ground height: look up the terrain elevation and bake it as the
  // ASL value — but only while the field is still the untouched 0 seed AND the object is still in ASL
  // mode (the user may have typed or switched modes during the async fetch). Turns "switch to ASL" from
  // a silent drop to sea level into a sensible ground-level start. (Adds a second undo step.)
  const seedAslFromTerrain = async (): Promise<void> => {
    setFetching(true);
    setFetchErr(null);
    const r = await fetchElevation(id);
    setFetching(false);
    if (!r.ok) {
      setFetchErr(r.message);
      return;
    }
    const cur = store().project.objects.find((o) => o.id === id);
    if (cur?.height.mode === "asl" && cur.height.value === 0) {
      store().setHeight(id, { mode: "asl", value: r.asl });
    }
  };

  const selectMode = (mode: HeightSpec["mode"]): void => {
    if (mode === height.mode) return;
    if (mode === "terrain") store().setHeight(id, { mode: "terrain" });
    else if (mode === "terrain-offset")
      store().setHeight(id, {
        mode: "terrain-offset",
        offset: height.mode === "terrain-offset" ? height.offset : 0,
      });
    else {
      // Switching to ASL. Seed from the ground height we already know; otherwise auto-fetch it (M2d) so
      // the object doesn't silently drop to 0 m = sea level. Falls back to 0 + the fetch error if the
      // lookup is unavailable (offline / browser preview) — the user still sees what happened.
      store().setHeight(id, { mode: "asl", value: resolvedAsl ?? 0 });
      if (resolvedAsl === undefined && bridge) void seedAslFromTerrain();
    }
  };

  // The metres field edits the offset (terrain-offset) or the absolute value (asl); terrain has none.
  const metres = height.mode === "terrain-offset" ? height.offset : height.mode === "asl" ? height.value : null;
  const setMetres = (n: number): void => {
    if (height.mode === "terrain-offset") store().setHeight(id, { mode: "terrain-offset", offset: n });
    else if (height.mode === "asl") store().setHeight(id, { mode: "asl", value: n });
  };

  return (
    <div className="pct-height">
      <div
        className="pct-field-label"
        title="Library objects have no auto-height, so PCT always writes an absolute elevation (m ASL). Terrain = look up and bake the ground height; Terrain + offset = ground + metres (rooftops); ASL = a value you type. Terrain does not mean 0."
      >
        Height
      </div>
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
        <span>
          {resolvedAsl !== undefined
            ? `terrain ≈ ${resolvedAsl.toFixed(1)} m ASL`
            : height.mode === "asl"
              ? "absolute metres ASL"
              : "resolved to absolute ASL at export"}
        </span>
        <button
          type="button"
          className="pct-linkbtn"
          onClick={() => void onFetch()}
          disabled={fetching || !bridge}
          title={bridge ? "Look up the terrain elevation under this object" : NO_BRIDGE}
        >
          {fetching ? "Fetching…" : resolvedAsl !== undefined ? "Refetch" : "Fetch elevation"}
        </button>
      </div>
      {fetchErr !== null && <div className="pct-fetch-err">{fetchErr}</div>}
    </div>
  );
}
