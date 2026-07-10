// ExportDialog.tsx — the export/install dialog (design §5). Slug (live-validated) + anchor
// (auto-centroid or current map center) + a live folder-name preview that mirrors planExport exactly
// (poiFolderName(reference ?? centroid(objects), poiName)). A destination radio picks Install into AFS4
// vs Export to a folder (target "install" | "choose-folder"); a needs-elevation envelope is answered by
// the inline base-elevation field (offline fallback); a folder-exists refusal offers overwrite. Below
// the form, a list of PCT-installed POIs with per-row Uninstall (M2g). The chrome is previewable
// without the bridge — only the write actions need it.
import { useCallback, useEffect, useState } from "react";
import type { ExportOptions, InstallResult, InstalledPoi, PctError } from "../../shared/pctApi";
import type { LonLat } from "../../core/project/types";
import { centroid, poiFolderName } from "../../core/geo/poiName";
import { isExportablePoiName } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";

function sameRef(a: LonLat | null, b: LonLat | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lon === b.lon && a.lat === b.lat;
}

/** The installed-POI manager below the export form (design §5). Lists what's under scenery/poi/ and
 *  offers Uninstall only for PCT-authored folders (byPct = carries our README marker → safe to delete);
 *  built-in / third-party POIs are shown but left untouched. Refetches after each uninstall. */
