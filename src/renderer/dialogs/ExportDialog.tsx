// ExportDialog.tsx — the export/install dialog (design §5). Slug (live-validated) + anchor
// (auto-centroid or current map center) + a live folder-name preview that mirrors planExport exactly
// (poiFolderName(reference ?? centroid(objects), poiName)). A destination radio picks Install into AFS4
// vs Export to a folder (target "install" | "choose-folder"); a needs-elevation envelope is answered by
// the inline base-elevation field (offline fallback); a folder-exists refusal offers overwrite. Below
// the form, a list of PCT-installed POIs with per-row Uninstall (M2g). The chrome is previewable
// without the bridge — only the write actions need it.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExportOptions, InstallResult, InstalledPoi, PctError } from "../../shared/pctApi";
import type { LonLat } from "../../core/project/types";
import { shiftEastNorth } from "../../core/geo/geo";
import { centroid, poiFolderName } from "../../core/geo/poiName";
import { unsupportedInAutoheight } from "../../core/export/heights";
import { firstProjectError, isExportablePoiName } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { unregisteredPlacedNames } from "../catalog/registration";
import { NumberInput } from "../inspector/NumberInput";

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
              // NOT "built-in": the sim's own POIs are packed inside the install, so everything in the
              // user's scenery/poi/ is third-party or hand-made. It's simply not ours to delete.
              <span className="pct-field-meta" title="PCT didn't create this one — it is left untouched">
                not by PCT
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The fix-it text for an autoheight blocker, shared by the pre-export warning and the error envelope. */
function autoheightBlockText(reason: "asl" | "lights", n: number): string {
  const these = n === 1 ? "it" : "them";
  return reason === "lights"
    ? `${n} placed light${n === 1 ? "" : "s"} can't use Sim autoheight yet — switch to Baked ASL, or remove ${these}.`
    : `${n} object${n === 1 ? "" : "s"} use an absolute ASL height that Sim autoheight can't place — switch ${these} to Terrain / Terrain + offset, or use Baked ASL.`;
}

function messageFor(error: PctError): string {
  switch (error.code) {
    case "needs-elevation": {
      // The envelope carries the objects it couldn't resolve — say how many, so "enter a base elevation"
      // reads as a concrete instruction about YOUR scene rather than a generic service complaint.
      const n = error.points.length;
      return `Couldn't get the terrain elevation for ${n} object${n === 1 ? "" : "s"} — enter a base elevation (m ASL) below and export again.`;
    }
    case "unsupported-in-autoheight":
      return autoheightBlockText(error.reason, error.points.length);
    case "folder-exists":
      return `A POI folder "${error.folderName}" already exists.`;
    default:
      return error.message;
  }
}

