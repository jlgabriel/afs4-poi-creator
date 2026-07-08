// ExportDialog.tsx — the minimal export/install dialog (design §5). Slug (live-validated) + anchor
// (auto-centroid or current map center) + a live folder-name preview that mirrors planExport exactly
// (poiFolderName(reference ?? centroid(objects), poiName)). "Install into AFS4" calls exportPoi; a
// needs-elevation envelope is answered by the inline base-elevation field (offline fallback), and
// success shows the path + Reveal + the restart note. The chrome is previewable without the bridge —
// only the Install action needs it. Overwrite / uninstall / export-to-folder are M2.
import { useState } from "react";
import type { ExportOptions, InstallResult, PctError } from "../../shared/pctApi";
import type { LonLat } from "../../core/project/types";
import { centroid, poiFolderName } from "../../core/geo/poiName";
import { isExportablePoiName } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";

function sameRef(a: LonLat | null, b: LonLat | null): boolean {
  if (a === null || b === null) return a === b;
  return a.lon === b.lon && a.lat === b.lat;
}

function messageFor(error: PctError): string {
  switch (error.code) {
    case "needs-elevation":
      return "Elevation service unavailable — enter a base elevation (m ASL) below and export again.";
    case "folder-exists":
      return `A POI folder "${error.folderName}" already exists. (Overwrite / uninstall arrive in M2.)`;
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
  const [baseElev, setBaseElev] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);

  const validSlug = isExportablePoiName(slug);
  const previewRef: LonLat =
    refMode === "map" ? { lon: mapView.lon, lat: mapView.lat } : centroid(objects.map((o) => o.position));
  const folderName = validSlug ? poiFolderName(previewRef, slug) : null;

  const doExport = async (): Promise<void> => {
    if (!pct || !validSlug) return;
    setError(null);

    const baseElevation = baseElev.trim() === "" ? undefined : Number.parseFloat(baseElev);
    if (baseElevation !== undefined && Number.isNaN(baseElevation)) {
      setError("Base elevation must be a number (metres ASL).");
      return;
    }

    // Persist the chosen slug + anchor into the document so a subsequent Save matches the export.
    const store = editorStore.getState();
    if (slug !== store.project.poiName) store.setPoiName(slug);
    const desiredRef = refMode === "map" ? { lon: mapView.lon, lat: mapView.lat } : null;
    if (!sameRef(store.project.reference, desiredRef)) store.setReference(desiredRef);

    const opts: ExportOptions = { target: "install", overwrite: false };
    if (baseElevation !== undefined) opts.baseElevation = baseElevation;

    setBusy(true);
    const res = await pct.exportPoi(editorStore.getState().serialize(), opts);
    setBusy(false);

    if (!res.ok) {
      setError(messageFor(res.error));
      return;
    }
    if (res.value !== null) setResult(res.value); // null only for choose-folder cancel (unused here)
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
            <p className="pct-ok">Installed to:</p>
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
            <p>
              <strong>Restart Aerofly FS 4 to see your POI.</strong>
            </p>
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
                disabled={!validSlug || busy || !pct}
                title={pct ? undefined : "Install runs in the desktop app"}
                onClick={() => void doExport()}
              >
                {busy ? "Exporting…" : "Install into AFS4"}
              </button>
            </div>
            {!pct && <p className="pct-empty">Install runs in the desktop app (npm run dev).</p>}
          </>
        )}
      </div>
    </div>
  );
}
