// AirportDataFields.tsx — the Inspector's panel for the airport ITSELF: what it is called and what code
// it gets. The DATA submenu, one of the six cards of the Airport section.
//
// WHY THE IDENTITY HAS ITS OWN PANEL rather than living in the pad's:
//  1. The pad is repeatable. Identity inside the pad's panel would be one code shown N times, which reads
//     as N codes — and editing it in one pad would silently change the others.
//  2. Placing a stand also creates the airport block (mutate.ts), so a project whose only airport part is
//     a parking position still needs a place to type its identity.
//
// ★ ONE FIELD, THREE PLACES ON DISK. "Airport name" feeds `sname` and `lname` in the .tsc and `name` in
// the .wad. The user is not shown three boxes for it.
import { useEffect, useState } from "react";
import type { ProjectAirport } from "../../core/project/types";
import type { IcaoStatus } from "../../shared/pctApi";
import { clampLonLat } from "../../core/project/schemas";
import { identityProblemText, validateIdentity, SNAME_MAX } from "../../core/export/heliportTemplate";
import { editorStore, useEditor } from "../state/editorStore";
import { NumberInput } from "./NumberInput";
import { WadPosition } from "./WadReadout";
import { getPct } from "../app/pct";

const fmtDeg = (n: number): string => n.toFixed(6);

/** Ask the dialog to open. Same channel the photo menu uses for Settings (`pct:open-settings`): the
 *  dialog's open flag is AppShell's local state and this panel is not its child, so a window event is
 *  the established way across rather than threading a prop through three components. */
function openInstallDialog(): void {
  window.dispatchEvent(new Event("pct:open-heliport"));
}

/** Live availability of the typed code on THIS machine. Convenience only — the install re-checks at the
 *  write boundary, so a stale answer here costs nothing (see main/icaoIndex). */
