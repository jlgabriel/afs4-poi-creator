// M1e-1 scaffold shell. Real layout (TopBar / CatalogPanel / MapView / Inspector, design §5)
// arrives in M1e-4/M1e-5. For now it just proves React renders and the preload bridge is live.
export function App() {
  const bridge = window.pct?.ping?.() ?? "(no bridge)";
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ margin: 0 }}>PCT — POI Creation Tool</h1>
      <p style={{ color: "#666" }}>
        M1e-1 Electron + React + Vite scaffold. Preload bridge: <code>{bridge}</code>
      </p>
    </main>
  );
}
