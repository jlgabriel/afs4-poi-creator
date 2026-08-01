// HeliportDialog.tsx — "Create heliport…": turn the open project into a real AFS4 heliport, installed.
//
// The POI export's template files (ExportDialog's "Heliport template") ask the user to move a folder,
// edit three fields and rename two files. That is four chances to get it wrong for one decision that
// matters, so this dialog keeps the decision and does the rest: the user types a code, a name and a
// country, and PCT writes scenery/airports/<country>/<folder>/ itself.
//
// ★ WHAT v1.1 GOT WRONG, and what this rewrite is (forum #170, ApfelFlieger). He built one rooftop
// heliport — SHJK, Arica Regional Hospital — and had to do it FIVE times to get the pad height right,
// because each lap cost him a fresh airport code: SHJH, SHJI, SHJJ, SHJK, SHJL. Two separate faults:
//
//   (1) "The airfield code must be changed every time." PCT refused any code already on disk, including
//       the one PCT itself had just written — so re-installing your own heliport was impossible, and
//       deleting the folder by hand did not release it either. Fixed in main (icaoIndex): a code held by
//       one of OUR heliports is not a collision, it is the edit loop, and this dialog now offers Replace.
//   (2) "Each time the heliport data must be re-entered." The identity lived nowhere but this dialog's
//       useState. It now lives on the DOCUMENT (project.airport), so it survives Save/Open — his own
//       argument for it: the code needs checking once rather than every time, the airport can be saved
//       as often as a POI, and it can be passed on like one.
//
// And the pad is its own point on the map now, not a borrowed XREF (#168) — see HelipadLayer.
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HeliportInstallOptions,
  IcaoStatus,
  InstallResult,
  InstalledHeliport,
  PctError,
} from "../../shared/pctApi";
import type { AirportPad, LonLat, PlacedObject, ProjectAirport } from "../../core/project/types";
import { identityProblemText, validateIdentity, SNAME_MAX } from "../../core/export/heliportTemplate";
import { DEFAULT_PAD_RADIUS_M } from "../../core/export/planExport";
import { firstProjectError } from "../../core/project/schemas";
import { centroid } from "../../core/geo/poiName";
import { directionToHeading } from "../../core/geo/orientation";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { NumberInput } from "../inspector/NumberInput";
import { padLabel } from "./padLabel";

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

/** Where a brand-new pad goes: the middle of what the user has already placed, or — for an empty
 *  project — the middle of the map they are looking at. Never an object's own position, so the
 *  helicopter does not start inside one (forum #168). */
function seedPad(objects: PlacedObject[], mapCenter: LonLat): AirportPad {
  const at = objects.length > 0 ? centroid(objects.map((o) => o.position)) : mapCenter;
  return { position: at, heading: 0, radius: DEFAULT_PAD_RADIUS_M };
}

/** The compass heading a placed object faces, for "take the selected object's heading". Only the kinds
 *  that HAVE a facing contribute one — a plant is a billboard and a point light has no front. */
function headingOf(o: PlacedObject): number {
  if (o.kind === "xref") return directionToHeading(o.direction);
  if (o.kind === "airport_light") return o.orientation; // already a compass heading
  return 0;
}

/** Degrees, to the same 6 places the rest of the inspector shows. */
const fmtDeg = (n: number): string => n.toFixed(6);

