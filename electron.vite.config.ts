import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// PCT — Electron/React/Vite wiring. Three build targets that all share the pure src/core:
//   main + preload run in Node (deps externalized so Electron loads them from node_modules);
//   renderer is a sandboxed Chromium page whose only privileged channel is preload (§3.5 PctApi).
// Uses electron-vite's conventional entry points (src/main/index.ts, src/preload/index.ts,
// src/renderer/index.html) so there is no custom input wiring to drift.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
  },
});
