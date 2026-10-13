// TapDialog.tsx — "Export TAP": write the project's airport as `<ICAO>.tap`, the authoring file a TAP
// converter turns into an airport folder.
//
// Unlike its two siblings this installs NOTHING: one text file lands in a folder the user picked (usually
// the converter's input folder), and the converter does the rest outside PCT. So the dialog shows that
// folder — with Change… right there, since a first export cannot happen without one — the file name, and
// what goes in. An existing `.tap` of the same name is replaced only after a confirmation: a user may have
// edited it by hand since the last export.
import { useEffect, useState } from "react";
import type { TapExportOptions, TapExportResult } from "../../shared/pctApi";
import { identityProblemText, validateIdentity } from "../../core/export/heliportTemplate";
import { airportIdentity } from "../../core/export/planExport";
import { tapAddendumFileName, tapFileName } from "../../core/export/tapWriter";
import { firstProjectError } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";


export function TapDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const airport = useEditor((s) => s.project.airport);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  const [tapDir, setTapDir] = useState<string | null>(null);
  const [baseElev, setBaseElev] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TapExportResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (pct === null) return;
    void pct.getSettings().then((s) => {
      if (!cancelled) setTapDir(s.tapDir);
    });
    return () => {
      cancelled = true;
    };
  }, [pct]);

  /** Pick the folder and keep it in Settings — the same value Settings shows, so the two never disagree. */
  const chooseFolder = async (): Promise<void> => {
    if (!pct) return;
    const dir = await pct.chooseDirectory("tap-dir");
    if (dir === null) return;
    const saved = await pct.setSettings({ tapDir: dir });
    setTapDir(saved.tapDir);
    setError(null);
  };

  const identity = airport === undefined ? null : airportIdentity(airport);
  const problem = identity === null ? null : validateIdentity(identity);
  const lightCount = objects.filter((o) => o.kind === "light" || o.kind === "airport_light").length;
  // The manual base elevation stands in for the elevation service: for the lights (Baked ASL only) and for
  // an airport whose elevation is left on Terrain.
  const lightsNeedTerrain = heightMode !== "autoheight" && lightCount > 0;
  const airportNeedsTerrain = airport !== undefined && airport.elevation === undefined;

  const write = async (overwrite: boolean): Promise<void> => {
    if (!pct || airport === undefined || problem !== null) return;
    setError(null);
    if (airport.position === undefined) {
      setError("This airport has no point on the map yet. Set it in the Airport panel, then export.");
      return;
    }
    if (tapDir === null) {
      setError("Choose the folder the TAP file goes into first.");
      return;
    }
    const baseElevation = baseElev.trim() === "" ? undefined : Number.parseFloat(baseElev);
    if (baseElevation !== undefined && !Number.isFinite(baseElevation)) {
      setError("Base elevation must be a number (metres ASL).");
      return;
    }
    const project = editorStore.getState().serialize();
    const bad = firstProjectError(project);
    if (bad !== null) {
      setError(`Can't export — the project has a value Aerofly would reject (${bad}).`);
      return;
    }

    const opts: TapExportOptions = { overwrite };
    if (baseElevation !== undefined) opts.baseElevation = baseElevation;
    setBusy(true);
    const res = await pct.exportTap(project, opts);
    setBusy(false);
    if (res.ok) {
      setResult(res.value);
      return;
    }
    if (res.error.code === "file-exists" && !overwrite) {
      // The message from main names every file the replace touches (the addendum too).
      if (window.confirm(`${res.error.message}\n\nReplace?`)) {
        return write(true);
      }
      setError(`Kept the existing "${res.error.fileName}".`);
      return;
    }
    setError(res.error.message);
  };

  const runways = airport?.runways ?? [];
  const pads = airport?.pads ?? [];
  const parkings = airport?.parkings ?? [];
  const gliderCount = (airport?.aerotows ?? []).length + (airport?.winches ?? []).length;
  const boundaryPoints = airport?.boundary?.length ?? 0;
  const tarmacCount = airport?.tarmacs?.length ?? 0;
  const lineCount = airport?.lines?.length ?? 0;
  const groundTextCount = airport?.groundtexts?.length ?? 0;
  const taxisignCount = airport?.taxisigns?.length ?? 0;
  const jetwayCount = airport?.jetways?.length ?? 0;
  const carlotCount = airport?.carlots?.length ?? 0;
  const blocked =
    airport === undefined || airport.position === undefined || problem !== null || tapDir === null || busy || pct === null;

  return (
    <div className="pct-modal" role="dialog" aria-label="Export TAP" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Export TAP</h2>
          <button className="pct-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        {result !== null ? (
          <div className="pct-export-done">
            <p className="pct-ok">Written:</p>
            <code className="pct-path">{result.path}</code>
            {result.addendumPath !== undefined && <code className="pct-path">{result.addendumPath}</code>}
            {result.warnings.length > 0 && (
              <ul className="pct-warnings">
                {result.warnings.map((w) => (
                  <li key={w} className="pct-warn">
                    {w}
                  </li>
                ))}
              </ul>
            )}
            <p>Run the TAP converter on this file to build the airport folder.</p>
            <div className="pct-modal-actions">
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <p className="pct-field-meta">
              Writes this project's airport as a <code>.tap</code> file for the TAP converter — the airport
              data and every object you placed — and its glider starts, if any, in a second file beside it
              (<code>_addendum.tap</code>). Nothing is installed in Aerofly.
            </p>

            {airport === undefined ? (
              <p className="pct-empty">
                This project has no airport. Place a runway or a helipad from the catalog first.
              </p>
            ) : (
              <>
                <div className="pct-field pct-field-col">
                  <span className="pct-field-label">TAP folder</span>
                  <code className="pct-path">{tapDir ?? "— not set —"}</code>
                  <div className="pct-settings-actions">
                    <button type="button" disabled={!pct || busy} onClick={() => void chooseFolder()}>
                      {tapDir === null ? "Choose…" : "Change…"}
                    </button>
                  </div>
                  <span className="pct-field-meta">
                    Usually the TAP converter's input folder. Also in Settings.
                  </span>
                </div>

                <div className="pct-field pct-field-col">
                  <span className="pct-field-label">About to write</span>
                  <ul className="pct-summary">
                    <li>
                      <span className="pct-field-meta">File</span>
                      <code className="pct-path">{identity && problem === null ? tapFileName(identity.icao) : "—"}</code>
                    </li>
                    {gliderCount > 0 && (
                      <li>
                        <span className="pct-field-meta">Glider starts</span>
                        <span>
                          {gliderCount} in{" "}
                          <code className="pct-path">
                            {identity && problem === null ? tapAddendumFileName(identity.icao) : "—"}
                          </code>
                        </span>
                      </li>
                    )}
                    <li>
                      <span className="pct-field-meta">Name</span>
                      <span>{airport.name.trim() || "—"}</span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Airport</span>
                      <span>
                        {runways.length} runway{runways.length === 1 ? "" : "s"} · {pads.length} helipad
                        {pads.length === 1 ? "" : "s"} · {parkings.length} parking position
                        {parkings.length === 1 ? "" : "s"}
                      </span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Boundary</span>
                      <span>{boundaryPoints >= 3 ? `${boundaryPoints} points` : "— none —"}</span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Surfaces</span>
                      <span>
                        {tarmacCount} tarmac{tarmacCount === 1 ? "" : "s"} · {lineCount} line
                        {lineCount === 1 ? "" : "s"}
                      </span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Markings</span>
                      <span>
                        {groundTextCount} ground text{groundTextCount === 1 ? "" : "s"} · {taxisignCount} taxi sign
                        {taxisignCount === 1 ? "" : "s"} · {jetwayCount} jetway
                        {jetwayCount === 1 ? "" : "s"} · {carlotCount} car lot{carlotCount === 1 ? "" : "s"}
                      </span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Elevation</span>
                      <span>
                        {airport.elevation !== undefined
                          ? `${airport.elevation.toFixed(1)} m ASL`
                          : "terrain under the airport point"}
                      </span>
                    </li>
                    <li>
                      <span className="pct-field-meta">Objects</span>
                      <span>{objects.length}</span>
                    </li>
                  </ul>
                  {airport.position === undefined && (
                    <span className="pct-warn">
                      This airport is not on the map yet — set its point in the <strong>Airport</strong> panel.
                    </span>
                  )}
                  {problem !== null && (
                    <span className="pct-warn">
                      {identityProblemText(problem)} Select <strong>Airport</strong> in the list on the right and
                      fix it in the Inspector.
                    </span>
                  )}
                </div>

                {(lightsNeedTerrain || airportNeedsTerrain) && (
                  <label className="pct-field pct-field-col">
                    <span className="pct-field-label">
                      Base elevation for {lightsNeedTerrain && airportNeedsTerrain ? "the airport and the lights" : lightsNeedTerrain ? "the lights" : "the airport"}{" "}
                      — m ASL (optional)
                    </span>
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

            <div className="pct-modal-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <span className="pct-spacer" />
              {airport !== undefined && (
                <button className="pct-primary" onClick={() => void write(false)} disabled={blocked}>
                  {busy ? "Exporting…" : "Export TAP"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
