// GliderFields.tsx — the Inspector's panels for the two glider starts, AEROTOW and WINCH LAUNCH.
//
// One file for both because they are one family (forum #237/#238): both `.wad`-only, both repeatable, both
// named by the user. Two components, because the shape of the data differs in the one way that matters.
//
// ★ THE NAME IS THE USER'S JOB, in his words: it should match the runway the start belongs to ("26"), but
// "the user must enter this himself, PCT does not need to worry about it." So nothing here derives a name
// from the nearest runway, however tempting — a guessed name on a start that feeds the wrong runway is
// worse than an empty field.
//
// ★ AN AEROTOW HAS A HEADING; A WINCH LAUNCH DOES NOT. "The length and direction then result from the two
// positions GLIDER and WINCH." The winch panel therefore shows two coordinate pairs and no heading field —
// a heading here could disagree with the two points, and the file has no row for it.
import type { AirportAerotow, AirportWinch } from "../../core/project/types";
import { clampLonLat } from "../../core/project/schemas";
import { haversine, initialBearing } from "../../core/geo/geo";
import { editorStore } from "../state/editorStore";
import { NumberInput } from "./NumberInput";

const fmtDeg = (n: number): string => n.toFixed(6);
const bearing = (deg: number): string => String(Math.round(deg) % 360).padStart(3, "0");

export function AerotowFields({ aerotow }: { aerotow: AirportAerotow }): React.ReactElement {
  const store = editorStore.getState;
  const { id } = aerotow;

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {aerotow.name.trim() === "" ? "Aerotow" : `Aerotow ${aerotow.name.trim()}`}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Aerotow — where the glider waits</span>
        <span className="pct-field-meta">
          The DR400 pulls it into the air along the heading. Drag the pink dot or its rope on the map, and
          the cyan grip to turn it.
        </span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={aerotow.position.lon}
            format={fmtDeg}
            onCommit={(lon) =>
              store().moveAirportAerotow(id, clampLonLat({ lon, lat: aerotow.position.lat }))
            }
            ariaLabel="Aerotow longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={aerotow.position.lat}
            format={fmtDeg}
            onCommit={(lat) =>
              store().moveAirportAerotow(id, clampLonLat({ lon: aerotow.position.lon, lat }))
            }
            ariaLabel="Aerotow latitude"
          />
        </label>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Heading — true</span>
        <NumberInput
          value={aerotow.heading}
          onCommit={(heading) => store().rotateAirportAerotow(id, heading)}
          ariaLabel="Aerotow heading, true degrees"
        />
        <span className="pct-field-meta">
          Aerofly shows this as MAGNETIC, so expect it to read a few degrees off.
        </span>
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name — shown in LOCATION</span>
        <input
          className="pct-text"
          value={aerotow.name}
          placeholder="e.g. 26"
          aria-label="Aerotow name"
          onChange={(e) => store().setAirportAerotowName(id, e.target.value)}
        />
        <span className="pct-field-meta">
          Usually the runway this start belongs to. PCT does not guess it for you.
        </span>
      </label>

      {/* His own note (#237): a glider start does not need a runway, and when the strip is too short the
          tow starts on its extension. Worth saying, because the obvious assumption is the opposite. */}
      <span className="pct-field-meta">
        A glider start does not need a runway. It usually sits on one, or on its extension when the runway
        is too short.
      </span>
    </div>
  );
}

export function WinchFields({ winch }: { winch: AirportWinch }): React.ReactElement {
  const store = editorStore.getState;
  const { id } = winch;
  const ropeM = haversine(winch.position, winch.winch);

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {winch.name.trim() === "" ? "Winch launch" : `Winch launch ${winch.name.trim()}`}
      </div>

      {/* ⛔ Not a caveat we invented: he reported it to IPACS himself (#229). Saying it here is the only
          honest thing to do — otherwise someone builds a winch launch, flies it, sees the glider come out
          twisted in the ground and concludes PCT wrote it wrong. */}
      <p className="pct-warn">
        Winch launches do not work in the current Aerofly FS 4 — the glider starts twisted into the ground.
        The bug is Aerofly's and IPACS have been told. PCT writes the data correctly; it will work when
        they fix it.
      </p>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Winch launch — two points, no heading</span>
        <span className="pct-field-meta">
          The rope runs from the glider to the winch, and its length and direction are whatever those two
          points say. Drag either pink dot, or the rope between them.
        </span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Glider lon</span>
          <NumberInput
            value={winch.position.lon}
            format={fmtDeg}
            onCommit={(lon) =>
              store().moveAirportWinchPoint(id, "glider", clampLonLat({ lon, lat: winch.position.lat }))
            }
            ariaLabel="Winch glider longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Glider lat</span>
          <NumberInput
            value={winch.position.lat}
            format={fmtDeg}
            onCommit={(lat) =>
              store().moveAirportWinchPoint(id, "glider", clampLonLat({ lon: winch.position.lon, lat }))
            }
            ariaLabel="Winch glider latitude"
          />
        </label>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Winch lon</span>
          <NumberInput
            value={winch.winch.lon}
            format={fmtDeg}
            onCommit={(lon) =>
              store().moveAirportWinchPoint(id, "winch", clampLonLat({ lon, lat: winch.winch.lat }))
            }
            ariaLabel="Winch longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Winch lat</span>
          <NumberInput
            value={winch.winch.lat}
            format={fmtDeg}
            onCommit={(lat) =>
              store().moveAirportWinchPoint(id, "winch", clampLonLat({ lon: winch.winch.lon, lat }))
            }
            ariaLabel="Winch latitude"
          />
        </label>
      </div>

      {/* Derived, read-only, and worth the line: his range for a real winch launch is 800–1000 m, and the
          rope length is the one thing here you cannot read off either coordinate pair. */}
      <span className="pct-field-meta">
        {Math.round(ropeM)} m of rope · {bearing(initialBearing(winch.position, winch.winch))}° true.
        Usually 800–1000 m.
      </span>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Glider spacing — m</span>
        <NumberInput
          value={winch.spacing}
          onCommit={(spacing) => store().setAirportWinchSpacing(id, spacing)}
          ariaLabel="Winch glider spacing, metres"
        />
        <span className="pct-field-meta">
          A two-rope winch launches two gliders side by side; this is how far apart they stand —
          basically a wingspan. His own value is 25.
        </span>
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name — shown in LOCATION</span>
        <input
          className="pct-text"
          value={winch.name}
          placeholder="e.g. 26 or 26W"
          aria-label="Winch launch name"
          onChange={(e) => store().setAirportWinchName(id, e.target.value)}
        />
        <span className="pct-field-meta">
          Usually the runway this start belongs to, with a letter added if it needs one.
        </span>
      </label>
    </div>
  );
}
