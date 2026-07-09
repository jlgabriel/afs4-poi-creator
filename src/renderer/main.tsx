import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installMockBridge } from "./dev/mockBridge";
import "./styles.css";

// DEV-ONLY: `preview:renderer?mockpct` installs a fake bridge so the real first-run wizard path (else
// Electron-only) is reproducible in the browser. `import.meta.env.DEV` is a build-time literal `false`
// in production, so this branch — and the mockBridge import — are tree-shaken out of the shipped bundle.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("mockpct")) {
  installMockBridge();
}

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
