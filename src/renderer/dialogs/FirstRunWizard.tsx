// FirstRunWizard.tsx — the first-run / Rescan flow (design §5): Welcome → Install dir (auto-detected
// candidates + Browse, validated by attempting the scan) → scan spinner → "N objects in M bundles" +
// Open editor. It only loads the catalog + persists settings; it does NOT touch the project, so the
// store's blank initial project stands on first run and Rescan never wipes an open project. Rendered
// only in Electron (the browser preview seeds the demo and never reaches the wizard branch).
import { useEffect, useState } from "react";
import type { Catalog } from "../../core/project/types";
import { editorStore } from "../state/editorStore";
import { getPct } from "../app/pct";
import { bundleSummary } from "./bundleSummary";

type Step = "welcome" | "install" | "scanning" | "result";

export function FirstRunWizard({ onDone }: { onDone: () => void }): React.ReactElement {
  const pct = getPct();
  const [step, setStep] = useState<Step>("welcome");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [userDir, setUserDir] = useState<string | null>(null);
  const [installDir, setInstallDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    if (!pct) return;
    let cancelled = false;
    void (async () => {
      const [paths, settings] = await Promise.all([pct.detectPaths(), pct.getSettings()]);
      if (cancelled) return;
      // Seed BOTH dirs from the SAVED settings first, falling back to auto-detect only on a true first
      // run (no saved value). This flow is reused for Rescan and `finish()` writes both unconditionally,
      // so seeding from auto-detect alone silently wiped a hand-set path when detect can't find it (a
      // non-standard install / Documents folder), breaking the next export (Fable I1 — the afs4UserDir
      // half shipped in a0e557e; the installDir half is this fix). Also surface a saved-but-undetected
      // install dir as a candidate so it shows up selected in the list, not only as the radio value.
      const savedInstall = settings.installDir;
      setCandidates(
        savedInstall !== null && !paths.installDirs.includes(savedInstall)
          ? [savedInstall, ...paths.installDirs]
          : paths.installDirs,
      );
      setUserDir(settings.afs4UserDir ?? paths.userDir);
      setInstallDir(savedInstall ?? paths.installDirs[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pct]);

  if (!pct) {
    return (
      <div className="pct-boot">
        <p>The setup wizard needs the desktop app.</p>
      </div>
    );
  }

  const browse = async (): Promise<void> => {
    const dir = await pct.chooseDirectory("install-dir");
    if (dir === null) return;
    setInstallDir(dir);
    setCandidates((c) => (c.includes(dir) ? c : [dir, ...c]));
    setError(null);
  };

  const runScan = async (): Promise<void> => {
    if (installDir === null) return;
    setError(null);
    setStep("scanning");
    const res = await pct.scan(installDir, userDir);
    if (!res.ok) {
      setError(
        res.error.code === "no-xref"
          ? "No scenery/xref folder there — pick your Aerofly FS 4 install folder."
          : res.error.message,
      );
      setStep("install");
      return;
    }
    setCatalog(res.value);
    setStep("result");
  };

  const finish = async (): Promise<void> => {
    if (catalog === null || installDir === null) return;
    await pct.setSettings({ installDir, afs4UserDir: userDir });
    editorStore.getState().loadCatalog(catalog);
    onDone();
  };

  return (
    <div className="pct-wizard">
      <div className="pct-wizard-card">
        <h1 className="pct-wizard-brand">PCT — POI Creation Tool</h1>

        {step === "welcome" && (
          <>
            <p>Place Aerofly FS 4 built-in objects on a satellite map and export an installable POI.</p>
            <p>First, point PCT at your Aerofly FS 4 install so it can scan the object catalog.</p>
            <div className="pct-wizard-actions">
              <span className="pct-spacer" />
              <button className="pct-primary" onClick={() => setStep("install")}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === "install" && (
          <>
            <h2>Aerofly FS 4 install folder</h2>
            {error !== null && <p className="pct-warn">{error}</p>}
            {candidates.length === 0 && (
              <p className="pct-empty">Nothing auto-detected — Browse to your install folder.</p>
            )}
            <div className="pct-wizard-list">
              {candidates.map((dir) => (
                <label key={dir} className={dir === installDir ? "pct-cand sel" : "pct-cand"}>
                  <input
                    type="radio"
                    name="installdir"
                    checked={dir === installDir}
                    onChange={() => setInstallDir(dir)}
                  />
                  <code>{dir}</code>
                </label>
              ))}
            </div>
            <div className="pct-wizard-actions">
              <button onClick={() => void browse()}>Browse…</button>
              <span className="pct-spacer" />
              <button onClick={() => setStep("welcome")}>Back</button>
              <button className="pct-primary" disabled={installDir === null} onClick={() => void runScan()}>
                Scan
              </button>
            </div>
          </>
        )}

        {step === "scanning" && (
          <>
            <h2>Scanning…</h2>
            <p className="pct-empty">Reading scenery/xref from the install folder.</p>
            <div className="pct-spinner" aria-label="Scanning" />
          </>
        )}

        {step === "result" && catalog !== null && (
          <>
            <h2>Catalog ready</h2>
            <p className="pct-wizard-summary">{bundleSummary(catalog)}</p>
            <div className="pct-wizard-list pct-wizard-bundles">
              {catalog.bundles.map((b) => (
                <div key={`${b.source}:${b.bundle}`} className="pct-bundle-row">
                  <code>{b.bundle}</code>
                  <span className="pct-bundle-src">{b.source}</span>
                  <span className="pct-count">{b.count}</span>
                </div>
              ))}
            </div>
            <div className="pct-wizard-actions">
              <button onClick={() => setStep("install")}>Back</button>
              <span className="pct-spacer" />
              <button className="pct-primary" onClick={() => void finish()}>
                Open editor
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
