// PlacedList.tsx — the right panel's lower half: every placed object as a selectable row (design §5
// "PLACED LIST: all objects, click=select, dblclick=fly"). It's the map's twin — both are just views
// of the same store selection, so selecting here highlights the footprint and vice-versa, and the
// Inspector above follows selection[0]. Duplicate / Delete act on the current selection (the same
// store actions Ctrl+D / Del already call from the keyboard).
//
// Not virtualized: a POI is tens-to-low-hundreds of objects, not the catalog's 911; if dense scenes
// ever make this janky, it takes the same react-window treatment the catalog got.
import { useMemo } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { Thumbnail } from "../catalog/Thumbnail";
import { HelipadIcon, ParkingIcon } from "../catalog/categoryIcon";
import { photoKeyForPlaced as placedPhotoKey } from "../../core/catalog/photoKey";
import { PARKING_TYPE_LABELS, firstPad } from "../../core/project/airport";
import { rowInfo } from "./rowInfo";

/** The helipad's row, pinned above the objects (v1.3, forum #173: "which is then listed on the right for
 *  editing"). It is NOT one of the objects and does not join their count — there is exactly one, it never
 *  goes into the cultivation, and Duplicate means nothing for it — so it gets its own row above the list
 *  rather than a place in it. Click selects, double-click flies, and the Inspector shows the heliport. */
function HelipadRow(): React.ReactElement | null {
  const airport = useEditor((s) => s.project.airport);
  const selected = useEditor((s) => s.airportSelection?.kind === "pad");
  if (airport === undefined) return null;
  const { icao, name } = airport;
  // One row for one pad — the v1.3 shape. A pad-less airport has no row to draw (airport.ts), and the
  // repeatable HELICOPTER menu (forum #219/#221) is what turns this into one row per pad.
  const pad = firstPad(airport);
  if (pad === undefined) return null;
  return (
    <button
      type="button"
      className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
      aria-pressed={selected}
      title="The helicopter's start pad"
      onClick={() => editorStore.getState().selectAirportPart({ kind: "pad", id: pad.id })}
      onDoubleClick={() => editorStore.getState().flyTo(pad.position)}
    >
      <HelipadIcon />
      <span className="pct-placed-text">
        <span className="pct-placed-name">
          <span className="pct-placed-label">
            {name.trim() === "" ? "Start - Helicopter" : name.trim()}
          </span>
          {icao.trim() !== "" && <span className="pct-placed-code">{icao.toUpperCase()}</span>}
        </span>
        <span className="pct-placed-meta">
          lon {pad.position.lon.toFixed(6)} · lat {pad.position.lat.toFixed(6)} ·{" "}
          {Math.round(pad.heading)}°
        </span>
      </span>
    </button>
  );
}

/** One row per parking position, pinned with the pad above the objects and for the same reasons: a stand
 *  is not an object, never joins their count, never goes into the cultivation, and Duplicate means
 *  nothing for it. Repeatable, though — "any number of parking positions can be created" (forum #232) —
 *  so unlike the pad this is a list, and it is the shape the other four kinds will take. */
function ParkingRows(): React.ReactElement | null {
  const parkings = useEditor((s) => s.project.airport?.parkings);
  const selectedId = useEditor((s) =>
    s.airportSelection?.kind === "parking" ? s.airportSelection.id : null,
  );
  if (parkings === undefined || parkings.length === 0) return null;
  return (
    <>
      {parkings.map((p) => {
        const selected = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
            aria-pressed={selected}
            title="A parking position"
            onClick={() => editorStore.getState().selectAirportPart({ kind: "parking", id: p.id })}
            onDoubleClick={() => editorStore.getState().flyTo(p.position)}
          >
            <ParkingIcon />
            <span className="pct-placed-text">
              <span className="pct-placed-name">
                <span className="pct-placed-label">
                  {p.name.trim() === "" ? "Parking" : p.name.trim()}
                </span>
                {/* His word, not the file's token — see ParkingFields on why the user never sees
                    `parked_ga`. */}
                <span className="pct-placed-code">{PARKING_TYPE_LABELS[p.type]}</span>
              </span>
              <span className="pct-placed-meta">
                lon {p.position.lon.toFixed(6)} · lat {p.position.lat.toFixed(6)} ·{" "}
                {Math.round(p.heading)}° · {p.size} m
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

export function PlacedList(): React.ReactElement {
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const airportSelected = useEditor((s) => s.airportSelection !== null);
  const catalogIndex = useEditor((s) => s.catalogIndex);
  const airportLightIndex = useEditor((s) => s.airportLightIndex);
  const plantIndex = useEditor((s) => s.plantIndex);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const hasSelection = selection.length > 0;

  return (
    <section className="pct-placed">
      <div className="pct-placed-head">
        <h2 className="pct-panel-title">Placed ({objects.length})</h2>
        <div className="pct-placed-actions">
          <button
            type="button"
            disabled={!hasSelection}
            title="Duplicate selection (Ctrl+D)"
            onClick={() => editorStore.getState().duplicateSelection()}
          >
            Duplicate
          </button>
          {/* Delete also reaches the pad — deleteSelection removes the airport block when it is the
              thing selected, so the button follows whatever the panel above is showing. Duplicate does
              not: a project has one start position. */}
          <button
            type="button"
            disabled={!hasSelection && !airportSelected}
            title="Delete selection (Del)"
            onClick={() => editorStore.getState().deleteSelection()}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="pct-placed-list">
        <HelipadRow />
        <ParkingRows />
        {objects.length === 0 ? (
          <p className="pct-empty">No objects yet — click the map to place one.</p>
        ) : (
          objects.map((o) => {
            const info = rowInfo(o, catalogIndex, airportLightIndex, plantIndex);
            const selected = selSet.has(o.id);
            return (
              <button
                key={o.id}
                type="button"
                className={selected ? "pct-placed-row sel" : "pct-placed-row"}
                aria-pressed={selected}
                title={info.name}
                onClick={(e) => editorStore.getState().select([o.id], e.shiftKey)}
                onDoubleClick={() => editorStore.getState().flyTo(o.position)}
              >
                {/* v0.8: every kind resolves a photo, not just xref. `null` was never a "this kind has no
                    photo" rule — it was "only an xref has a name I can use", and photoKey removes that
                    limit. A placed plant now shows the same picture its catalog card does. */}
                <Thumbnail name={placedPhotoKey(o)} category={info.category} />
                <span className="pct-placed-text">
                  <span className="pct-placed-name">
                    <span className="pct-placed-label">{info.name}</span>
                    {/* The map already draws it red-dashed, but a dense scene hides that — the list is
                        where you actually notice "this one won't render" before you export. The badge holds
                        its space; a long name truncates instead of pushing the flag out of sight. */}
                    {info.missing && (
                      <span
                        className="pct-placed-missing"
                        title="Not in your install — the sim will skip it"
                      >
                        missing
                      </span>
                    )}
                  </span>
                  <span className="pct-placed-meta">
                    lon {o.position.lon.toFixed(6)} · lat {o.position.lat.toFixed(6)}
                    {o.locked ? " · locked" : ""}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
