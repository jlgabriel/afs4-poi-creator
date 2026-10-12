// AirportElevationField.tsx — the airport's elevation, in the Data panel. Two modes: Terrain (no value
// stored; Export TAP looks up the ground under the airport point) and ASL (a number the user types or
// fetches). It looks like the objects' Height control on purpose, minus "Terrain + offset", which has no
// meaning for an airport's reference height.
//
// Only Export TAP uses it: the converter places XREFs at this height.
import { useState } from "react";
import type { LonLat } from "../../core/project/types";
import { editorStore } from "../state/editorStore";
import { fetchTerrainAt } from "../app/commands";
import { hasPct } from "../app/pct";
import { NumberInput } from "./NumberInput";

const NO_BRIDGE = "Not available in browser preview";

/** The last lookup, tied to the point it was made for: once the airport moves it no longer applies. */
interface Terrain {
  at: LonLat;
  asl: number;
}

export function AirportElevationField({
  elevation,
  position,
}: {
  elevation: number | undefined;
  position: LonLat | undefined;
}): React.ReactElement {
  const store = editorStore.getState;
  const bridge = hasPct();
  const [terrain, setTerrain] = useState<Terrain | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const known =
    terrain !== null && position !== undefined && terrain.at.lon === position.lon && terrain.at.lat === position.lat
      ? terrain.asl
      : undefined;

  const lookUp = async (): Promise<number | undefined> => {
    if (position === undefined) return undefined;
    setFetching(true);
    setFetchErr(null);
    const r = await fetchTerrainAt(position);
    setFetching(false);
    if (!r.ok) {
      setFetchErr(r.message);
      return undefined;
    }
    setTerrain({ at: position, asl: r.asl });
    return r.asl;
  };

  // Switching to ASL starts from the ground height (fetched if it is not known yet) rather than 0 m —
  // the same seeding the objects' Height control does.
  const toAsl = async (): Promise<void> => {
    store().setAirportElevation(Math.round((known ?? 0) * 10) / 10);
    if (known !== undefined || !bridge) return;
    const asl = await lookUp();
    if (asl !== undefined && store().project.airport?.elevation === 0) {
      store().setAirportElevation(Math.round(asl * 10) / 10);
    }
  };

  // Reads the store, not the prop: two quick clicks must add up even before the panel re-renders.
  const nudge = (d: number): void => {
    const cur = store().project.airport?.elevation;
    if (cur !== undefined) store().setAirportElevation(Math.round((cur + d) * 100) / 100);
  };

  return (
    <div className="pct-height">
      <div
        className="pct-field-label"
        title="The airport's height above sea level. Export TAP writes it as the airport's elevation, and the TAP converter places XREFs at this height."
      >
        Elevation
      </div>
      <div className="pct-radio-row">
        <label className="pct-radio">
          <input
            type="radio"
            name="airport-elevation"
            checked={elevation === undefined}
            onChange={() => store().setAirportElevation(null)}
          />
          Terrain
        </label>
        <label className="pct-radio">
          <input
            type="radio"
            name="airport-elevation"
            checked={elevation !== undefined}
            onChange={() => void toAsl()}
          />
          ASL
        </label>
      </div>
      <div className="pct-nudge-row">
        <button type="button" onClick={() => nudge(-5)} disabled={elevation === undefined} title="−5 m">
          −5
        </button>
        <button type="button" onClick={() => nudge(-0.5)} disabled={elevation === undefined} title="−0.5 m">
          −0.5
        </button>
        {elevation === undefined ? (
          <span className="pct-num pct-num-off">terrain</span>
        ) : (
          <NumberInput
            value={elevation}
            format={(n) => n.toFixed(2)}
            onCommit={(n) => store().setAirportElevation(n)}
            ariaLabel="Airport elevation in metres"
          />
        )}
        <button type="button" onClick={() => nudge(0.5)} disabled={elevation === undefined} title="+0.5 m">
          +0.5
        </button>
        <button type="button" onClick={() => nudge(5)} disabled={elevation === undefined} title="+5 m">
          +5
        </button>
        <span className="pct-unit">m</span>
      </div>
      <div className="pct-height-resolved">
        <span>
          {known !== undefined
            ? `terrain ≈ ${known.toFixed(1)} m ASL`
            : elevation === undefined
              ? "looked up under the airport point at export"
              : "absolute metres ASL"}
        </span>
        <button
          type="button"
          className="pct-linkbtn"
          onClick={() => void lookUp()}
          disabled={fetching || !bridge || position === undefined}
          title={bridge ? "Look up the terrain elevation under the airport point" : NO_BRIDGE}
        >
          {fetching ? "Fetching…" : known !== undefined ? "Refetch" : "Fetch elevation"}
        </button>
      </div>
      {fetchErr !== null && <div className="pct-fetch-err">{fetchErr}</div>}
      <span className="pct-field-meta">Used by Export TAP: the converter places XREFs at this height.</span>
    </div>
  );
}
