import { readFileSync } from "node:fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// PCT — Electron/React/Vite wiring. Three build targets that all share the pure src/core.
// The preload is emitted as CommonJS (index.cjs) ON PURPOSE: it lets the renderer run with
// sandbox:true (Electron requires a CJS preload under sandbox), and the preload only needs
// contextBridge + ipcRenderer, which the sandbox supports (Fable review P1-6). main + renderer keep
// electron-vite's conventional entries (src/main/index.ts, src/renderer/index.html).

// The version, frozen into the bundle at build time (forum #131 — the window title shows it).
// NOT app.getVersion(): that reads whatever package.json Electron decides is "the app", and when the
// main script is launched by path (which is exactly how the e2e runs it) it finds none and falls back to
// the ELECTRON binary's version — the title came out "PCT 43.0.0". It happens to be right in a packaged
// build, which is the worst kind of wrong: correct in release, nonsense in dev, and the test that would
// have told us agreeing with whichever it saw. One value, every launch mode; `npm version` still owns it.
const APP_VERSION: string = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    plugins: [react()],
    // Keep hooks-based deps (react-window) on the app's single React instance — avoids the
    // "Invalid hook call … more than one copy of React" failure. Mirrors vite.preview.mts.
    resolve: { dedupe: ["react", "react-dom"] },
  },
});
