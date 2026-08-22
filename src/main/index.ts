// Electron main process — window lifecycle, IPC registration, and the security hardening from the
// Fable review (P1-6): sandboxed renderer, a locked-down navigation/permission surface, and a CSP
// applied to the packaged renderer. All real I/O lives in the main modules reached through
// main/ipc.ts; the renderer stays sandboxed and talks only to the preload bridge.
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, screen, session, shell } from "electron";
import { registerIpc } from "./ipc";
import { LOG_FILE_NAME, formatBootHeader, initLog, log } from "./log";
import { mayNavigate } from "./navigation";
import { readSettings, writeSettings } from "./settings";
import { restoreBounds } from "./windowBounds";

// electron-vite injects this env var in dev (the Vite renderer dev-server URL); undefined in prod.
const RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];

/** Frozen in at build time from package.json by electron.vite.config (`define`). See the note there for
 *  why this is NOT app.getVersion(): that returns Electron's own version when the main script is launched
 *  by path, so the title read "PCT 43.0.0" under the e2e while being correct in a packaged build. */
declare const __APP_VERSION__: string;

// Open (and truncate) the session log before anything else can fail. Everything after this point that
// goes wrong leaves a trace; before it, only an import could fail, and that dies with a stack on stderr
// anyway. The boot HEADER is written inside whenReady(), because app.getLocale() is only trustworthy
// after the ready event on Windows.
initLog(join(app.getPath("userData"), LOG_FILE_NAME), { home: homedir() });

// The two process-level escape hatches, routed into the log — and then DELIBERATELY re-crashed.
//
// Merely registering these listeners suppresses Node's default "print the stack and exit(1)", so the
// naive version of this (log it, return) would silently turn every fatal main-process error into PCT
// limping on in an unknown state. That is a behaviour change smuggled in by a diagnostics feature, and
// the wrong direction besides: a crash at least surfaces the problem, and PCT's autosave shadow already
// exists to make one survivable. So the handler adds a record of WHY and preserves the outcome —
// stderr for the terminal, the log for the user, exit(1) as before.
const fatal = (what: string) => (e: unknown) => {
  log.error(`${what} — PCT will now quit`, e);
  log.close();
  console.error(`[main] ${what}:`, e);
  process.exit(1);
};
process.on("uncaughtException", fatal("uncaught exception in main"));
process.on("unhandledRejection", fatal("unhandled promise rejection in main"));

app.on("will-quit", () => {
  log.info("quitting");
  log.close();
});

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
  // itself never navigates away from the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  // ⚠️ This used to compare the target's origin against the current page's and allow a match. That
  // FAILS OPEN in a packaged build: the renderer is loaded with loadFile, so the current URL is a
  // file:// one, and EVERY file:// URL has origin "null" — so the comparison was "null" === "null"
  // for a navigation to any local file, and the guard let it through.
  //
  // Dragging a file onto the window is enough to reach it: Chromium navigates the top-level frame
  // to the drop, will-navigate fires, both origins are "null", and a crafted .html then loads at a
  // file:// origin WITH THIS PRELOAD ATTACHED — handing that page window.pct, which can export,
  // install and uninstall. (Found by a Fable review of the same code copied into the X-Plane tool.)
  //
  // PCT is a single page that never legitimately navigates, so the rule is now simply: block
  // everything. The dev server's own origin is the one exception, because Vite may reload it.
  // The decision itself lives in main/navigation.ts so it can be tested; see its spec for the
  // case that matters — two file:// URLs must never count as the same origin.
  const guardNavigation = (event: { preventDefault(): void }, url: string): void => {
    if (mayNavigate(url, RENDERER_URL)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  };
  win.webContents.on("will-navigate", guardNavigation);
  win.webContents.on("will-redirect", guardNavigation);

  // Diagnostics: surface any renderer load failure to the dev terminal AND the log — a window that comes
  // up blank is the one report where the user has literally nothing else to tell us.
  win.webContents.on("did-fail-load", (_event, code, desc, url) => {
    console.error(`[main] renderer failed to load (${code} ${desc}): ${url}`);
    log.error(`renderer failed to load (${code} ${desc}): ${url}`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    log.error(`renderer process gone: ${details.reason} (exit ${details.exitCode})`);
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

/** The boot header + a one-line snapshot of the settings that decide almost everything downstream: a
 *  scan that found nothing, photos that never appear and an export that lands in the wrong place are all,
 *  most of the time, one of these four values being not what the user thinks it is. */
function logEnvironment(): void {
  log.banner(
    formatBootHeader({
      appVersion: __APP_VERSION__,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      // Electron's own, not os.release(): on macOS the kernel version ("24.2.0") is not what anyone
      // reports or recognises, and "15.2" is. On Windows both agree.
      osVersion: process.getSystemVersion(),
      packaged: app.isPackaged,
      locale: app.getLocale(),
      userData: app.getPath("userData"),
      startedAt: new Date(),
    }),
  );
  try {
    const s = readSettings(app.getPath("userData"), app.getPath("documents"));
    const dash = (p: string | null): string => p ?? "— not set —";
    log.banner(
      [
        `install dir  ${dash(s.installDir)}`,
        `user dir     ${dash(s.afs4UserDir)}`,
        `photos dir   ${dash(s.thumbnailsDir)}`,
        `tiles ${s.tiles.provider} · elevation ${s.elevation.provider} · last scan ${dash(s.lastScanAt)}`,
        `${"─".repeat(78)}`,
      ].join("\n"),
    );
  } catch (e) {
    log.error("could not read settings for the log header", e);
  }
}

app.whenReady().then(() => {
  logEnvironment();

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
