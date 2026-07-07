// Electron main process — window lifecycle + IPC registration. All actual I/O lives in the main
// modules (scan/settings/…) reached through main/ipc.ts; the renderer stays sandboxed and talks
// only to the preload bridge (contextIsolation on, nodeIntegration off).
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { registerIpc } from "./ipc";

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

  // Diagnostics: surface any renderer load failure to the dev terminal.
  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[main] renderer failed to load (${code} ${desc}): ${url}`);
  });

  if (RENDERER_URL) {
    console.log(`[main] dev: loading renderer from ${RENDERER_URL}`);
    void win.loadURL(RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" }); // dev only: RENDERER_URL is unset in prod
  } else {
    const indexHtml = join(import.meta.dirname, "../renderer/index.html");
    console.log(`[main] prod: loading renderer file ${indexHtml}`);
    void win.loadFile(indexHtml);
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
