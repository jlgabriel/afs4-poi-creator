import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// PCT — Electron/React/Vite wiring. Three build targets that all share the pure src/core.
// The preload is emitted as CommonJS (index.cjs) ON PURPOSE: it lets the renderer run with
// sandbox:true (Electron requires a CJS preload under sandbox), and the preload only needs
// contextBridge + ipcRenderer, which the sandbox supports (Fable review P1-6). main + renderer keep
// electron-vite's conventional entries (src/main/index.ts, src/renderer/index.html).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
