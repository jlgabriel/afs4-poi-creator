// Electron main process — window lifecycle, IPC registration, and the security hardening from the
// Fable review (P1-6): sandboxed renderer, a locked-down navigation/permission surface, and a CSP
// applied to the packaged renderer. All real I/O lives in the main modules reached through
// main/ipc.ts; the renderer stays sandboxed and talks only to the preload bridge.
import { join } from "node:path";
import { app, BrowserWindow, screen, session, shell } from "electron";
import { registerIpc } from "./ipc";
import { readSettings, writeSettings } from "./settings";
import { restoreBounds } from "./windowBounds";

// electron-vite injects this env var in dev (the Vite renderer dev-server URL); undefined in prod.
const RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];

/** Frozen in at build time from package.json by electron.vite.config (`define`). See the note there for
 *  why this is NOT app.getVersion(): that returns Electron's own version when the main script is launched
 *  by path, so the title read "PCT 43.0.0" under the e2e while being correct in a packaged build. */
declare const __APP_VERSION__: string;

// Packaged-renderer CSP. NOT applied in dev: Vite HMR injects an inline react-refresh preamble + a
// ws: connection that a strict policy would block. The dev renderer is a local-only page; the
// packaged app is what loads untrusted project.json, and that's where the CSP matters.
//
// img-src allows any https host (not just Esri/OSM) so the Settings dialog's custom XYZ tile provider
// works (design §4 escape-hatch, Fable P1-6 "relax only img-src to https:"). Low risk here: tile URLs
// come only from the user's own Settings, never from the untrusted project.json (which is names + coords,
// no image refs). script/connect stay locked to 'self'.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob: https:; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

function createWindow(): void {
  const userData = app.getPath("userData");
  const documents = app.getPath("documents");

  // Reopen where the user left it (forum #125). `screen` is only legal after app.whenReady(), which both
  // call sites satisfy. windowBounds decides — including refusing a position whose display is gone.
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const { maximized, ...frame } = restoreBounds(readSettings(userData, documents).window, workAreas);

  const win = new BrowserWindow({
    ...frame, // width/height always; x/y only when they still land on a screen
    show: false,
    autoHideMenuBar: true,
    // The version is here because Michael was asked to test v0.3.3 and had no way to tell what he was
    // running (forum #131). Build-time constant → the same string in dev, e2e and the installer.
    title: `PCT ${__APP_VERSION__} — POI Creation Tool`,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true, // preload is emitted CJS (electron.vite.config) so the sandbox stays on
    },
  });

  // index.html carries its own <title> (it is also the dev-preview tab label), and in Electron a page
  // title WINS over the `title` option the moment the document loads — so the option alone would show the
  // version for one frame and then lose it. Main owns the title; the renderer never sets one dynamically.
  // Verified by deleting this line: the e2e goes red with "PCT — POI Creation Tool", no version.
  win.on("page-title-updated", (event) => event.preventDefault());

  // "…reappears at the same place and in the size as when closing" — so close is exactly when to record
  // it. getNormalBounds(), NOT getBounds(): while maximized the latter returns the maximized rectangle,
  // which would come back as the restored size and un-maximizing would give the wrong window. One
  // synchronous write, no resize/move listeners to debounce; a kill -9 costs a placement and nothing else.
  win.on("close", () => {
    try {
      const b = win.getNormalBounds();
      const window = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
      writeSettings(userData, { window }, documents);
    } catch {
      /* a window placement is never worth blocking a quit over */
    }
  });

  win.once("ready-to-show", () => {
    if (maximized) win.maximize(); // after the frame exists, before the first paint → no restore flash
    win.show();
  });

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
  // Deny every permission request app-wide (no camera/mic/geolocation/notifications are needed) — with
  // exactly ONE exception. Electron routes navigator.clipboard.writeText through this handler, so the
  // blanket cb(false) made the Inspector's Copy button silently do nothing: it looked like it worked and
  // never touched the clipboard (Fable I7 — suspected, and confirmed by the e2e, which found the
  // clipboard still holding its sentinel after a click). Writing SANITIZED text from our own sandboxed
  // renderer is the narrowest grant that makes the button honest; clipboard READ stays denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "clipboard-sanitized-write"),
  );

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