export function HeliportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const projectName = useEditor((s) => s.project.name);
  const stored = useEditor((s) => s.project.airport);
  const mapView = useEditor((s) => s.mapView);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  // The identity fields are LOCAL drafts (a half-typed code should not dirty the document on every
  // keystroke) seeded from the document — which is the whole point of storing it. The PAD is the
  // opposite: it lives on the document from the moment the dialog opens, because the map draws it and
  // the user is meant to drag it while this is open.
  const [icao, setIcao] = useState(stored?.icao ?? "");
  const [name, setName] = useState(stored?.name ?? projectName.slice(0, SNAME_MAX));
  const [country, setCountry] = useState(stored?.country ?? "");
  const [baseElev, setBaseElev] = useState("");
  const [status, setStatus] = useState<IcaoStatus>({ taken: false, ours: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [installedKey, setInstalledKey] = useState(0);

  const identity = useMemo(
    () => ({ icao: icao.trim().toLowerCase(), name, country: country.trim().toLowerCase() }),
    [icao, name, country],
  );
  const problem = validateIdentity(identity);

  const pad = stored?.pad ?? null;
  const padObject = useMemo(
    () => (selection.length === 1 ? (objects.find((o) => o.id === selection[0]) ?? null) : null),
    [selection, objects],
  );

  // Write the whole block back, keeping whatever the map may have changed underneath us. Called on every
  // identity edit, so closing the dialog without installing STILL remembers what was typed — which is
  // what "the data must not be re-entered" actually asks for.
  const writeAirport = useCallback(
    (patch: Partial<ProjectAirport>): void => {
      const s = editorStore.getState();
      const current = s.project.airport;
      const next: ProjectAirport = {
        icao: patch.icao ?? current?.icao ?? "",
        name: patch.name ?? current?.name ?? "",
        country: patch.country ?? current?.country ?? "",
        pad: patch.pad ?? current?.pad ?? seedPad(s.project.objects, s.mapView),
      };
      s.setAirport(next);
    },
    [],
  );

  // The pad exists as soon as the dialog is open, so the map has something to draw and drag. Seeded from
  // the scene's centre — NOT from a selected object, which is the collision ApfelFlieger warned about.
  useEffect(() => {
    if (editorStore.getState().project.airport === undefined) {
      writeAirport({ icao: identity.icao, name, country: identity.country });
    }
    // Only on open: later edits go through the field handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live availability, debounced by a well-formed code: asking main about "k" or "kd" answers a question
  // nobody is holding. This is CONVENIENCE — the install re-checks — so a stale answer costs nothing.
  useEffect(() => {
    let cancelled = false;
    if (pct === null || problem === "icao-format") {
      setStatus({ taken: false, ours: [] });
      return;
    }
    void pct.icaoStatus(identity.icao).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [pct, identity.icao, problem, installedKey]);

  const setPad = (next: AirportPad): void => writeAirport({ pad: next });

  const create = async (overwrite: boolean): Promise<void> => {
    if (!pct || problem !== null || pad === null) return;
    setError(null);

    if (!(Number.isFinite(pad.radius) && pad.radius > 0)) {
      setError("Helipad radius must be a positive number of metres.");
      return;
    }
    const baseElevation = baseElev.trim() === "" ? undefined : Number.parseFloat(baseElev);
    if (baseElevation !== undefined && !Number.isFinite(baseElevation)) {
      setError("Base elevation must be a number (metres ASL).");
      return;
    }
    // Commit the identity to the document before writing, so what shipped and what the project says are
    // the same thing even if the install then fails.
    writeAirport({ icao: identity.icao, name: identity.name, country: identity.country });

    // The same save-net the POI export runs: never write a scene the loader would reject.
    const project = editorStore.getState().serialize();
    const bad = firstProjectError(project);
    if (bad !== null) {
      setError(`Can't create the heliport — the project has a value Aerofly would reject (${bad}).`);
      return;
    }

    const opts: HeliportInstallOptions = {
      identity,
      heliport: { pad },
      overwrite,
    };
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
        return create(true);
      }
      setError(`Kept the existing "${res.error.folderName}".`);
      return;
    }
    setError(messageFor(res.error));
  };

  // `ours` is NOT a blocker — it is the "you already built this one" case, and creating again replaces
  // it. Only someone else's airport blocks.
  const replacing = status.ours.length > 0;
  const blocked = problem !== null || status.taken || busy || pct === null || pad === null;

  return (
    <div className="pct-modal" role="dialog" aria-label="Create heliport" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Create heliport</h2>
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
            {/* Measured 2026-07-31, twice: LOCATION's search matches the NAME, never the code, and the
                row it returns renders BLANK for an invented code — the airport is there (its distance is
                right) with no text. The map panel shows it correctly. So: name, not code, and the map as
                the answer to "is it really there". Saying "search for PCT002" made a working install look
                broken. */}
            <p>
              Restart Aerofly FS 4, then open LOCATION and search for{" "}
              <strong>{name.trim()}</strong> — by name; the code does not match. The row may come up blank:
              that is Aerofly, not you, and it shows properly on the map where you built it. Pick a
              helicopter and you start on the pad.
            </p>
            <p className="pct-field-meta">
              The code, the name and the pad are saved in this project — build it again after an
              adjustment and PCT replaces this heliport instead of asking for a new code.
            </p>
            <div className="pct-modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <p className="pct-field-meta">
              Installs this project as an airport you can start a flight from, with every object you placed
              around the pad. It does not replace the POI export — it is a second, separate copy.
            </p>

            <label className="pct-field pct-field-col">
              <span className="pct-field-label">Airport code</span>
              {/* Shown in CAPITALS at ApfelFlieger's request (#170 EDIT 2). Lowercase is what goes to
                  disk — the filenames and the tag values that flew on 2026-07-31 — so the uppercasing is
                  presentation only and `identity` lowercases it straight back. */}
              <input
                className="pct-num"
                value={icao.toUpperCase()}
                placeholder="4-6 letters or digits, e.g. PCT001"
                aria-label="Airport code"
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setIcao(v);
                  writeAirport({ icao: v.trim().toLowerCase() });
                }}
              />
              {icao.trim() !== "" && problem === "icao-format" && (
                <span className="pct-warn">{identityProblemText("icao-format")}</span>
              )}
              {problem !== "icao-format" && status.taken && (
                <span className="pct-warn">
                  {identity.icao.toUpperCase()} is already an airport on this machine. Using it would make
                  that airport disappear — pick another code.
                </span>
              )}
              {/* The case that used to be a refusal. Naming the folder matters: rename the heliport and
                  the folder name changes, so the one that goes is not the one that arrives. */}
              {problem !== "icao-format" && !status.taken && replacing && (
                <span className="pct-field-meta">
                  You already installed {identity.icao.toUpperCase()} —{" "}
                  {status.ours.map((h) => h.folderName).join(", ")}. Creating it again replaces it.
                </span>
              )}
              {problem !== "icao-format" && !status.taken && !replacing && icao.trim() !== "" && (
                <span className="pct-field-meta">Free on this machine.</span>
              )}
              {/* Why this is worth saying: Aerofly takes the text it shows in LOCATION's SEARCH from its
                  own world database, and ignores yours when the code is in it — ApfelFlieger wrote "Hca
                  Florida Mercy Hospital" into both files for FL25 and the sim displays "Mercy". A code
                  that database knows therefore searches properly; an invented one comes up as a blank row
                  (it still works, and the map shows your name). And it is SAFE: the check above counts
                  .wad FILES, i.e. airports that would actually be replaced — FL25 has none. */}
              <span className="pct-field-meta">
                Tip: a real-world code (ourairports.com, metar-taf.com) that Aerofly already knows will
                show up properly in LOCATION&apos;s search, under that database&apos;s own name. An invented
                code works too, but its search row comes up blank.
              </span>
            </label>

            <label className="pct-field pct-field-col">
              <span className="pct-field-label">Name (shown in LOCATION)</span>
              <input
                className="pct-num"
                value={name}
                maxLength={SNAME_MAX}
                placeholder="e.g. Daggett Helipad"
                aria-label="Heliport name"
                onChange={(e) => {
                  setName(e.target.value);
                  writeAirport({ name: e.target.value });
                }}
              />
              <span className="pct-field-meta">
                {name.trim().length}/{SNAME_MAX} — Aerofly drops the whole airport above its limit.
              </span>
            </label>

            <label className="pct-field pct-field-col">
              <span className="pct-field-label">Country code</span>
              <input
                className="pct-num"
                value={country}
                placeholder="two letters, e.g. us"
                aria-label="Country code"
                onChange={(e) => {
                  setCountry(e.target.value);
                  writeAirport({ country: e.target.value.trim().toLowerCase() });
                }}
              />
              {country.trim() !== "" && problem === "country-format" && (
                <span className="pct-warn">{identityProblemText("country-format")}</span>
              )}
            </label>

            {/* The pad. It is on the map right now — white circle with an H — and dragging it there is the
                intended way to aim it; these fields are for the times you know the numbers. */}
            {pad === null ? (
              <div className="pct-field pct-field-col">
                <span className="pct-field-label">Helipad — where the helicopter starts</span>
                <span className="pct-field-meta">
                  No helipad on this project. A heliport needs one — put it in the middle of what you have
                  placed, then drag it on the map.
                </span>
                <button type="button" onClick={() => writeAirport({})}>
                  Place a helipad
                </button>
              </div>
            ) : (
              <div className="pct-field pct-field-col">
                <span className="pct-field-label">Helipad — where the helicopter starts</span>
                <span className="pct-field-meta">
                  Drag the white circle on the map to move it, and its cyan grip to turn it. It is its own
                  point, not one of your objects, so nothing spawns inside a building.
                </span>
                <div className="pct-shift-row">
                  <label className="pct-shift-cell">
                    <span className="pct-field-meta">Longitude</span>
                    <NumberInput
                      value={pad.position.lon}
                      format={fmtDeg}
                      onCommit={(lon) => setPad({ ...pad, position: { ...pad.position, lon } })}
                      ariaLabel="Helipad longitude"
                    />
                  </label>
                  <label className="pct-shift-cell">
                    <span className="pct-field-meta">Latitude</span>
                    <NumberInput
                      value={pad.position.lat}
                      format={fmtDeg}
                      onCommit={(lat) => setPad({ ...pad, position: { ...pad.position, lat } })}
                      ariaLabel="Helipad latitude"
                    />
                  </label>
                </div>
                <div className="pct-shift-row">
                  <label className="pct-shift-cell">
                    <span className="pct-field-meta">Heading — TRUE degrees</span>
                    <NumberInput
                      value={pad.heading}
                      onCommit={(heading) => setPad({ ...pad, heading })}
                      ariaLabel="Helipad heading, true degrees"
                    />
                  </label>
                  <label className="pct-shift-cell">
                    <span className="pct-field-meta">Radius — metres</span>
                    <NumberInput
                      value={pad.radius}
                      onCommit={(radius) =>
                        Number.isFinite(radius) && radius > 0 ? setPad({ ...pad, radius }) : undefined
                      }
                      ariaLabel="Helipad radius, metres"
                    />
                  </label>
                </div>
                {/* Measured in-sim 2026-07-31: we wrote heading 40 and the sim's menu showed 028 — 40
                    minus the local magnetic variation. So the field is TRUE and the panel is magnetic. */}
                <span className="pct-field-meta">
                  Aerofly&apos;s menu shows this heading as MAGNETIC, so expect it to read a few degrees
                  off. Radius {pad.radius} m shows there as a size of {Math.round(pad.radius * 2)} m.
                </span>
                <div className="pct-modal-actions">
                  {padObject !== null && (
                    <button
                      type="button"
                      onClick={() =>
                        setPad({ ...pad, position: padObject.position, heading: headingOf(padObject) })
                      }
                    >
                      Move the pad onto {padLabel(padObject)}
                    </button>
                  )}
                  <span className="pct-spacer" />
                  {/* The way out. Opening this dialog puts a pad on the map so there is something to
                      drag; without this, a look around would leave a white circle you could not get
                      rid of. It clears the stored code and name too — the whole airport block. */}
                  <button
                    type="button"
                    onClick={() => {
                      editorStore.getState().setAirport(null);
                      setIcao("");
                      setName("");
                      setCountry("");
                    }}
                  >
                    Remove helipad
                  </button>
                </div>
              </div>
            )}

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

            {error !== null && <p className="pct-warn">{error}</p>}
            {objects.length === 0 && (
              <p className="pct-empty">No objects placed — the heliport would be a bare pad.</p>
            )}

            <InstalledHeliports refreshKey={installedKey} />

            <div className="pct-modal-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <span className="pct-spacer" />
              <button className="pct-primary" onClick={() => void create(false)} disabled={blocked}>
                {busy ? "Creating…" : replacing ? "Replace heliport" : "Create heliport"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