export function ExportDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const objects = useEditor((s) => s.project.objects);
  const catalogIndex = useEditor((s) => s.catalogIndex);
  const storePoiName = useEditor((s) => s.project.poiName);
  const storeRef = useEditor((s) => s.project.reference);
  const storeShift = useEditor((s) => s.project.shift);
  // Height mode lives on the document (one source of truth, shared with the TopBar's HeightModeSwitch) —
  // read it live and change it via setHeightMode, so the switch and these radios always agree and the
  // inspector reacts immediately. (Unlike slug/shift, which stay local drafts until export.)
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";
  const mapView = useEditor((s) => s.mapView);

  const [slug, setSlug] = useState(storePoiName);
  const [refMode, setRefMode] = useState<"auto" | "map">(storeRef !== null ? "map" : "auto");
  const [target, setTarget] = useState<ExportOptions["target"]>("install");
  const [baseElev, setBaseElev] = useState("");
  const autoheight = heightMode === "autoheight";
  const [shiftEast, setShiftEast] = useState(storeShift?.east ?? 0);
  const [shiftNorth, setShiftNorth] = useState(storeShift?.north ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InstallResult | null>(null);

  const validSlug = isExportablePoiName(slug);
  // Mirror planExport EXACTLY: it shifts every object first, THEN centroids (an explicit reference is used
  // as-is and never shifted). The preview skipped the shift, so with a non-zero shift in "auto" mode the
  // folder name shown here was not the folder name written — and the folder name is the coordinate the sim
  // finds the POI by. shiftEastNorth is a no-op at (0,0), so the common case is unchanged.
  const previewRef: LonLat =
    refMode === "map"
      ? { lon: mapView.lon, lat: mapView.lat }
      : centroid(objects.map((o) => shiftEastNorth(o.position, shiftEast, shiftNorth)));
  const folderName = validSlug ? poiFolderName(previewRef, slug) : null;

  // Warn (don't block) if the scene places a user model that isn't registered — it won't render in the
  // sim. Unreachable by placing (unregistered cards are disabled); reachable via an opened project.json.
  const unregisteredPlaced = useMemo(
    () => unregisteredPlacedNames(objects, catalogIndex),
    [objects, catalogIndex],
  );

  // In Sim-autoheight mode, warn (and block) BEFORE trying if the scene has something the mode can't
  // represent — a light (not verified in autoheight yet) or an absolute-ASL height (no AGL meaning). Same
  // pure guard the exporter throws on, surfaced early so the user fixes it here instead of hitting an error.
  const blockedByAutoheight = useMemo(
    () => (autoheight ? unsupportedInAutoheight(objects) : null),
    [autoheight, objects],
  );

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
    const curShift = store.project.shift ?? { east: 0, north: 0 };
    if (shiftEast !== curShift.east || shiftNorth !== curShift.north) {
      store.setShift({ east: shiftEast, north: shiftNorth });
    }
    // heightMode is already persisted the moment it's toggled (store-backed) — nothing to sync here.

    // Export-time twin of the C1 save-net (commands.ts): never write a POI the loader would reject.
    // The export path bypasses doSave, so without this an out-of-range coordinate that Save refuses could
    // still land in scenery/poi (Fable B2). Belt-and-suspenders now that B1 wraps the map inputs, but it
    // closes the class and mirrors save. store.serialize() reads the live state, so it reflects the
    // reference/shift/slug just persisted above.
    const problem = firstProjectError(store.serialize());
    if (problem !== null) {
      setError(`Can't export — the project has a value Aerofly would reject (${problem}). Fix it and try again.`);
      return;
    }

    const opts: ExportOptions = { target, overwrite: false };
    // Autoheight is fully offline: the sim resolves the terrain, so a base elevation has no meaning (main
    // ignores it too). Baked-asl passes it through as the offline/manual fallback.
    if (!autoheight && baseElevation !== undefined) opts.baseElevation = baseElevation;

    await install(opts);
  };

  return (
    <div className="pct-modal" role="dialog" aria-label="Export POI" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Export POI</h2>
          {/* Locked while a write is in flight. Closing mid-install did NOT cancel anything — main was
              already writing into scenery/poi/ — it just tore down the only surface that would have told
              the user it worked and that Aerofly needs a restart. */}
          <button className="pct-close" onClick={onClose} disabled={busy} aria-label="Close">
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
              <span className="pct-field-label">Folder name</span>
              <code className="pct-path">{folderName ?? "(enter a valid POI name)"}</code>
            </div>

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

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Heights</span>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="heightmode"
                  checked={!autoheight}
                  onChange={() => editorStore.getState().setHeightMode("baked-asl")}
                />
                Baked ASL (default) — looks up terrain elevation (may go online)
              </label>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="heightmode"
                  checked={autoheight}
                  onChange={() => editorStore.getState().setHeightMode("autoheight")}
                />
                Sim autoheight (beta) — objects follow the terrain; fully offline
              </label>
            </div>

            {/* Base elevation is the Baked-ASL offline fallback only — autoheight needs no elevation at all. */}
            {!autoheight && (
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

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Shift — metres (line objects up with FS4's tiles)</span>
              <div className="pct-shift-row">
                <label className="pct-shift-cell">
                  <span className="pct-field-meta">East + / West −</span>
                  <NumberInput value={shiftEast} onCommit={setShiftEast} ariaLabel="Shift east, metres" />
                </label>
                <label className="pct-shift-cell">
                  <span className="pct-field-meta">North + / South −</span>
                  <NumberInput value={shiftNorth} onCommit={setShiftNorth} ariaLabel="Shift north, metres" />
                </label>
              </div>
            </div>

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

            {error !== null && <p className="pct-warn">{error}</p>}
            {objects.length === 0 && <p className="pct-empty">No objects placed — the POI would be empty.</p>}
            {unregisteredPlaced.length > 0 && (
              <p className="pct-warn">
                {unregisteredPlaced.length} placed object{unregisteredPlaced.length === 1 ? "" : "s"} use an
                unregistered user model ({unregisteredPlaced.join(", ")}) — register{" "}
                {unregisteredPlaced.length === 1 ? "it" : "them"} in the Catalog panel, or{" "}
                {unregisteredPlaced.length === 1 ? "it won't" : "they won't"} render in the sim.
              </p>
            )}
            {blockedByAutoheight !== null && (
              <p className="pct-warn">
                {autoheightBlockText(blockedByAutoheight.reason, blockedByAutoheight.points.length)}
              </p>
            )}

            <div className="pct-modal-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <span className="pct-spacer" />
              <button
                className="pct-primary"
                disabled={!validSlug || busy || !pct || objects.length === 0 || blockedByAutoheight !== null}
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