function useIcaoStatus(icao: string, wellFormed: boolean): IcaoStatus {
  const pct = getPct();
  const [status, setStatus] = useState<IcaoStatus>({ taken: false, ours: [] });
  useEffect(() => {
    let cancelled = false;
    if (pct === null || !wellFormed) {
      setStatus({ taken: false, ours: [] });
      return;
    }
    void pct.icaoStatus(icao).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [pct, icao, wellFormed]);
  return status;
}

export function AirportDataFields({ airport }: { airport: ProjectAirport }): React.ReactElement {
  const store = editorStore.getState;

  const identity = {
    icao: airport.icao.trim().toLowerCase(),
    name: airport.name,
    country: airport.country.trim().toLowerCase(),
  };
  const problem = validateIdentity(identity);
  const status = useIcaoStatus(identity.icao, problem !== "icao-format");
  const replacing = status.ours.length > 0;
  // Hoisted so TypeScript keeps the narrowing inside the two onCommit closures below.
  const point = airport.position;
  const armed = useEditor((s) => s.placing?.kind === "airport");
  const pendingDelete = useEditor((s) => s.pendingAirportDelete);
  const parts =
    airport.pads.length +
    (airport.parkings?.length ?? 0) +
    (airport.runways?.length ?? 0) +
    (airport.aerotows?.length ?? 0) +
    (airport.winches?.length ?? 0);

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {airport.name.trim() === "" ? "Airport" : airport.name.trim()}
      </div>

      {/* ★ Deleting the airport takes a second press, because it deletes every part with it. The note
          sits at the TOP of the panel because it answers a key that was already pressed — further down it
          would be a warning the user scrolls to after the fact. The count is what makes it worth reading. */}
      {pendingDelete && (
        <p className="pct-warn">
          Delete this airport{parts > 0 ? ` and its ${parts} ${parts === 1 ? "element" : "elements"}` : ""}?
          Press Delete again, or click anything else to keep it.
        </p>
      )}

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Airport</span>
      </div>

      {/* ★ LON/LAT SITS HERE, DIRECTLY UNDER THE DESCRIPTION, because that is exactly where it sits in the
          helipad's panel, the stand's and the aerotow's: comparable fields keep one place across elements,
          so switching between them does not reshuffle the layout. */}
      {point !== undefined ? (
        <>
          <div className="pct-field pct-field-row">
            <label className="pct-field-col">
              <span className="pct-field-label">Lon</span>
              <NumberInput
                value={point.lon}
                format={fmtDeg}
                onCommit={(lon) => store().moveAirportPosition(clampLonLat({ lon, lat: point.lat }))}
                ariaLabel="Airport longitude"
              />
            </label>
            <label className="pct-field-col">
              <span className="pct-field-label">Lat</span>
              <NumberInput
                value={point.lat}
                format={fmtDeg}
                onCommit={(lat) => store().moveAirportPosition(clampLonLat({ lon: point.lon, lat }))}
                ariaLabel="Airport latitude"
              />
            </label>
          </div>
          <WadPosition position={point} />
        </>
      ) : (
        <div className="pct-field pct-field-col">
          <span className="pct-field-label">Lon / Lat</span>
          <span className="pct-field-meta">
            Not on the map yet. The first element you place gives the airport its point — or put it down
            yourself and it stays there.
          </span>
          <button
            type="button"
            aria-pressed={armed}
            onClick={() =>
              editorStore.getState().armPlacement(armed ? null : { kind: "airport" })
            }
          >
            {armed ? "Click the map…" : "Put it on the map"}
          </button>
        </div>
      )}

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name</span>
        <input
          className="pct-text"
          value={airport.name}
          maxLength={SNAME_MAX}
          placeholder="1-29 digits (a…z,A…Z,0…9,SPACE)"
          aria-label="Airport name"
          onChange={(e) => store().setAirportIdentity({ name: e.target.value })}
        />
        {/* A counter only: the input is capped at SNAME_MAX, so the limit is enforced without a sentence. */}
        <span className="pct-field-meta">
          {airport.name.trim().length}/{SNAME_MAX}
        </span>
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">ICAO code</span>
        {/* Shown in CAPITALS and written that way into the .tsc and the .wad too — the file NAMES stay
            lowercase, as Aerofly's own are. */}
        <input
          className="pct-num"
          value={airport.icao.toUpperCase()}
          placeholder="4-6 digits (A…Z,0…9)"
          aria-label="Airport code"
          onChange={(e) => store().setAirportIdentity({ icao: e.target.value.trim().toLowerCase() })}
        />
        {airport.icao.trim() !== "" && problem === "icao-format" && (
          <span className="pct-warn">{identityProblemText("icao-format")}</span>
        )}
        {problem !== "icao-format" && status.taken && (
          <span className="pct-warn">
            {identity.icao.toUpperCase()} is already an airport on this machine. Using it would make that
            airport disappear — pick another code.
          </span>
        )}
        {problem !== "icao-format" && !status.taken && replacing && (
          <span className="pct-field-meta">
            You already installed {identity.icao.toUpperCase()} — installing again replaces it.
          </span>
        )}
        {problem !== "icao-format" && !status.taken && !replacing && airport.icao.trim() !== "" && (
          <span className="pct-field-meta">Free on this machine.</span>
        )}
      </label>

      {/* No IATA field: the `.wad` has no member the sim reads for it, so the code would never reach
          Aerofly. */}
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Country code</span>
        <input
          className="pct-num"
          value={airport.country}
          placeholder="2 digits (a…z)"
          aria-label="Country code"
          onChange={(e) => store().setAirportIdentity({ country: e.target.value.trim().toLowerCase() })}
        />
        {airport.country.trim() !== "" && problem === "country-format" && (
          <span className="pct-warn">{identityProblemText("country-format")}</span>
        )}
      </label>

      {/* The one act that writes outside the project. It stays in a dialog because that is where the
          things that belong to WRITING live: the destination, the installed list with Uninstall, the
          overwrite confirmation and the result. */}
      <div className="pct-modal-actions">
        <span className="pct-spacer" />
        {/* Same act as the toolbar's, so it wears the toolbar's name. */}
        <button
          type="button"
          className="pct-primary"
          onClick={openInstallDialog}
          title="Export to '…FS 4/scenery/airports' — an airport you can start a flight from"
        >
          Export /airports…
        </button>
      </div>
    </div>
  );
}