function InstalledPois(): React.ReactElement | null {
  const pct = getPct();
  const [rows, setRows] = useState<InstalledPoi[] | null>(null);

  const refresh = useCallback(() => {
    if (!pct) {
      setRows([]);
      return;
    }
    void pct.listInstalledPois().then(setRows);
  }, [pct]);
  useEffect(refresh, [refresh]);

  const uninstall = async (folderName: string): Promise<void> => {
    if (!pct) return;
    if (!window.confirm(`Remove the installed POI "${folderName}"? This deletes its scenery/poi folder.`))
      return;
    const res = await pct.uninstallPoi(folderName);
    if (res.ok) refresh();
    else window.alert(res.error.message);
  };

  if (rows === null || rows.length === 0) return null; // hide the section until there's something to show

  return (
    <div className="pct-installed">
      <div className="pct-field-label">Installed POIs</div>
      <ul className="pct-installed-list">
        {rows.map((p) => (
          <li key={p.folderName} className="pct-installed-row">
            <code className="pct-path">{p.folderName}</code>
            {p.byPct ? (
              <button type="button" onClick={() => void uninstall(p.folderName)}>
                Uninstall
              </button>
            ) : (
              <span className="pct-field-meta" title="Not installed by PCT — left untouched">
                built-in
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function messageFor(error: PctError): string {
  switch (error.code) {
    case "needs-elevation":
      return "Elevation service unavailable — enter a base elevation (m ASL) below and export again.";
    case "folder-exists":
      return `A POI folder "${error.folderName}" already exists.`;
    default:
      return error.message;
  }
}

export function ExportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const storePoiName = useEditor((s) => s.project.poiName);
  const storeRef = useEditor((s) => s.project.reference);
  const mapView = useEditor((s) => s.mapView);

  const [slug, setSlug] = useState(storePoiName);
  const [refMode, setRefMode] = useState<"auto" | "map">(storeRef !== null ? "map" : "auto");
  const [target, setTarget] = useState<ExportOptions["target"]>("install");
  const [baseElev, setBaseElev] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);

  const validSlug = isExportablePoiName(slug);
  const previewRef: LonLat =
    refMode === "map" ? { lon: mapView.lon, lat: mapView.lat } : centroid(objects.map((o) => o.position));
  const folderName = validSlug ? poiFolderName(previewRef, slug) : null;

  // One install attempt. On a folder-exists refusal, offer to replace and retry with overwrite — the
  // installer's overwrite path is already safe, so this is dialog-side only (Fable P1-5 / A#5).
  const install = async (opts: ExportOptions): Promise<void> => {
    if (!pct) return;
    setBusy(true);
    const res = await pct.exportPoi(editorStore.getState().serialize(), opts);
    setBusy(false);

    if (res.ok) {
      if (res.value !== null) setResult(res.value); // null only for choose-folder cancel (unused here)
      return;
    }
    if (res.error.code === "folder-exists" && !opts.overwrite) {
      const where = opts.target === "install" ? "installed POI" : "folder";
      const replace = window.confirm(
        `A POI folder "${res.error.folderName}" already exists.\n\nReplace the existing ${where}?`,
      );
      if (replace) return install({ ...opts, overwrite: true });
      setError(`Kept the existing "${res.error.folderName}". Rename the POI to write a separate copy.`);
      return;
    }
    setError(messageFor(res.error));
  };

  const doExport = async (): Promise<void> => {
    if (!pct || !validSlug) return;
    setError(null);

    const baseElevation = baseElev.trim() === "" ? undefined : Number.parseFloat(baseElev);
    // isFinite (not just !isNaN): "1e999" → Infinity → "Infinity" literal in the .toc height (Fable C1).
    if (baseElevation !== undefined && !Number.isFinite(baseElevation)) {
      setError("Base elevation must be a number (metres ASL).");
      return;
    }

    // Persist the chosen slug + anchor into the document so a subsequent Save matches the export.
    const store = editorStore.getState();
    if (slug !== store.project.poiName) store.setPoiName(slug);
    const desiredRef = refMode === "map" ? { lon: mapView.lon, lat: mapView.lat } : null;
    if (!sameRef(store.project.reference, desiredRef)) store.setReference(desiredRef);

    const opts: ExportOptions = { target, overwrite: false };
    if (baseElevation !== undefined) opts.baseElevation = baseElevation;

    await install(opts);
  };

  return (
    <div className="pct-modal" role="dialog" aria-label="Export POI" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Export POI</h2>
          <button className="pct-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {result !== null ? (
          <div className="pct-export-done">
            <p className="pct-ok">{result.installed ? "Installed to:" : "Exported to:"}</p>
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
            {result.installed ? (
              <p>
                <strong>Restart Aerofly FS 4 to see your POI.</strong>
              </p>
            ) : (
              <p>
                Copy this folder into your Aerofly FS 4 <code>scenery/poi</code> to install it.
              </p>
            )}
            <div className="pct-modal-actions">
              <button onClick={() => void pct?.revealInFolder(result.folderName)}>Reveal in folder</button>
              <span className="pct-spacer" />
              <button className="pct-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="pct-field pct-field-col">
              <span className="pct-field-label">POI name (folder slug)</span>
              <input
                className="pct-num"
                value={slug}
                placeholder="e.g. munich_test"
                aria-label="POI name"
                onChange={(e) => setSlug(e.target.value)}
              />
              {!validSlug && slug.length > 0 && (
                <span className="pct-warn">Lowercase letters, digits, and underscores only.</span>
              )}
            </label>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Anchor (folder coordinates)</span>
              <label className="pct-radio">
                <input type="radio" name="refmode" checked={refMode === "auto"} onChange={() => setRefMode("auto")} />
                Auto — centroid of objects
              </label>
              <label className="pct-radio">
                <input type="radio" name="refmode" checked={refMode === "map"} onChange={() => setRefMode("map")} />
                Current map center
              </label>
            </div>

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

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Destination</span>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="target"
                  checked={target === "install"}
                  onChange={() => setTarget("install")}
                />
                Install into Aerofly FS 4
              </label>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="target"
                  checked={target === "choose-folder"}
                  onChange={() => setTarget("choose-folder")}
                />
                Export to a folder…
              </label>
            </div>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Folder name</span>
              <code className="pct-path">{folderName ?? "(enter a valid POI name)"}</code>
            </div>

            {error !== null && <p className="pct-warn">{error}</p>}
            {objects.length === 0 && <p className="pct-empty">No objects placed — the POI would be empty.</p>}

            <div className="pct-modal-actions">
              <button onClick={onClose}>Cancel</button>
              <span className="pct-spacer" />
              <button
                className="pct-primary"
                disabled={!validSlug || busy || !pct || objects.length === 0}
                title={pct ? undefined : "Export runs in the desktop app"}
                onClick={() => void doExport()}
              >
                {busy
                  ? "Working…"
                  : target === "install"
                    ? "Install into AFS4"
                    : "Export to folder…"}
              </button>
            </div>
            {!pct && <p className="pct-empty">Export runs in the desktop app (npm run dev).</p>}
            <InstalledPois />
          </>
        )}
      </div>
    </div>
  );
}
