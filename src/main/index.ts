// Electron main process — window lifecycle only for M1e-1. The I/O handlers (scan, export,
// settings, elevation…) arrive in M1e-2 via ipc.ts. The renderer stays sandboxed; its only
// bridge to Node is the preload script (contextIsolation on, nodeIntegration off).
import { join } from "node:path";
import { app, BrowserWindow } from "electron";

// electron-vite injects this env var in dev (the Vite renderer dev-server URL); undefined in prod.
const RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    title: "PCT — POI Creation Tool",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs Node built-ins to reach main; the renderer stays isolated
    },
  });

  win.once("ready-to-show", () => win.show());

  if (RENDERER_URL) {
    void win.loadURL(RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
