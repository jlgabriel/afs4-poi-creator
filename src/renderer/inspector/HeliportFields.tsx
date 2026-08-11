// HeliportFields.tsx — the Inspector's panel for the helipad: where the helicopter starts, and which
// airport it belongs to.
//
// WHY IT EXISTS (forum #173, ApfelFlieger). Through v1.2 the whole heliport lived in a modal: you opened
// "Create HELIPORT…" to place the pad, to type the code, to move it, to install it. He asked for the pad
// to be created from the left column and "then listed on the right for editing", because that is how
// every other thing in PCT works — and he is right that a full-screen overlay is a bad place to edit
// something you have to see on the map to judge. The dialog covers the map; this panel does not.
//
// So the whole heliport is HERE now: the pad's geometry and the airport's identity. The dialog keeps
// exactly one job, the one that writes to disk.
//
// The identity is not really a property of the PAD — it belongs to the airport the pad sits in. But a
// project has exactly one airport, so the pad IS the airport as far as anyone using this can tell, and
// splitting the two across two panels would be a distinction drawn for the code's benefit.
import { useEffect, useState } from "react";
import type { ProjectAirport } from "../../core/project/types";
import type { IcaoStatus } from "../../shared/pctApi";
import { clampLonLat } from "../../core/project/schemas";
import { firstPad } from "../../core/project/airport";
import { identityProblemText, validateIdentity, SNAME_MAX } from "../../core/export/heliportTemplate";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { NumberInput } from "./NumberInput";

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

const fmtDeg = (n: number): string => n.toFixed(6);

export function HeliportFields({ airport }: { airport: ProjectAirport }): React.ReactElement | null {
  const store = editorStore.getState;
  // This panel edits ONE pad, and every route into it goes through placing one, so a pad-less airport
  // cannot be reached from this UI — the model allows it (airport.ts) but nothing here creates it. Render
  // nothing rather than invent a pad; the repeatable HELICOPTER menu (forum #219/#221) is what turns this
  // into a list and gives a pad-less airport its own empty state.
  const pad = firstPad(airport);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  const identity = {
    icao: airport.icao.trim().toLowerCase(),
    name: airport.name,
    country: airport.country.trim().toLowerCase(),
  };
  const problem = validateIdentity(identity);
  const status = useIcaoStatus(identity.icao, problem !== "icao-format");
  const replacing = status.ours.length > 0;

  // AFTER every hook, never before one: an early return above `useIcaoStatus` would call a different
  // number of hooks on different renders, which is the one thing React does not allow.
  if (pad === undefined) return null;

  return (
    // .pct-inspector-body is what every other kind's panel opens with, and it is not decoration: the
    // padding lives there, not on .pct-inspector. Returning a bare fragment put the fields flush against
    // both edges of the panel while the object panels sat inset — spotted on screen, not by a test.
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {airport.name.trim() === "" ? "Start - Helicopter" : airport.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Helipad — where the helicopter starts</span>
        <span className="pct-field-meta">
          Drag the white circle on the map to move it, and its cyan grip to turn it. It is its own point,
          not one of your objects, so nothing spawns inside a building.
        </span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={pad.position.lon}
            format={fmtDeg}
            onCommit={(lon) => store().moveAirportPad(clampLonLat({ lon, lat: pad.position.lat }))}
            ariaLabel="Helipad longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={pad.position.lat}
            format={fmtDeg}
            onCommit={(lat) => store().moveAirportPad(clampLonLat({ lon: pad.position.lon, lat }))}
            ariaLabel="Helipad latitude"
          />
        </label>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Heading — true</span>
          <NumberInput
            value={pad.heading}
            onCommit={(heading) => store().rotateAirportPad(heading)}
            ariaLabel="Helipad heading, true degrees"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Radius — m</span>
          <NumberInput
            value={pad.radius}
            onCommit={(radius) => store().setAirportPadRadius(radius)}
            ariaLabel="Helipad radius, metres"
          />
        </label>
      </div>
      {/* Measured in-sim 2026-07-31: we wrote heading 40 and the sim's menu showed 028 — 40 minus the
          local magnetic variation. So the field is TRUE and the sim's panel is magnetic. */}
      <span className="pct-field-meta">
        Aerofly shows this heading as MAGNETIC, so expect it to read a few degrees off. Radius{" "}
        {pad.radius} m shows there as a size of {Math.round(pad.radius * 2)} m.
      </span>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Airport</span>
        <span className="pct-field-meta">
          What this becomes in Aerofly. Needed before you can install it; not needed to move the pad
          around.
        </span>
      </div>

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Code</span>
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

      <label className="pct-field pct-field-col">
        <span className="pct-field-label">Name — shown in LOCATION</span>
        <input
          className="pct-text"
          value={airport.name}
          maxLength={SNAME_MAX}
          placeholder="e.g. Daggett Helipad"
          aria-label="Heliport name"
          onChange={(e) => store().setAirportIdentity({ name: e.target.value })}
        />
        <span className="pct-field-meta">
          {airport.name.trim().length}/{SNAME_MAX} — Aerofly drops the whole airport above its limit.
        </span>
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
      </label>

      {heightMode === "autoheight" && (
        <span className="pct-field-meta">
          This project is on sim autoheight, so the pad follows the terrain and there is no base
          elevation to set.
        </span>
      )}

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
          {problem === "name-empty"
            ? "Add a name before installing."
            : identityProblemText(problem)}
        </span>
      )}
    </div>
  );
}
