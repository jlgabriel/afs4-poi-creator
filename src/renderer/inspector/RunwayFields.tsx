// RunwayFields.tsx — the Inspector's panel for one runway.
//
// The layout is ApfelFlieger's, described in words in forum #242 (he skipped the drawing for this one):
// the two runway ends go in "two possibly fold-out and retractable blocks below each other", explicitly
// NOT side by side. Both open by default; either can be collapsed.
//
// ★★ THE CAPITALS ARE DISPLAY-ONLY. He asked that the selections "appear in the layout in CAPITAL
// LETTERS", and they do — but the value written into the .tsc/.wad stays lower case. This format is case
// sensitive and a value it does not recognise fails SILENTLY (the same trap as the XREF names), so the
// uppercasing lives here, in the label, and never touches the token. There is a test on the writer side.
//
// ★ WHAT IS NOT HERE, and both are his instruction, not an omission:
//   • `endpoint`. PCT uses the threshold for both rows (#236: "in the PCT the leading variable is
//     [threshold] and their values are automatically transferred to [endpoint]"), and #242 repeats it:
//     "PCT should not show [endpoint] in the layout at all". Offering it would let a user describe a
//     displaced threshold for pavement PCT never draws.
//   • `elevation`. "Currently not used in FS 4" — written as 0, never shown.
//   • The custom PAPI position and its three companion rows. #242 says use the defaults at first; #243
//     is the follow-up that says PCT could map it eventually. All four rows already go out with his
//     default values, so adding the controls later changes no file that nobody edits.
import type {
  AirportRunway,
  AirportRunwayEnd,
  ApproachLightSystem,
  PapiSide,
  ReilKind,
} from "../../core/project/types";
import { APPROACH_LIGHT_SYSTEMS, PAPI_SIDES, REIL_KINDS } from "../../core/project/airport";
import { clampLonLat } from "../../core/project/schemas";
import { haversine, initialBearing } from "../../core/geo/geo";
import { editorStore } from "../state/editorStore";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";
import { WadPosition } from "./WadReadout";

const fmtDeg = (n: number): string => n.toFixed(6);
/** Display only — see the header. The token on disk is always the lower-case one. */
const shout = (v: string): string => v.toUpperCase();
const bearing = (deg: number): string => String(Math.round(deg) % 360).padStart(3, "0");

/** The runway's title: its two identifiers, which is how anyone refers to a runway. Both may be empty —
 *  legal, and his 0001 sample leaves the second blank — and then it is just "Runway". */
function titleFor(r: AirportRunway): string {
  const a = r.ends[0].identifier.trim();
  const b = r.ends[1].identifier.trim();
  if (a === "" && b === "") return "Runway";
  if (a === "" || b === "") return `Runway ${a || b}`;
  return `Runway ${a} / ${b}`;
}

