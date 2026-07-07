// M1e-2 shell — a smoke test of the main↔renderer bridge: on mount it calls window.pct.detectPaths()
// (renderer → preload → main → afs4Paths → back) and shows what it found. The real layout
// (TopBar / CatalogPanel / MapView / Inspector, design §5) replaces this in M1e-4/M1e-5.
import { useEffect, useState } from "react";
import type { DetectResult } from "../shared/pctApi";

export function App() {
  const [paths, setPaths] = useState<DetectResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!window.pct) {
      setErr("preload bridge (window.pct) is not available");
      return;
    }
    window.pct
      .detectPaths()
      .then(setPaths)
      .catch((e: unknown) => setErr(String(e)));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.6 }}>
      <h1 style={{ margin: 0 }}>PCT — POI Creation Tool</h1>
      <p style={{ color: "#666" }}>M1e-2 — main I/O + PctApi bridge smoke test:</p>
      {err && <pre style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</pre>}
      {paths ? (
        <ul>
          <li>
            <strong>Install dirs:</strong>{" "}
            {paths.installDirs.length ? paths.installDirs.join(", ") : "(none auto-detected)"}
          </li>
          <li>
            <strong>User dir:</strong> {paths.userDir ?? "(not found)"}
          </li>
        </ul>
      ) : (
        !err && <p>Detecting AFS4 paths…</p>
      )}
    </main>
  );
}
