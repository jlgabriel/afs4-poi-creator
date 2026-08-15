// HeliportDialog.tsx — "Install into AFS4": write the open project into scenery/airports/ as a real
// heliport you can start a flight from.
//
// ★ WHAT v1.3 TOOK OUT OF HERE, and why (forum #173, ApfelFlieger). Through v1.2 this dialog was the
// whole feature: it placed the pad, held the code, the name and the country, moved the pad by numbers,
// and installed. He asked for the opposite shape — place the pad from the left column like any other
// object, edit it on the right in the Inspector — and the argument that settles it is not taste:
//
//   • The pad is a thing you judge by looking at the map. This is a full-screen overlay. Through v1.2
//     the dialog TOLD you to drag a pad it was sitting on top of.
//   • He tests twice, and the first pass is deliberately without reading anything we wrote ("intuitive
//     - without reading what Claude wrote"). A control you can only find by reading fails that pass.
//
// So placing lives in the catalog (AirportSection), editing lives in the Inspector (HelipadFields for a
// pad, AirportDataFields for the airport's name and code), and what is left here is the one act that
// writes outside the project — plus the things that belong to writing and to nothing else: the
// destination, the overwrite confirmation, the result, and the list of what PCT has already installed
// with its Uninstall.
import { useCallback, useEffect, useState } from "react";
import type { HeliportInstallOptions, InstallResult, InstalledHeliport, PctError } from "../../shared/pctApi";
import { identityProblemText, validateIdentity } from "../../core/export/heliportTemplate";
import { firstProjectError } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";

/** The heliports PCT has installed, with Uninstall. Every row is PCT's own — main only lists folders
 *  carrying our marker — so unlike the POI list there is no "not by PCT" state to show. */
