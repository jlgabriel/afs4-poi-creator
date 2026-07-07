// Electron main process — window lifecycle, IPC registration, and the security hardening from the
// Fable review (P1-6): sandboxed renderer, a locked-down navigation/permission surface, and a CSP
// applied to the packaged renderer. All real I/O lives in the main modules reached through
// main/ipc.ts; the renderer stays sandboxed and talks only to the preload bridge.
import { join } from "node:path";
import { app, BrowserWindow, session, shell } from "electron";
import { registerIpc } from "./ipc";

// electron-vite injects this env var in dev (the Vite renderer dev-server URL); undefined in prod.
const RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];

// Packaged-renderer CSP. NOT applied in dev: Vite HMR injects an inline react-refresh preamble + a
// ws: connection that a strict policy would block. The dev renderer is a local-only page; the
// packaged app is what loads untrusted project.json, and that's where the CSP matters.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https://server.arcgisonline.com https://tile.openstreetmap.org; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    title: "PCT — POI Creation Tool",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload is emitted CJS (electron.vite.config) so the sandbox stays on
    },
  });

  win.once("ready-to-show", () => win.show());

  // Navigation hardening: external links (e.g. map attribution) open in the OS browser; the window
  // itself never navigates away from the app (in-app same-origin reloads — Vite dev — are allowed).
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const current = win.webContents.getURL();
    if (current && new URL(url).origin === new URL(current).origin) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });

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
  // Deny every permission request app-wide (no camera/mic/geolocation/notifications are needed).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  // CSP for the packaged renderer only (see note above).
  if (!RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });
  }

  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
