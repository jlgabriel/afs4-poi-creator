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
import {
  AerotowIcon,
  DataIcon,
  HelipadIcon,
  ParkingIcon,
  RunwayIcon,
  WinchIcon,
} from "../catalog/categoryIcon";
import { photoKeyForPlaced as placedPhotoKey } from "../../core/catalog/photoKey";
import { PARKING_TYPE_LABELS } from "../../core/project/airport";
import { haversine, initialBearing } from "../../core/geo/geo";
import { rowInfo } from "./rowInfo";

/** The airport's own row — his submenu (1) DATA — pinned above every airport part, because the parts
 *  belong to it. Present whenever the block is, INCLUDING an airport with no geometry at all: PCT will
 *  not INSTALL that (Aerofly rejects it outright — "no valid runway or helipad defined"), but it is a
 *  perfectly ordinary thing to have half-built on the map, and since #278 it is what you are left with
 *  after deleting your last helipad. The row is what keeps such an airport visible and reachable instead
 *  of a block nobody can see.
 *
 *  Double-click flies to it, like every other row here — the airport has had a point of its own since
 *  v1.5 (#255). Before that its position followed the first helipad, so flying "to the airport" would
 *  have flown to a pad while claiming otherwise, and this row deliberately had no fly-to at all. */
function DataRow(): React.ReactElement | null {
  const airport = useEditor((s) => s.project.airport);
  const selected = useEditor((s) => s.airportSelection?.kind === "data");
  if (airport === undefined) return null;
  const { icao, name } = airport;
  const point = airport.position;
  const parts =
    airport.pads.length +
    (airport.parkings?.length ?? 0) +
    (airport.runways?.length ?? 0) +
    (airport.aerotows?.length ?? 0) +
    (airport.winches?.length ?? 0);
  return (
    <button
      type="button"
      className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
      aria-pressed={selected}
      title="The airport itself — its name and code"
      onClick={() => editorStore.getState().selectAirportPart({ kind: "data" })}
      onDoubleClick={() => {
        if (point !== undefined) editorStore.getState().flyTo(point);
      }}
    >
      <DataIcon />
      <span className="pct-placed-text">
        <span className="pct-placed-name">
          <span className="pct-placed-label">{name.trim() === "" ? "Airport" : name.trim()}</span>
          {icao.trim() !== "" && <span className="pct-placed-code">{icao.toUpperCase()}</span>}
        </span>
        <span className="pct-placed-meta">
          {icao.trim() === "" && name.trim() === ""
            ? "no name or code yet — click to add them"
            : parts === 0
              ? "no parts placed yet"
              : `${parts} ${parts === 1 ? "part" : "parts"}`}
        </span>
      </span>
    </button>
  );
}

/** One row per helicopter start pad (v1.3, forum #173: "which is then listed on the right for editing";
 *  a LIST since #221). They are NOT objects and do not join their count — none of them goes into the
 *  cultivation and Duplicate means nothing for them — so they sit above the list rather than in it.
 *
 *  The label is the pad's own name, not the airport's. Through v1.3 it showed the AIRPORT's name and code
 *  here, which was the same shortcut the pad panel took: with one pad you cannot tell the two apart. With
 *  three you can, and the airport's name belongs to the Data row above. */
