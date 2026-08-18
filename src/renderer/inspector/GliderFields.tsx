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
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";
import { WadHeading, WadPosition } from "./WadReadout";

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
        <span className="pct-field-label">
          Aerotow
          <Help>
            The DR400 pulls it into the air along the heading. Drag the pink dot or its rope on the map,
            and the cyan grip to turn it.
          </Help>
        </span>
        {/* ⛔ "Does it need a runway? — No. It usually sits on one, or on its extension when the runway
            is too short." is struck whole in #289. It was HIS OWN note (#237), kept because the obvious
            assumption is the opposite one. He is retiring it himself. */}
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
      <WadPosition position={aerotow.position} />

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Heading — true
          <Help>Aerofly shows this as MAGNETIC, so expect it to read a few degrees off.</Help>
        </span>
        <NumberInput
          value={aerotow.heading}
          onCommit={(heading) => store().rotateAirportAerotow(id, heading)}
          ariaLabel="Aerotow heading, true degrees"
        />
      </label>
      <WadHeading heading={aerotow.heading} />

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Name
          <Help>Usually the runway this start belongs to. PCT does not guess it for you.</Help>
        </span>
        <input
          className="pct-text"
          value={aerotow.name}
          placeholder="e.g. 26"
          aria-label="Aerotow name"
          onChange={(e) => store().setAirportAerotowName(id, e.target.value)}
        />
      </label>
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
        {/* Capital L (#290): he ringed the "l" and wrote «"L" in CAPITAL LETTER». The catalog card and
            the placed list already said Winch Launch; the panel was the odd one out. */}
        {winch.name.trim() === "" ? "Winch Launch" : `Winch Launch ${winch.name.trim()}`}
      </div>

      {/* ✅ The warning that stood here through v1.4.0 is gone. It was never a caveat we invented — he
          reported the bug to IPACS himself (#229) — and it is retired on his word too: "In the FS 4 the
          winch is repaired, so the warning can already go away" (#261). */}

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Winch Launch
          {/* ★ THIS SENTENCE IS A TEST, and it caught a real bug once: it promises "drag either pink dot,
              or the rope between them", and the rope shipped without a mousedown. Folding it does not
              retire the promise — GliderLayer still has to keep it. #290 struck the label's tail
              ("— two points, no heading") but NOT the note under it, so the promise stays on screen. */}
          <Help>
            The rope runs from the glider to the winch, and its length and direction are whatever those
            two points say. Drag either pink dot, the square winch, or the rope between them.
          </Help>
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
      <WadPosition position={winch.position} />

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
      {/* Both ends get one. A winch launch has no heading field — "the length and direction then result
          from the two positions" (#238) — so the pair of positions IS everything the file carries. */}
      <WadPosition position={winch.winch} />

      {/* Derived, read-only, and worth the line: his range for a real winch launch is 800–1000 m, and the
          rope length is the one thing here you cannot read off either coordinate pair. */}
      <span className="pct-field-meta">
        {Math.round(ropeM)} m of rope · {bearing(initialBearing(winch.position, winch.winch))}° true.
        Usually 800–1000 m.
      </span>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Glider spacing — m
          {/* "His own value is 25" left with the other background notes (#284). It was a note from
              ApfelFlieger to us that had leaked onto the screen, in the third person, where nobody using
              PCT knows who "he" is. What the field MEANS is not background, so that half stays. */}
          <Help>
            A two-rope winch launches two gliders side by side; this is how far apart they stand —
            basically a wingspan.
          </Help>
        </span>
        <NumberInput
          value={winch.spacing}
          onCommit={(spacing) => store().setAirportWinchSpacing(id, spacing)}
          ariaLabel="Winch glider spacing, metres"
        />
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Name
          <Help>Usually the runway this start belongs to, with a letter added if it needs one.</Help>
        </span>
        <input
          className="pct-text"
          value={winch.name}
          placeholder="e.g. 26 or 26W"
          aria-label="Winch launch name"
          onChange={(e) => store().setAirportWinchName(id, e.target.value)}
        />
      </label>
    </div>
  );
}
