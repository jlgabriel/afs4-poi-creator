// AirportDataFields.tsx — the Inspector's panel for the airport ITSELF: what it is called and what code
// it gets. ApfelFlieger's submenu (1) DATA (forum #217, renumbered in #227/#232), and the sixth card of
// the six his Airport section is made of.
//
// WHY IT EXISTS, and why it is not just tidiness. Through v1.3 these four fields lived inside the PAD's
// panel, and the comment there said the quiet part out loud: "a project has exactly one airport, so the
// pad IS the airport as far as anyone using this can tell". That stopped being true twice over.
//
//  1. The pad is repeatable now (forum #221). Identity inside the pad's panel would be one code shown N
//     times, which reads as N codes — and editing it in one pad would silently change the others.
//  2. It was ALREADY wrong before that, and reachably so: placing a stand creates the airport block
//     (mutate.ts), so a project whose only airport part was a parking position had an airport with no
//     identity and NO WAY TO TYPE ONE — the pad's panel was the only door to these fields, and there was
//     no pad. The install dialog's own message sent you to "select the helipad", which did not exist.
//     A dead end, reachable in two clicks from a blank project.
//
// So the identity belongs to the airport, and this is the airport's panel. The pad's panel keeps the pad.
//
// ★ ONE FIELD, THREE PLACES ON DISK. "Airport name" feeds `sname` and `lname` in the .tsc and `name` in
// the .wad — his simplification, from the field table in #15/#217. PCT never showed the user three boxes
// for it and does not start now.
import { useEffect, useState } from "react";
import type { ProjectAirport } from "../../core/project/types";
import type { IcaoStatus } from "../../shared/pctApi";
import { clampLonLat } from "../../core/project/schemas";
import { identityProblemText, validateIdentity, SNAME_MAX } from "../../core/export/heliportTemplate";
import { editorStore, useEditor } from "../state/editorStore";
import { NumberInput } from "./NumberInput";
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

  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {airport.name.trim() === "" ? "Airport" : airport.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Airport — what this becomes in Aerofly</span>
        <span className="pct-field-meta">
          Needed before you can install it; not needed to place or move anything on the map.
        </span>
      </div>

      {/* ★ LON/LAT SITS HERE, DIRECTLY UNDER THE DESCRIPTION, because that is exactly where it sits in the
          helipad's panel, the stand's and the aerotow's. Forum #253d: "It bothers me when the LAYOUT of the
          data constantly changes during a quick change between individual elements, when they are actually
          always comparable fields. The best example of this is for me LON LAT, because they could actually
          always be in the same place regardless of the element." The other panels already agreed with each
          other — this one was the outlier, and it had no coordinates on it at all. */}
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
          {/* Said once, here, because it is the rule that changed in 1.5 and the one thing about this
              field a 1.4 user would get wrong. */}
          <span className="pct-field-meta">
            Drag the ⊕ on the map, or type here. It stays where you put it — moving a helipad or a runway
            does not move the airport.
          </span>
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
        <span className="pct-field-label">Name — shown in LOCATION</span>
        <input
          className="pct-text"
          value={airport.name}
          maxLength={SNAME_MAX}
          placeholder="e.g. Daggett Helipad"
          aria-label="Airport name"
          onChange={(e) => store().setAirportIdentity({ name: e.target.value })}
        />
        <span className="pct-field-meta">
          {airport.name.trim().length}/{SNAME_MAX} — Aerofly drops the whole airport above its limit.
        </span>
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">ICAO code</span>
        {/* Shown in CAPITALS (forum #170 EDIT 2) and, since v1.2.1, written that way into the .tsc and
            the .wad too — the file NAMES stay lowercase, which is what Aerofly does with its own. */}
        <input
          className="pct-num"
          value={airport.icao.toUpperCase()}
          placeholder="4-6 letters or digits, e.g. PCT001"
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

      {/* IATA has been in the model and in the .wad writer since the DATA model landed, with nothing on
          screen able to set it. It is optional and PCT asserts nothing about what Aerofly does with it —
          the field is written as typed, in capitals, because that is how every other code here is. */}
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">IATA code — optional</span>
        <input
          className="pct-num"
          value={(airport.iata ?? "").toUpperCase()}
          placeholder="e.g. SCL"
          aria-label="IATA code"
          onChange={(e) => store().setAirportIata(e.target.value.trim())}
        />
      </label>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Country code</span>
        <input
          className="pct-num"
          value={airport.country}
          placeholder="two letters, e.g. us"
          aria-label="Country code"
          onChange={(e) => store().setAirportIdentity({ country: e.target.value.trim().toLowerCase() })}
        />
        {airport.country.trim() !== "" && problem === "country-format" && (
          <span className="pct-warn">{identityProblemText("country-format")}</span>
        )}
        <span className="pct-field-meta">
          It picks the folder your airport is installed into, the way Aerofly files its own.
        </span>
      </label>

      {/* The read-only "Position" block that stood here through v1.4 is gone. It existed because the
          model had a point the UI could neither set nor draw, so all it could honestly do was report
          which fallback the writers would take. Both halves of that are now real: the field above sets
          it and the map draws it. */}

      {/* The one act that writes outside the project. It stays in a dialog because that is where the
          things that belong to WRITING live: the destination, the installed list with Uninstall, the
          overwrite confirmation and the result. */}
      <div className="pct-modal-actions">
        <span className="pct-spacer" />
        <button type="button" className="pct-primary" onClick={openInstallDialog}>
          Install into AFS4…
        </button>
      </div>
      {problem !== null && (
        <span className="pct-field-meta">
          {problem === "name-empty" ? "Add a name before installing." : identityProblemText(problem)}
        </span>
      )}
    </div>
  );
}