function EndBlock({
  runwayId,
  end,
  index,
}: {
  runwayId: string;
  end: AirportRunwayEnd;
  index: 0 | 1;
}): React.ReactElement {
  const store = editorStore.getState;
  const patch = (p: Partial<Omit<AirportRunwayEnd, "threshold">>): void =>
    store().updateAirportRunwayEnd(runwayId, index, p);

  return (
    <details className="pct-runway-end" open>
      {/* His numbering, not a zero-based index: the file's rows are `threshold1`/`threshold2`, and #242
          asks that "this distinction should also be made in the layout of the PCT". */}
      <summary>
        END {index + 1}
        {end.identifier.trim() !== "" && <span className="pct-end-code">{end.identifier.trim()}</span>}
      </summary>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Identifier</span>
        <input
          className="pct-num"
          value={end.identifier}
          placeholder="e.g. 08"
          aria-label={`Runway end ${index + 1} identifier`}
          onChange={(e) => patch({ identifier: e.target.value })}
        />
      </label>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={end.threshold.lon}
            format={fmtDeg}
            onCommit={(lon) =>
              store().moveAirportRunwayEnd(
                runwayId,
                index,
                clampLonLat({ lon, lat: end.threshold.lat }),
              )
            }
            ariaLabel={`Runway end ${index + 1} longitude`}
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={end.threshold.lat}
            format={fmtDeg}
            onCommit={(lat) =>
              store().moveAirportRunwayEnd(
                runwayId,
                index,
                clampLonLat({ lon: end.threshold.lon, lat }),
              )
            }
            ariaLabel={`Runway end ${index + 1} latitude`}
          />
        </label>
      </div>
      {/* Per END, because a runway's coordinates are its two thresholds and the file carries them as two
          separate positions. There is no heading row to sit under: the direction is derived from the pair
          and PCT deliberately shows no field for it. */}
      <WadPosition position={end.threshold} />

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Approach lighting</span>
        {/* A FLAT list, deliberately. The vocabulary splits in two (airport.ts: the six his ACT offers,
            the five FS2-era ones FS4 still loads), but that split is a fact about HIS editor, and nobody
            using PCT has it — grouping the menu by it would show the user a distinction that means
            nothing to them. The order is still his. */}
        <select
          className="pct-num"
          value={end.appltsys}
          aria-label={`Runway end ${index + 1} approach lighting`}
          onChange={(e) => patch({ appltsys: e.target.value as ApproachLightSystem })}
        >
          {APPROACH_LIGHT_SYSTEMS.map((v) => (
            <option key={v} value={v}>
              {shout(v)}
            </option>
          ))}
        </select>
      </label>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">PAPI</span>
          <select
            className="pct-num"
            value={end.papi}
            aria-label={`Runway end ${index + 1} PAPI`}
            onChange={(e) => patch({ papi: e.target.value as PapiSide })}
          >
            {PAPI_SIDES.map((v) => (
              <option key={v} value={v}>
                {shout(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">REIL</span>
          <select
            className="pct-num"
            value={end.reil}
            aria-label={`Runway end ${index + 1} REIL`}
            onChange={(e) => patch({ reil: e.target.value as ReilKind })}
          >
            {REIL_KINDS.map((v) => (
              <option key={v} value={v}>
                {shout(v)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* `approach` and `takeoff` in the file. Those are the format's words, not English UI words, and
          this is the same call the parking `tags` got: say what it means to the person choosing. */}
      <div className="pct-field pct-field-col">
        <label className="pct-check">
          <input
            type="checkbox"
            checked={end.approach}
            aria-label={`Runway end ${index + 1} can be landed on`}
            onChange={(e) => patch({ approach: e.target.checked })}
          />
          Can land here
        </label>
        <label className="pct-check">
          <input
            type="checkbox"
            checked={end.takeoff}
            aria-label={`Runway end ${index + 1} can be taken off from`}
            onChange={(e) => patch({ takeoff: e.target.checked })}
          />
          Can take off here
        </label>
      </div>
    </details>
  );
}

export function RunwayFields({ runway }: { runway: AirportRunway }): React.ReactElement {
  const store = editorStore.getState;
  const [a, b] = runway.ends;
  const lengthM = haversine(a.threshold, b.threshold);

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">{titleFor(runway)}</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Runway
          <Help>
            Drag either white threshold handle on the map. The two points ARE the runway — its length and
            direction are whatever they say, which is why there is no heading to type.
          </Help>
        </span>
        {/* His demarcation from the ACT, in short (#242). It stays near the top, where someone forms an
            expectation about what they are building, rather than at the foot of a panel they may never
            scroll to. */}
        <span className="pct-field-label">
          What PCT writes
          <Help>
            The runway&apos;s data, not its asphalt: no markings, no centre line, no surface. Aerofly
            draws the ground — this tells it where the runway is and how to use it.
          </Help>
        </span>
      </div>

      <label className="pct-field pct-field-col">
        {/* The note that hung off this label is gone (#286). What Aerofly does with the width is
            background, and background is the manual's job now. */}
        <span className="pct-field-label">Width — m</span>
        <NumberInput
          value={runway.width}
          onCommit={(width) => store().setAirportRunwayWidth(runway.id, width)}
          ariaLabel="Runway width, metres"
        />
      </label>

      {/* Derived and read-only. Neither number is in the file — the format carries no length and no
          heading — but they are the cheapest sanity check on screen: it is how you notice you have just
          dragged a 12 km runway, or built one at right angles to the one beside it. */}
      <span className="pct-field-meta">
        {lengthM < 10000 ? `${Math.round(lengthM)} m` : `${(lengthM / 1000).toFixed(1)} km`} long ·{" "}
        {bearing(initialBearing(a.threshold, b.threshold))}° /{" "}
        {bearing(initialBearing(b.threshold, a.threshold))}° true
      </span>

      <EndBlock runwayId={runway.id} end={a} index={0} />
      <EndBlock runwayId={runway.id} end={b} index={1} />
    </div>
  );
}
