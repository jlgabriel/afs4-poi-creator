// HeliportDialog.tsx — "Create heliport…": turn the open project into a real AFS4 heliport, installed.
//
// The POI export's template files (ExportDialog's "Heliport template") ask the user to move a folder,
// edit three fields and rename two files. That is four chances to get it wrong for one decision that
// matters, so this dialog keeps the decision and does the rest: the user types a code, a name and a
// country, and PCT writes scenery/airports/<country>/<folder>/ itself.
//
// The code is the only field with teeth — a duplicate silently REPLACES the airport that had it — so it
// gets live feedback here AND a hard refusal in main, re-checked against a fresh scan at the moment of
// the write. PCT still never invents one: it only stops you choosing a bad one, which is more than the
// by-hand route can do.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HeliportInstallOptions, InstallResult, InstalledHeliport, PctError } from "../../shared/pctApi";
import { identityProblemText, validateIdentity, SNAME_MAX } from "../../core/export/heliportTemplate";
import { firstProjectError } from "../../core/project/schemas";
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

export function HeliportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const selection = useEditor((s) => s.selection);
  const projectName = useEditor((s) => s.project.name);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  const [icao, setIcao] = useState("");
  const [name, setName] = useState(projectName.slice(0, SNAME_MAX));
  const [country, setCountry] = useState("");
  const [padRadius, setPadRadius] = useState(10);
  const [baseElev, setBaseElev] = useState("");
  const [taken, setTaken] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [installedKey, setInstalledKey] = useState(0);

  const identity = useMemo(
    () => ({ icao: icao.trim().toLowerCase(), name, country: country.trim().toLowerCase() }),
    [icao, name, country],
  );
  const problem = validateIdentity(identity);
  const padObject = useMemo(
    () => (selection.length === 1 ? (objects.find((o) => o.id === selection[0]) ?? null) : null),
    [selection, objects],
  );

  // Live availability, debounced by a well-formed code: asking main about "k" or "kd" answers a question
  // nobody is holding. This is CONVENIENCE — the install re-checks — so a stale `false` costs nothing.
  useEffect(() => {
    let cancelled = false;
    if (pct === null || problem === "icao-format") {
      setTaken(false);
      return;
    }
    void pct.isIcaoTaken(identity.icao).then((t) => {
      if (!cancelled) setTaken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [pct, identity.icao, problem]);

  const create = async (overwrite: boolean): Promise<void> => {
    if (!pct || problem !== null) return;
    setError(null);

    if (!(Number.isFinite(padRadius) && padRadius > 0)) {
      setError("Helipad radius must be a positive number of metres.");
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
      setError(`Can't create the heliport — the project has a value Aerofly would reject (${bad}).`);
      return;
    }

    const opts: HeliportInstallOptions = {
      identity,
      heliport: { objectId: padObject?.id ?? null, radiusM: padRadius },
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

  const blocked = problem !== null || taken || busy || pct === null;

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
            {/* Deliberately does NOT say "search for the code": measured 2026-07-31 — the heliport loads
                and flies, but typing its code into LOCATION's search box returns nothing. Sending someone
                to the one place it does not appear is how a working install reads as a broken one. */}
            <p>
              Restart Aerofly FS 4, then open LOCATION and find{" "}
              <strong>{name.trim()}</strong> on the map, where you built it. Aerofly&apos;s
              search box may not list a new airport by its code. Pick a helicopter and you start on the pad.
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
              <input
                className="pct-num"
                value={icao}
                placeholder="4-6 letters or digits, e.g. pct001"
                aria-label="Airport code"
                onChange={(e) => setIcao(e.target.value)}
              />
              {icao.trim() !== "" && problem === "icao-format" && (
                <span className="pct-warn">{identityProblemText("icao-format")}</span>
              )}
              {problem !== "icao-format" && taken && (
                <span className="pct-warn">
                  {identity.icao.toUpperCase()} is already an airport on this machine. Using it would make
                  that airport disappear — pick another code.
                </span>
              )}
              {problem !== "icao-format" && !taken && icao.trim() !== "" && (
                <span className="pct-field-meta">Free on this machine.</span>
              )}
            </label>

            <label className="pct-field pct-field-col">
              <span className="pct-field-label">Name (shown in LOCATION)</span>
              <input
                className="pct-num"
                value={name}
                maxLength={SNAME_MAX}
                placeholder="e.g. Daggett Helipad"
                aria-label="Heliport name"
                onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setCountry(e.target.value)}
              />
              {country.trim() !== "" && problem === "country-format" && (
                <span className="pct-warn">{identityProblemText("country-format")}</span>
              )}
            </label>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Helipad</span>
              <span className="pct-field-meta">
                {padObject !== null
                  ? `On the selected object (${padLabel(padObject)}) — its position and heading.`
                  : "At the POI anchor, facing true north. Select ONE object to put it there instead."}
              </span>
              <label className="pct-shift-cell">
                <span className="pct-field-meta">Pad radius — metres</span>
                <NumberInput value={padRadius} onCommit={setPadRadius} ariaLabel="Helipad radius, metres" />
              </label>
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
                {busy ? "Creating…" : "Create heliport"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
