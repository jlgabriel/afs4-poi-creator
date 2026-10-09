// ParkingFields.tsx — the Inspector's panel for one parking position.
//
// Field order: LON · LAT · HEADING TRUE · SIZE m · NAME · TYPE.
//
// ★ THE USER NEVER SEES `parked_ga`. The menu carries human terms — General Aviation, Jet, Pushback. The
// file's spelling is a fact about the format and lives in PARKING_TYPE_LABELS, one map, so the words on
// screen and the token on disk can never drift apart.
//
// ★ SIZE IS A RADIUS and the simulator shows the DIAMETER, exactly as for the helipad (defaults:
// parked_ga = 7.5 m, parked_jet = 40 m), so the panel says so rather than leaving the factor of two to be
// discovered in flight.
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
            {/* Same field as the pad's: PCT writes TRUE and the sim's menu shows MAGNETIC. */}
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
            {/* Deliberately the SAME sentence as the pad's: one rule, one spelling. */}
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
          {/* The note covers the one TYPE whose behaviour is not in its name. Not mentioned on screen:
              changing the type resizes the stand unless the user already typed a size
              (setAirportParkingType) — the one number on this panel the app changes by itself. */}
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
