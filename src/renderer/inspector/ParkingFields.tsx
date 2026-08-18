// ParkingFields.tsx — the Inspector's panel for one parking position.
//
// The mask is ApfelFlieger's, drawn in forum #232: LON · LAT · HEADING TRUE · SIZE m · NAME · TYPE. It is
// the only one of the five submenus he drew rather than described, so this panel follows it field for
// field and in his order.
//
// ★ THE USER NEVER SEES `parked_ga`. He was explicit about it (#236): the menu should carry "the terms
// that tell him something as a human being" — General Aviation, Jet, Pushback. The file's spelling is a
// fact about the format and lives in PARKING_TYPE_LABELS, one map, so the words on screen and the token
// on disk can never drift apart.
//
// ★ SIZE IS A RADIUS and the simulator shows the DIAMETER, exactly as for the helipad. His own margin
// note pins the two defaults ([parked_ga] = 7.5 M, [parked_jet] = 40 M), so the panel says what the sim
// will call it rather than letting someone discover the factor of two in flight.
import type { AirportParking, ParkingType } from "../../core/project/types";
import { PARKING_TYPES, PARKING_TYPE_LABELS } from "../../core/project/airport";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore } from "../state/editorStore";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";
import { WadHeading, WadPosition } from "./WadReadout";

const fmtDeg = (n: number): string => n.toFixed(6);

export function ParkingFields({ parking }: { parking: AirportParking }): React.ReactElement {
  const store = editorStore.getState;
  const { id } = parking;

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {parking.name.trim() === "" ? "Parking" : parking.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        {/* ⛔ Struck in #288, note and "?" together — the pad's twin, struck the same way. */}
        <span className="pct-field-label">Parking position</span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={parking.position.lon}
            format={fmtDeg}
            onCommit={(lon) =>
              store().moveAirportParking(id, clampLonLat({ lon, lat: parking.position.lat }))
            }
            ariaLabel="Parking longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={parking.position.lat}
            format={fmtDeg}
            onCommit={(lat) =>
              store().moveAirportParking(id, clampLonLat({ lon: parking.position.lon, lat }))
            }
            ariaLabel="Parking latitude"
          />
        </label>
      </div>
      <WadPosition position={parking.position} />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">
            Heading — true
            {/* Measured in-sim 2026-07-31 for the pad, and it is the same field: we write TRUE and the
                sim's menu shows MAGNETIC. */}
            <Help>Aerofly shows this heading as MAGNETIC, so expect it to read a few degrees off.</Help>
          </span>
          <NumberInput
            value={parking.heading}
            onCommit={(heading) => store().rotateAirportParking(id, heading)}
            ariaLabel="Parking heading, true degrees"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">
            Size — m
            {/* His wording, verbatim (#295) — the pad's twin, and deliberately the SAME sentence: these
                two fields are one field seen twice, and two spellings of one rule is what he objects to. */}
            <Help>This is the RADIUS - the map shows DIAMETER (= 2x RADIUS)</Help>
          </span>
          <NumberInput
            value={parking.size}
            onCommit={(size) => store().setAirportParkingSize(id, size)}
            ariaLabel="Parking size, metres"
          />
        </label>
      </div>
      {/* Under the row, for the reason HelipadFields spells out: the chip needs the full width. */}
      <WadHeading heading={parking.heading} />

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Name
          <Help>Leave it empty and Aerofly shows the stand as &ldquo;Parking&rdquo;.</Help>
        </span>
        <input
          className="pct-text"
          value={parking.name}
          placeholder="e.g. Parking1"
          aria-label="Parking name"
          onChange={(e) => store().setAirportParkingName(id, e.target.value)}
        />
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Type
          {/* His replacement (#288 — blue frame, arrow pointing at this block). ⚠️ WHAT IT REPLACED, in
              case he wants it back: "Which aircraft Aerofly parks here. Changing it resizes the stand,
              unless you have already typed a size of your own." That resize is real — setAirportParkingType
              does it — and it is the one thing on this panel the app does to a number the user did not
              touch. His sentence covers the one TYPE whose behaviour is not in its name. Only the German
              quotation marks he wrote it with are changed, because the rest of this UI is English. */}
          <Help>&ldquo;Pushback&rdquo; activates the pushback function regardless of size.</Help>
        </span>
        <select
          className="pct-num"
          value={parking.type}
          aria-label="Parking type"
          onChange={(e) => store().setAirportParkingType(id, e.target.value as ParkingType)}
        >
          {PARKING_TYPES.map((t) => (
            <option key={t} value={t}>
              {PARKING_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