function InstalledHeliports({ refreshKey }: { refreshKey: number }): React.ReactElement | null {
  const pct = getPct();
  const [rows, setRows] = useState<InstalledHeliport[] | null>(null);

  const refresh = useCallback(() => {
    if (!pct) {
      setRows([]);
      return;
    }
    void pct.listInstalledHeliports().then(setRows);
  }, [pct]);
  useEffect(refresh, [refresh, refreshKey]);

  const remove = async (h: InstalledHeliport): Promise<void> => {
    if (!pct) return;
    if (!window.confirm(`Remove the heliport ${h.icao.toUpperCase()}? This deletes its airport folder.`)) {
      return;
    }
    const res = await pct.uninstallHeliport(h.country, h.folderName);
    if (res.ok) refresh();
    else window.alert(res.error.message);
  };

  if (rows === null || rows.length === 0) return null;

  return (
    <div className="pct-installed">
      <div className="pct-field-label">Heliports installed by PCT</div>
      <ul className="pct-installed-list">
        {rows.map((h) => (
          <li key={`${h.country}/${h.folderName}`} className="pct-installed-row">
            <code className="pct-path">
              {h.icao.toUpperCase()} — {h.folderName}
            </code>
            <button type="button" onClick={() => void remove(h)}>
              Uninstall
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function messageFor(error: PctError): string {
  return error.code === "folder-exists"
    ? `A heliport folder "${error.folderName}" already exists.`
    : error.message;
}

export function HeliportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const airport = useEditor((s) => s.project.airport);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  const [baseElev, setBaseElev] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [installedKey, setInstalledKey] = useState(0);
  const [replacing, setReplacing] = useState(false);

  const identity =
    airport === undefined
      ? null
      : {
          icao: airport.icao.trim().toLowerCase(),
          name: airport.name,
          country: airport.country.trim().toLowerCase(),
        };
  const problem = identity === null ? null : validateIdentity(identity);

  // Whether the code is one of OURS decides the button's word. Asked once, when the dialog opens, rather
  // than on every keystroke like v1.2 did — nothing is typed in here any more.
  useEffect(() => {
    let cancelled = false;
    if (pct === null || identity === null || problem === "icao-format") return;
    void pct.icaoStatus(identity.icao).then((s) => {
      if (!cancelled) setReplacing(s.ours.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [pct, identity?.icao, problem, installedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send the user to put the AIRPORT down: arm the placement and get out of the way, because the map is
   *  behind this. The whole point of v1.3 is that this is the same gesture as placing anything else.
   *
   *  It armed a HELIPAD until v1.5, back when a heliport needed one to exist. Since #255 the thing an
   *  install cannot do without is the airport's own point, so that is what this offers to go and set. */
  const goPlace = (): void => {
    editorStore.getState().createAirport();
    editorStore.getState().armPlacement({ kind: "airport" });
    onClose();
  };

  const install = async (overwrite: boolean): Promise<void> => {
    if (!pct || airport === undefined || identity === null || problem !== null) return;
    setError(null);

    // ★ NO LONGER "you need a helipad" (v1.5, forum #255). He asked for the opposite: "When all data
    // entries for an airport are made, it must already be able to be installed alone - even if no other
    // element for this airport has yet been entered", because installing the bare airfield is how you
    // find out whether FS 4 already knows it and where it thinks it is.
    //
    // What IS required is a point. An airport with no coordinates would be written at the POI anchor, and
    // for a project with no objects either that anchor is 0/0 — an airfield in the Gulf of Guinea, filed
    // under the user's own country code. Refusing is the only honest answer, and it is one click to fix.
    if (airport.position === undefined) {
      setError("This airport has no point on the map yet. Set it in the Airport panel, then install.");
      return;
    }
    // ⛔ THE FLOOR IS AEROFLY'S, and it was measured rather than assumed (gate 2026-08-14). #255 asked for
    // an airport that installs with nothing else entered; PCT wrote exactly that and the simulator threw
    // it out: "no valid runway or helipad defined. invalid airport 'PCT No Pad'", with the airport count
    // unmoved. Its own words name the two that count — a parking position or a glider start does not.
    if (airport.pads.length === 0 && (airport.runways ?? []).length === 0) {
      setError(
        "Aerofly needs at least one helipad or one runway — it rejects an airport with neither. Place one from the catalog, then install.",
      );
      return;
    }
    // Every pad, not just the first: a bad radius anywhere writes a helipad the sim will not render, and
    // the count is small enough that checking all of them costs nothing.
    if (airport.pads.some((p) => !(Number.isFinite(p.radius) && p.radius > 0))) {
      setError("Helipad radius must be a positive number of metres. Fix it in the Inspector.");
      return;
    }
    const baseElevation = baseElev.trim() === "" ? undefined : Number.parseFloat(baseElev);
    if (baseElevation !== undefined && !Number.isFinite(baseElevation)) {
      setError("Base elevation must be a number (metres ASL).");
      return;
    }

    // The same save-net the POI export runs: never write a scene the loader would reject.
    const project = editorStore.getState().serialize();
    const bad = firstProjectError(project);
    if (bad !== null) {
      setError(`Can't install — the project has a value Aerofly would reject (${bad}).`);
      return;
    }

    const opts: HeliportInstallOptions = {
      identity,
      heliport: { pads: airport.pads },
      overwrite,
    };
    // Absent rather than `[]` when there are none: the writers key "emit no block at all" off an empty
    // list either way, and this keeps the IPC payload of a stand-less project identical to before.
    if (airport.runways !== undefined) opts.heliport.runways = airport.runways;
    if (airport.aerotows !== undefined) opts.heliport.aerotows = airport.aerotows;
    if (airport.winches !== undefined) opts.heliport.winches = airport.winches;
    if (airport.parkings !== undefined) opts.heliport.parkings = airport.parkings;
    if (airport.position !== undefined) opts.heliport.position = airport.position;
    if (airport.iata !== undefined) opts.heliport.iata = airport.iata;
    if (heightMode !== "autoheight" && baseElevation !== undefined) opts.baseElevation = baseElevation;

    setBusy(true);
    const res = await pct.installHeliport(project, opts);
    setBusy(false);

    if (res.ok) {
      setResult(res.value);
      setInstalledKey((k) => k + 1);
      return;
    }
    if (res.error.code === "folder-exists" && !overwrite) {
      if (window.confirm(`A heliport folder "${res.error.folderName}" already exists.\n\nReplace it?`)) {
        return install(true);
      }
      setError(`Kept the existing "${res.error.folderName}".`);
      return;
    }
    setError(messageFor(res.error));
  };

  /** What the summary below says about the pads. A pad-less airport is legal in the model (airport.ts)
   *  and the install refuses it above, so the summary says so rather than crashing on an absent pad. */
  const pads = airport?.pads ?? [];
  const blocked = airport === undefined || problem !== null || busy || pct === null;

  return (
    <div className="pct-modal" role="dialog" aria-label="Install heliport" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Install heliport</h2>
          <button className="pct-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        {result !== null ? (
          <div className="pct-export-done">
            <p className="pct-ok">Heliport installed to:</p>
            <code className="pct-path">{result.path}</code>
            {result.warnings.length > 0 && (
              <ul className="pct-warnings">
                {result.warnings.map((w) => (
                  <li key={w} className="pct-warn">
                    {w}
                  </li>
                ))}
              </ul>
            )}
            {/* Measured 2026-07-31, twice, and re-measured on 2026-08-02 with the code in capitals: the
                LOCATION search matches the NAME, never the code, and the row it returns renders BLANK for
                an invented code — the airport is there (its distance is right) with no text. The map
                panel shows it correctly, under our own name and code. So: search by name, and the map is
                the answer to "is it really there". Saying "search for PCT002" made a working install look
                broken. The capitals did not change this; that text comes from Aerofly's own database. */}
            <p>
              Restart Aerofly FS 4, then open LOCATION and search for{" "}
              <strong>{airport?.name.trim()}</strong> — by name; the code does not match. The row may come
              up blank: that is Aerofly, not you, and it shows properly on the map where you built it.
              Pick a helicopter and you start on the pad.
            </p>
            <div className="pct-modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <p className="pct-field-meta">
              Installs this project as an airport you can start a flight from, with every object you
              placed around the pad. It does not replace the POI export — it is a second, separate copy.
            </p>

            {airport === undefined || airport.position === undefined ? (
              // Nothing that can be installed yet. Rather than offering to fix it here — which is the
              // modal-shaped habit v1.3 is undoing — point at the gesture that fixes it and step aside.
              //
              // ★ THE MISSING THING IS THE POINT, NOT A HELIPAD (v1.5, #255). An airport with no helipad
              // installs perfectly well now, and he wants it to: it is how you learn what FS 4 already
              // has. An airport with no coordinates is the one that cannot be written.
              <div className="pct-field pct-field-col">
                <p className="pct-empty">
                  This airport is not on the map yet. Every other field can wait; this one cannot, because
                  it is where Aerofly will put the airfield.
                </p>
                <span className="pct-field-meta">
                  Place any element and the airport takes its point from it, or set it yourself — click
                  the map, or type LON and LAT in the <strong>Airport</strong> panel. It stays where you
                  put it.
                </span>
                <button type="button" className="pct-primary" onClick={goPlace}>
                  Put the airport on the map
                </button>
              </div>
            ) : (
              <>
                {/* What is about to be written, read-only. The dialog used to own these fields; now it
                    reports them, so there is exactly one place they can be changed. */}
                <div className="pct-field pct-field-col">
                  <span className="pct-field-label">About to install</span>
                  <ul className="pct-summary">
                    <li>
                      <span className="pct-field-meta">Code</span>
                      <code className="pct-path">{airport.icao.toUpperCase() || "—"}</code>
                    </li>
                    <li>
                      <span className="pct-field-meta">Name</span>
                      <span>{airport.name.trim() || "—"}</span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Country</span>
                      <span>{airport.country.trim() || "—"}</span>
                    </li>
                    <li>
                      <span className="pct-field-meta">{pads.length === 1 ? "Helipad" : "Helipads"}</span>
                      <span>
                        {pads.length === 0
                          ? "—"
                          : pads.length === 1 && pads[0] !== undefined
                            ? `${pads[0].position.lon.toFixed(6)}, ${pads[0].position.lat.toFixed(6)} · ${Math.round(pads[0].heading)}° · ${pads[0].radius} m`
                            : `${pads.length}, all of them installed`}
                      </span>
                    </li>
                  </ul>
                  {problem !== null && (
                    <span className="pct-warn">
                      {/* "Select the helipad" was the old address of these fields and could be a dead
                          end: a project whose only airport part was a stand had no helipad to select.
                          They live in the Airport row now, which is in the list whenever the airport is. */}
                      {identityProblemText(problem)} Select <strong>Airport</strong> in the list on the
                      right and fix it in the Inspector.
                    </span>
                  )}
                </div>

                {heightMode !== "autoheight" && (
                  <label className="pct-field pct-field-col">
                    <span className="pct-field-label">Base elevation — m ASL (optional)</span>
                    <input
                      className="pct-num"
                      value={baseElev}
                      placeholder="blank = use the elevation service"
                      aria-label="Base elevation"
                      onChange={(e) => setBaseElev(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}

            {error !== null && <p className="pct-warn">{error}</p>}
            {objects.length === 0 && airport !== undefined && (
              <p className="pct-empty">No objects placed — the heliport would be a bare pad.</p>
            )}

            <InstalledHeliports refreshKey={installedKey} />

            <div className="pct-modal-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <span className="pct-spacer" />
              {airport !== undefined && (
                <button className="pct-primary" onClick={() => void install(false)} disabled={blocked}>
                  {busy ? "Installing…" : replacing ? "Replace in AFS4" : "Install into AFS4"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
