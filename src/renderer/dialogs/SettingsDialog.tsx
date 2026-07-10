// SettingsDialog.tsx — the app settings dialog (design §5, the last of M2). Paths (install + user dir)
// with Change/Re-detect, the map tile provider (Esri or a custom XYZ URL + attribution), the elevation
// provider, a Rescan shortcut, and an About panel of licenses/attributions. Loads the current settings
// on mount and commits them all on Save (setSettings); the tile choice also lands in the store so the
// map swaps live (MapView subscribes to store.tiles). aria-modal suspends the global shortcuts (P1-2).
import { useEffect, useState } from "react";
import type { Settings } from "../../core/project/types";
import { editorStore } from "../state/editorStore";
import type { TilesConfig } from "../state/store";
import { getPct } from "../app/pct";

const dash = (p: string | null): string => (p !== null && p.length > 0 ? p : "— not set —");
const looksLikeXyz = (url: string): boolean => /\{z\}/.test(url) && /\{x\}/.test(url) && /\{y\}/.test(url);

export function SettingsDialog({
  onClose,
  onRescan,
}: {
  onClose: () => void;
  onRescan: () => void;
}): React.ReactElement {
  const pct = getPct();
  const [loaded, setLoaded] = useState(false);
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [userDir, setUserDir] = useState<string | null>(null);
  const [provider, setProvider] = useState<"esri" | "custom">("esri");
  const [customUrl, setCustomUrl] = useState("");
  const [customAttr, setCustomAttr] = useState("");
  const [elevation, setElevation] = useState<"open-meteo" | "none">("open-meteo");
  const [busy, setBusy] = useState(false);

  // Load current settings once (or store defaults when there's no bridge — the dialog stays previewable).
  useEffect(() => {
    if (!pct) {
      setProvider(editorStore.getState().tiles.provider);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void pct.getSettings().then((s: Settings) => {
      if (cancelled) return;
      setInstallDir(s.installDir);
      setUserDir(s.afs4UserDir);
      setProvider(s.tiles.provider);
      setCustomUrl(s.tiles.customUrl ?? "");
      setCustomAttr(s.tiles.customAttribution ?? "");
      setElevation(s.elevation.provider);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pct]);

  const changeDir = async (which: "install-dir" | "user-dir"): Promise<void> => {
    if (!pct) return;
    const p = await pct.chooseDirectory(which);
    if (p === null) return; // cancelled
    if (which === "install-dir") setInstallDir(p);
    else setUserDir(p);
  };

  const redetect = async (): Promise<void> => {
    if (!pct) return;
    const d = await pct.detectPaths();
    setInstallDir(d.installDirs[0] ?? null);
    setUserDir(d.userDir);
  };

  const save = async (): Promise<void> => {
    if (!pct) return;
    setBusy(true);
    const tiles: TilesConfig =
      provider === "custom"
        ? {
            provider: "custom",
            customUrl: customUrl.trim() || undefined,
            customAttribution: customAttr.trim() || undefined,
          }
        : { provider: "esri" };
    await pct.setSettings({
      installDir,
      afs4UserDir: userDir,
      tiles,
      elevation: { provider: elevation },
    });
    editorStore.getState().setTiles(tiles); // swap the map tile layer live (MapView subscribes)
    setBusy(false);
    onClose();
  };

  const customBlank = provider === "custom" && customUrl.trim() === "";

  return (
    <div className="pct-modal" role="dialog" aria-label="Settings" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Settings</h2>
          <button className="pct-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {!loaded ? (
          <p className="pct-empty">Loading…</p>
        ) : (
          <>
            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Aerofly FS 4 install folder</span>
              <code className="pct-path">{dash(installDir)}</code>
              <div className="pct-settings-actions">
                <button type="button" disabled={!pct} onClick={() => void changeDir("install-dir")}>
                  Change…
                </button>
                <button type="button" disabled={!pct} onClick={() => void redetect()}>
                  Re-detect
                </button>
              </div>
              <span className="pct-field-meta">Rescan after changing the install to reload objects.</span>
            </div>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Aerofly FS 4 user folder (POI install target)</span>
              <code className="pct-path">{dash(userDir)}</code>
              <div className="pct-settings-actions">
                <button type="button" disabled={!pct} onClick={() => void changeDir("user-dir")}>
                  Change…
                </button>
              </div>
            </div>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Map tiles</span>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="tiles"
                  checked={provider === "esri"}
                  onChange={() => setProvider("esri")}
                />
                Esri World Imagery (default)
              </label>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="tiles"
                  checked={provider === "custom"}
                  onChange={() => setProvider("custom")}
                />
                Custom XYZ URL
              </label>
              {provider === "custom" && (
                <>
                  <input
                    className="pct-text"
                    value={customUrl}
                    placeholder="https://tile.example.com/{z}/{x}/{y}.png"
                    aria-label="Custom tile URL"
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                  <input
                    className="pct-text"
                    value={customAttr}
                    placeholder="Attribution (shown on the map)"
                    aria-label="Custom tile attribution"
                    onChange={(e) => setCustomAttr(e.target.value)}
                  />
                  {customUrl.trim() !== "" && !looksLikeXyz(customUrl) && (
                    <span className="pct-warn">URL should contain {"{z}"}, {"{x}"} and {"{y}"} placeholders.</span>
                  )}
                </>
              )}
            </div>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Elevation provider</span>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="elev"
                  checked={elevation === "open-meteo"}
                  onChange={() => setElevation("open-meteo")}
                />
                Open-Meteo (online terrain lookup)
              </label>
              <label className="pct-radio">
                <input
                  type="radio"
                  name="elev"
                  checked={elevation === "none"}
                  onChange={() => setElevation("none")}
                />
                None — enter a base elevation per export
              </label>
            </div>

            <div className="pct-field pct-field-col">
              <span className="pct-field-label">Catalog</span>
              <div className="pct-settings-actions">
                <button
                  type="button"
                  disabled={!pct}
                  onClick={() => {
                    onClose();
                    onRescan();
                  }}
                >
                  Rescan the object catalog…
                </button>
              </div>
            </div>

            <details className="pct-about">
              <summary>About &amp; attributions</summary>
              <p className="pct-field-meta">
                PCT — POI Creation Tool (MIT). Builds installable Aerofly FS 4 POIs from your own install;
                ships no IPACS assets.
              </p>
              <ul className="pct-about-list">
                <li>Map: Leaflet (BSD-2) · Esri World Imagery · OpenStreetMap (ODbL)</li>
                <li>Elevation: Open-Meteo (CC-BY 4.0)</li>
                <li>UI: React (MIT) · Zustand (MIT) · built with Electron + Vite</li>
              </ul>
            </details>

            {!pct && <p className="pct-empty">Settings need the desktop app (npm run dev).</p>}

            <div className="pct-modal-actions">
              <button onClick={onClose}>Cancel</button>
              <span className="pct-spacer" />
              <button
                className="pct-primary"
                disabled={!pct || busy || customBlank}
                title={pct ? undefined : "Settings need the desktop app"}
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