function HelipadRows(): React.ReactElement | null {
  const pads = useEditor((s) => s.project.airport?.pads);
  const selectedId = useEditor((s) =>
    s.airportSelection?.kind === "pad" ? s.airportSelection.id : null,
  );
  if (pads === undefined || pads.length === 0) return null;
  return (
    <>
      {pads.map((pad) => {
        const selected = pad.id === selectedId;
        return (
          <button
            key={pad.id}
            type="button"
            className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
            aria-pressed={selected}
            title="A helicopter start pad"
            onClick={() => editorStore.getState().selectAirportPart({ kind: "pad", id: pad.id })}
            onDoubleClick={() => editorStore.getState().flyTo(pad.position)}
          >
            <HelipadIcon />
            <span className="pct-placed-text">
              <span className="pct-placed-name">
                <span className="pct-placed-label">
                  {pad.name.trim() === "" ? "Helipad" : pad.name.trim()}
                </span>
                <span className="pct-placed-code">{pad.radius} m</span>
              </span>
              <span className="pct-placed-meta">
                lon {pad.position.lon.toFixed(6)} · lat {pad.position.lat.toFixed(6)} ·{" "}
                {Math.round(pad.heading)}°
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

/** One row per parking position, pinned with the pads above the objects and for the same reasons: a stand
 *  is not an object, never joins their count, never goes into the cultivation, and Duplicate means
 *  nothing for it. This was the FIRST of the repeatable kinds to be built ("any number of parking
 *  positions can be created", forum #232) and the other four followed its shape — the pad last, because
 *  it was the one that already existed as a singleton. */
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

/** One row per runway. Same contract as the stands', and the label is how anyone refers to a runway: its
 *  two identifiers. Both may be empty — legal, his 0001 sample leaves the second blank. */
function RunwayRows(): React.ReactElement | null {
  const runways = useEditor((s) => s.project.airport?.runways);
  const selectedId = useEditor((s) =>
    s.airportSelection?.kind === "runway" ? s.airportSelection.id : null,
  );
  if (runways === undefined || runways.length === 0) return null;
  return (
    <>
      {runways.map((r) => {
        const selected = r.id === selectedId;
        const a = r.ends[0].identifier.trim();
        const b = r.ends[1].identifier.trim();
        const label = a === "" && b === "" ? "Runway" : `Runway ${[a, b].filter(Boolean).join(" / ")}`;
        const lengthM = haversine(r.ends[0].threshold, r.ends[1].threshold);
        return (
          <button
            key={r.id}
            type="button"
            className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
            aria-pressed={selected}
            title="A runway"
            onClick={() => editorStore.getState().selectAirportPart({ kind: "runway", id: r.id })}
            onDoubleClick={() => editorStore.getState().flyTo(r.ends[0].threshold)}
          >
            <RunwayIcon />
            <span className="pct-placed-text">
              <span className="pct-placed-name">
                <span className="pct-placed-label">{label}</span>
                <span className="pct-placed-code">{r.width} m</span>
              </span>
              <span className="pct-placed-meta">
                {lengthM < 10000 ? `${Math.round(lengthM)} m` : `${(lengthM / 1000).toFixed(1)} km`} ·{" "}
                {String(Math.round(initialBearing(r.ends[0].threshold, r.ends[1].threshold)) % 360).padStart(3, "0")}
                ° true
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

/** One row per glider start, aerotows then winch launches. Both `.wad`-only, both repeatable, and both
 *  named by the user after the runway they serve — an empty name is normal, not a mistake. */
function GliderRows(): React.ReactElement | null {
  const aerotows = useEditor((s) => s.project.airport?.aerotows);
  const winches = useEditor((s) => s.project.airport?.winches);
  const sel = useEditor((s) => s.airportSelection);
  const rows: React.ReactElement[] = [];

  for (const a of aerotows ?? []) {
    const selected = sel?.kind === "aerotow" && sel.id === a.id;
    rows.push(
      <button
        key={a.id}
        type="button"
        className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
        aria-pressed={selected}
        title="A glider aerotow start"
        onClick={() => editorStore.getState().selectAirportPart({ kind: "aerotow", id: a.id })}
        onDoubleClick={() => editorStore.getState().flyTo(a.position)}
      >
        <AerotowIcon />
        <span className="pct-placed-text">
          <span className="pct-placed-name">
            <span className="pct-placed-label">
              {a.name.trim() === "" ? "Aerotow" : `Aerotow ${a.name.trim()}`}
            </span>
          </span>
          <span className="pct-placed-meta">
            lon {a.position.lon.toFixed(6)} · lat {a.position.lat.toFixed(6)} · {Math.round(a.heading)}°
          </span>
        </span>
      </button>,
    );
  }

  for (const w of winches ?? []) {
    const selected = sel?.kind === "winch" && sel.id === w.id;
    rows.push(
      <button
        key={w.id}
        type="button"
        className={selected ? "pct-placed-row pct-placed-pad sel" : "pct-placed-row pct-placed-pad"}
        aria-pressed={selected}
        title="A glider winch launch"
        onClick={() => editorStore.getState().selectAirportPart({ kind: "winch", id: w.id })}
        onDoubleClick={() => editorStore.getState().flyTo(w.position)}
      >
        <WinchIcon />
        <span className="pct-placed-text">
          <span className="pct-placed-name">
            <span className="pct-placed-label">
              {w.name.trim() === "" ? "Winch launch" : `Winch launch ${w.name.trim()}`}
            </span>
            <span className="pct-placed-code">{Math.round(haversine(w.position, w.winch))} m</span>
          </span>
          <span className="pct-placed-meta">
            lon {w.position.lon.toFixed(6)} · lat {w.position.lat.toFixed(6)} · {w.spacing} m apart
          </span>
        </span>
      </button>,
    );
  }

  if (rows.length === 0) return null;
  return <>{rows}</>;
}

export function PlacedList(): React.ReactElement {
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const airportSelected = useEditor((s) => s.airportSelection !== null);
  const pendingAirportDelete = useEditor((s) => s.pendingAirportDelete);
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
          {/* Delete also reaches the airport parts — deleteSelection drops whichever one is selected, so
              the button follows whatever the panel above is showing. On the Airport row it deletes the
              whole airport, geometry and all, which is the only deliberate way to do that. Duplicate does
              not reach any of them.

              ★ AND ON THAT ROW IT ASKS FIRST (#253c). The label is the question, so the second press is
              answering something rather than repeating something — his "only with another click can it
              really be deleted". The note beside it lives in the Airport panel, which is what the
              Inspector is showing whenever this state can be reached. */}
          <button
            type="button"
            disabled={!hasSelection && !airportSelected}
            className={pendingAirportDelete ? "pct-danger" : undefined}
            title={
              pendingAirportDelete
                ? "Press again to delete the airport and everything in it"
                : "Delete selection (Del)"
            }
            onClick={() => editorStore.getState().deleteSelection()}
          >
            {pendingAirportDelete ? "Really delete?" : "Delete"}
          </button>
        </div>
      </div>

      <div className="pct-placed-list">
        {/* ★ THIS ORDER IS HALF OF A PAIR (#277). It must match the catalog's Airport section card for
            card — he caught PARKING and RUNWAY sitting in opposite places in the two columns and asked
            for one sequence: "I suggest that the sequences in both columns remain identical." The order
            itself is his too, chosen as "the one that an average user expects". Changing it here without
            changing AirportSection.tsx re-creates exactly the bug he reported. */}
        <DataRow />
        <RunwayRows />
        <HelipadRows />
        <ParkingRows />
        <GliderRows />
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
