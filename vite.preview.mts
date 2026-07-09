// vite.preview.mts — standalone Vite dev server for the RENDERER ONLY, for UI verification.
//
// `npm run dev` (electron-vite) launches the whole Electron app, which needs a display + the
// downloaded electron binary. This serves just src/renderer in a plain browser so the map / store /
// panels can be eyeballed during development (and driven by Claude Code's preview tools via
// .claude/launch.json). It is NOT part of the app build — the shipped renderer is built by
// electron.vite.config.ts.
//
// Caveat: window.pct (the preload bridge) does not exist in a plain browser, so the renderer must
// degrade gracefully without it for preview to work — the M1e-4 harness does; M1e-5+ shells should
// guard `window.pct?.` (or inject a mock) to stay previewable.
//
//   npm run preview:renderer   →   http://localhost:5199
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  // react-window (and any other hooks-based dep) must resolve to the SAME React instance as the app,
  // or React throws "Invalid hook call … more than one copy of React". Pinning dedupe guarantees one
  // copy under the dev server + HMR. Mirrors the renderer target in electron.vite.config.ts.
  resolve: { dedupe: ["react", "react-dom"] },
  server: {
    port: 5199,
    fs: { allow: [import.meta.dirname] }, // src/renderer imports reach ../core, ../shared
  },
});
