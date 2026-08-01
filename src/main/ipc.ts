// ipc.ts — registers one ipcMain handler per PctApi method (design §3.5) and is the app's ONE trust
// boundary: it resolves Electron-owned paths (userData, documents, dialogs), delegates to the pure
// main modules, and maps their typed errors into PctResult envelopes (Fable review P0-1) — because a
// thrown error crossing ipcRenderer.invoke reaches the renderer as a flattened Error with its
// discriminating fields gone. Paths are owned here and never accepted FROM the renderer (P0-2): the
// renderer says WHAT (open / save / install / choose-folder), main decides WHERE via the dialogs.
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import type { Catalog, PlacedObject, Project, ResolvedObject, Settings } from "../core/project/types";
import type {
  DetectResult,
  ExportOptions,
  FootprintImport,
  HeliportInstallOptions,
  InstallResult,
  InstalledHeliport,
  InstalledPoi,
  PctError,
  PctResult,
  ScanResult,
  XrefRegistrationPlan,
  XrefRegistrationResult,
} from "../shared/pctApi";
import {
  countFootprints,
  mergeFootprints,
  setFootprint as setFootprintEntry,
  type FootprintOverride,
  type FootprintOverrides,
} from "../core/catalog/footprints";
import { isValidPhotoKey } from "../core/catalog/photoKey";
import { readFootprints, readFootprintsFile, writeFootprints } from "./footprints";
import {
  NeedsElevationError,
  UnsupportedInAutoheightError,
  resolveHeightsAgl,
  resolveHeightsFlat,
} from "../core/export/heights";
import { InvalidHeliportIdentityError, planExport, planHeliport } from "../core/export/planExport";
import { identityProblemText } from "../core/export/heliportTemplate";
import { UnsupportedSchemaVersionError } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";
import { resolveHeights } from "./elevation";
import { IcaoTakenError, forgetTakenIcaos, takenIcaos } from "./icaoIndex";
import {
  FolderExistsError,
  UnsafeCountryError,
  UnsafeFolderNameError,
  airportRoot,
  listInstalledHeliports,
  listInstalledPois,
  poiRoot,
  resolvePoiPath,
  uninstallHeliport,
  uninstallPoi,
  writePoi,
} from "./installer";
import { anchorAssetsDir } from "./anchorAsset";
import { formatExportSummary, log, type LogLevel } from "./log";
import {
  autosaveShadow,
  clearShadow,
  loadShadow,
  openProject,
  saveProject,
  saveProjectAs,
  writeProjectSidecar,
} from "./projectFile";
import { NoXrefError, readCatalogCache, scanXref, writeCatalogCache } from "./scan";
import {
  ClipboardEmptyError,
  NoPhotosDirError,
  indexThumbnails,
  isValidThumbName,
  photoFilesForStem,
  photoWritePath,
  THUMBNAIL_PX,
} from "./thumbnails";
import { planXrefRegistration, registerXref } from "./xrefRegistrar";
import { defaultXrefTableCandidates, loadXrefTable } from "./xrefTableSource";
import { normalizeUserDir, readSettings, writeSettings } from "./settings";
import { writeFileAtomic } from "./fsAtomic";

const PROJECT_FILTER = [{ name: "PCT project", extensions: ["json"] }];
const FOOTPRINTS_FILTER = [{ name: "PCT footprints", extensions: ["json"] }];

const userData = (): string => app.getPath("userData");
const documents = (): string => app.getPath("documents"); // OneDrive-safe user-dir detection (R5)
const currentSettings = (): Settings => readSettings(userData(), documents());

// The v0.6 object-photo index (lowercased catalog name → absolute file path), rebuilt by
// pct:listThumbnails and read by pct:getThumbnail. Held here so getThumbnail need not re-readdir the
// folder for every visible card: the renderer calls listThumbnails first (boot + on window focus),
// then getThumbnail only for names the list reported. A stale entry (file deleted since) just makes
// nativeImage return empty → the renderer falls back to the glyph.
let thumbnailIndex = new Map<string, string>();

/** Log `message` only when it differs from the last one logged under `key`. For handlers the UI polls
 *  (window focus, a refresh) — the interesting event is the value CHANGING, and a log that repeats itself
 *  is a log nobody reads to the end of. */
const lastLogged = new Map<string, string>();
function logOnce(key: string, message: string): void {
  if (lastLogged.get(key) === message) return;
  lastLogged.set(key, message);
  log.info(message);
}

/** The AFS4 user folder to write into, from settings or auto-detect. Throws a plain (→ "io") error
 *  the renderer can surface — the wizard/Settings is where the user fixes it. */
function afs4UserDirOrThrow(): string {
  const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
  if (!dir) throw new Error("AFS4 user folder is not set — choose it in Settings.");
  return dir;
}

/** The photo folder the user chose in Settings (v0.6), or throw NoPhotosDirError. v0.7 keeps the folder
 *  opt-in: "Paste photo" fails clearly and the renderer sends the user to Settings, rather than PCT
 *  inventing a write location behind their back. */
function photosDirOrThrow(): string {
  const dir = currentSettings().thumbnailsDir;
  if (!dir) throw new NoPhotosDirError();
  return dir;
}

/** Map a typed core/main error to the serialization-safe PctError the renderer can switch on. */
function toPctError(e: unknown): PctError {
  if (e instanceof NoXrefError) return { code: "no-xref", message: e.message, installDir: e.installDir };
  if (e instanceof NeedsElevationError) {
    return { code: "needs-elevation", message: e.message, points: e.points };
  }
  if (e instanceof UnsupportedInAutoheightError) {
    return { code: "unsupported-in-autoheight", message: e.message, points: e.points, reason: e.reason };
  }
  if (e instanceof UnsupportedSchemaVersionError) {
    return { code: "unsupported-schema", message: e.message, found: e.found };
  }
  if (e instanceof FolderExistsError) {
    return { code: "folder-exists", message: e.message, folderName: e.folderName };
  }
  if (e instanceof NoPhotosDirError) return { code: "no-photos-dir", message: e.message };
  if (e instanceof ClipboardEmptyError) return { code: "clipboard-empty", message: e.message };
  if (e instanceof InvalidHeliportIdentityError) {
    return { code: "invalid-identity", message: identityProblemText(e.problem) };
  }
  if (e instanceof IcaoTakenError) {
    return { code: "icao-taken", message: e.message, icao: e.icao };
  }
  if (e instanceof UnsafeCountryError) return { code: "invalid-identity", message: e.message };
  if (e instanceof UnsafeFolderNameError) return { code: "invalid-project", message: e.message };
  if (e instanceof ZodError) return { code: "invalid-project", message: e.message };
  return { code: "io", message: e instanceof Error ? e.message : String(e) };
}

/** Run a fallible handler body and wrap its outcome in a PctResult envelope — and record the failure in
 *  the session log. EVERY expected failure in PCT already funnels through here, so this is the one place
 *  worth logging from: no handler has to remember to, and none can forget.
 *
 *  The two buckets are logged differently on purpose. A typed code (folder-exists, clipboard-empty, …) is
 *  the app working — the user asked for something it declined — so it is a `warn` and its message says
 *  everything; a stack would be noise. `io` is the unexpected bucket, the one that means a bug or a broken
 *  install, and there the stack is the whole point. */
async function guarded<T>(channel: string, fn: () => T | Promise<T>): Promise<PctResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const error = toPctError(e);
    if (error.code === "io") log.error(`${channel} failed: ${error.message}`, e);
    else log.warn(`${channel} refused [${error.code}]: ${error.message}`);
    return { ok: false, error };
  }
}

// ── Dialogs (parented to the focused window when there is one) ─────────────────
// After a native dialog closes we explicitly refocus the webContents. On Windows, Electron can leave
// the window looking focused while key events stop reaching the page until an OS-level refocus — the
// prime suspect for Bug A ("search rejects typing after a wizard boot": the wizard's Browse is the only
// native dialog on that path). Refocusing is a no-op when focus is already correct, so it is safe on all
// paths. UNVERIFIED on-device — confirm via the in-sim protocol.
async function showOpenFile(opts: OpenDialogOptions): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const r = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts));
  win?.webContents.focus();
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
}
async function showSaveFile(opts: SaveDialogOptions): Promise<string | null> {
  const win = BrowserWindow.getFocusedWindow();
  const r = await (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts));
  win?.webContents.focus();
  return r.canceled || !r.filePath ? null : r.filePath;
}
/** Default the Open dialog to the AFS4 `scenery/poi/` folder (forum #89-4) — where most users keep
 *  their POIs. Best-effort: returns undefined (→ OS default / last-used dir) when the user folder isn't
 *  set/detected or scenery/poi doesn't exist yet. */
function poiOpenDir(): string | undefined {
  const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
  if (!dir) return undefined;
  const root = poiRoot(dir);
  return existsSync(root) ? root : undefined;
}
const pickOpenProject = (): Promise<string | null> =>
  showOpenFile({
    title: "Open PCT project",
    properties: ["openFile"],
    filters: PROJECT_FILTER,
    defaultPath: poiOpenDir(),
  });
const pickSaveProject = (project: Project): Promise<string | null> =>
  showSaveFile({
    title: "Save PCT project",
    defaultPath: `${project.poiName || project.name || "project"}.json`,
    filters: PROJECT_FILTER,
  });
const pickExportFolder = (): Promise<string | null> =>
  showOpenFile({ title: "Export POI to folder", properties: ["openDirectory", "createDirectory"] });
const pickDirectory = (title: string): Promise<string | null> =>
  showOpenFile({ title, properties: ["openDirectory"] });

/** Export: resolve heights (manual base, else the elevation provider), plan the POI, and write it —
 *  into scenery/poi/ (install) or a chosen folder. Returns null only when choose-folder is cancelled. */
async function runExport(project: Project, opts: ExportOptions): Promise<InstallResult | null> {
  const settings = currentSettings();
  log.info(
    formatExportSummary({
      poiName: project.poiName,
      objects: project.objects.length,
      heightMode: project.heightMode, // absent ≡ "baked-asl" — resolved inside the formatter
      target: opts.target,
      overwrite: opts.overwrite,
      baseElevation: opts.baseElevation,
      heliport: opts.heliport,
    }),
  );
  // Autoheight mode is fully OFFLINE — the sim resolves the terrain, so there is no elevation lookup and
  // baseElevation is ignored (resolveHeightsAgl throws UnsupportedInAutoheightError on an asl height / a
  // light, which toPctError surfaces). Baked-asl keeps the manual-base / provider path unchanged.
  const resolved =
    project.heightMode === "autoheight"
      ? resolveHeightsAgl(project.objects)
      : opts.baseElevation != null
        ? resolveHeightsFlat(project.objects, opts.baseElevation)
        : await resolveHeights(project.objects, settings.elevation.provider, {
            cacheDir: userData(),
            version: app.getVersion(),
          });
  const plan = planExport(project, resolved, { heliport: opts.heliport });
  // Where the bundled anchor mesh+texture live (anchorAsset.ts). writePoi copies them into any POI that
  // carries the anchor — plants (baked-asl) or every non-empty autoheight POI; others ship none.
  const assetsDir = anchorAssetsDir({
    env: process.env,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });

  // Where it actually LANDED, verbatim. "I exported it and the sim doesn't see it" is answered by this
  // one line far more often than by anything the user can describe.
  const done = (r: InstallResult): InstallResult => {
    log.info(`export ok — ${r.installed ? "installed" : "written"} to ${r.path}`);
    for (const w of r.warnings) log.warn(`export warning: ${w}`);
    return r;
  };

  if (opts.target === "install") {
    const w = writePoi(plan, poiRoot(afs4UserDirOrThrow()), { overwrite: opts.overwrite, assetsDir });
    writeProjectSidecar(w.path, project); // #89-3: re-openable copy beside the POI
    return done({ folderName: w.folderName, path: w.path, installed: true, warnings: plan.warnings });
  }
  const chosen = await pickExportFolder();
  if (!chosen) {
    log.info("export cancelled at the folder picker");
    return null;
  }
  const w = writePoi(plan, chosen, { overwrite: opts.overwrite, assetsDir });
  writeProjectSidecar(w.path, project); // #89-3: re-openable copy beside the POI
  return done({ folderName: w.folderName, path: w.path, installed: false, warnings: plan.warnings });
}

/** Install the project as a heliport: an airport folder under scenery/airports/<country>/.
 *
 *  This is the only path that writes outside scenery/poi/, so the refusals come BEFORE the write and in
 *  this order: the identity must be well-formed (planHeliport throws if it isn't), and the code must be
 *  free on this machine RIGHT NOW — re-scanned here, not read from the memo the dialog warmed up, because
 *  a dialog can sit open while another add-on is installed. */
async function runHeliportInstall(project: Project, opts: HeliportInstallOptions): Promise<InstallResult> {
  const settings = currentSettings();
  const userDir = afs4UserDirOrThrow();
  const icao = opts.identity.icao.trim().toLowerCase();
  const identity = { ...opts.identity, icao, country: opts.identity.country.trim().toLowerCase() };

  log.info(
    `heliport install "${identity.icao}" (${identity.country}) — ${project.objects.length} objects, ` +
      `pad ${opts.heliport.objectId ?? "at POI anchor"}, r=${opts.heliport.radiusM} m`,
  );

  const resolved =
    project.heightMode === "autoheight"
      ? resolveHeightsAgl(project.objects)
      : opts.baseElevation != null
        ? resolveHeightsFlat(project.objects, opts.baseElevation)
        : await resolveHeights(project.objects, settings.elevation.provider, {
            cacheDir: userData(),
            version: app.getVersion(),
          });

  const plan = planHeliport(project, resolved, { identity, heliport: opts.heliport });

  // The collision check, AFTER planning because it needs the destination. Re-scanned rather than read
  // from the dialog's memo: a dialog can sit open while another add-on lands.
  //
  // The one code that is NOT a collision is the one already sitting in the folder we are about to
  // replace — our own, from a previous run. Without this, re-installing a heliport after editing the
  // project refuses itself, which is both wrong and impossible to explain.
  const replacing = listInstalledHeliports(userDir).find(
    (h) => h.country === plan.country && h.folderName === plan.folderName && h.icao.toLowerCase() === icao,
  );
  if (replacing === undefined && takenIcaos(settings.installDir, userDir, { refresh: true }).has(icao)) {
    log.warn(`heliport refused — code "${icao}" is already an airport on this machine`);
    throw new IcaoTakenError(icao);
  }

  const assetsDir = anchorAssetsDir({
    env: process.env,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
  const w = writePoi(plan, airportRoot(userDir, plan.country), {
    overwrite: opts.overwrite,
    assetsDir,
  });
  writeProjectSidecar(w.path, project); // same as a POI: the folder can be reopened in PCT
  forgetTakenIcaos(); // the code we just used is now taken
  log.info(`heliport ok — installed to ${w.path}`);
  for (const warn of plan.warnings) log.warn(`heliport warning: ${warn}`);
  return { folderName: w.folderName, path: w.path, installed: true, warnings: plan.warnings };
}

/** Load the optional official overlay, scan, cache the catalog, and record lastScanAt. Shared by
 *  pct:scan and the post-registration rescan so a freshly registered bundle appears with zero new read
 *  code. Scan warnings (a corrupt .tmi, an entry with no bbox) + any overlay-load warning are handed
 *  back — the wizard/result surface shows them, instead of an object silently missing looking like a bug. */
function scanAndCache(installDir: string, userXrefDir: string | null): ScanResult {
  const load = loadXrefTable(defaultXrefTableCandidates(process.env, process.resourcesPath));
  const { catalog, warnings } = scanXref(installDir, userXrefDir, undefined, load.table);
  writeCatalogCache(userData(), catalog);
  writeSettings(userData(), { lastScanAt: catalog.scannedAt }, documents());
  const all = [...load.warnings, ...warnings];
  // The per-KIND counts, not just a total: "plants 0" is the entire diagnosis of "trees don't load", and
  // it is invisible in a total of 900. Warnings are listed, not counted — a scan that quietly dropped a
  // corrupt .tmi looks exactly like a PCT bug from the outside.
  log.info(
    `scan ok — ${catalog.xref.length} xref in ${catalog.bundles.length} bundles, ` +
      `${catalog.plants.length} plants, ${catalog.airportLights.length} airport lights` +
      (catalog.xrefTable ? `, xref_table ${catalog.xrefTable.matched}/${catalog.xrefTable.rows} matched` : "") +
      ` · install ${installDir} · user xref ${userXrefDir ?? "— none —"}`,
  );
  for (const w of all) log.warn(`scan warning: ${w}`);
  return { catalog, warnings: all };
}

export function registerIpc(): void {
  // ── Detect / scan / settings (M1e-2a) ──
  ipcMain.handle(
    "pct:detectPaths",
    (): DetectResult => ({ installDirs: detectInstallDirs(), userDir: detectUserDir(documents()) }),
  );

  ipcMain.handle("pct:scan", (_e, installDir: string, userXrefDir: string | null) =>
    guarded("scan", (): ScanResult => scanAndCache(installDir, userXrefDir)),
  );

  // ── User-XREF registration (design B2) — main owns the user dir + the rescan (P0-2: no paths in) ──
  ipcMain.handle("pct:planXrefRegistration", () =>
    guarded("planXrefRegistration", (): XrefRegistrationPlan => {
      const plan = planXrefRegistration(afs4UserDirOrThrow());
      return {
        registerable: plan.registerable.map((b) => ({
          base: b.base,
          geometries: b.geometries.length,
          ttx: b.ttx.length,
          missingTextures: b.missingTextures,
        })),
        skipped: plan.skipped.map((s) => ({ name: path.basename(s.path), reason: s.reason })),
      };
    }),
  );
  ipcMain.handle("pct:registerXref", () =>
    guarded("registerXref", (): XrefRegistrationResult => {
      const userDir = afs4UserDirOrThrow();
      const result = registerXref(userDir, userData());
      // Rescan so the renderer just reloads the fresh catalog: a registered bundle now resolves via its
      // generated .tmi and the loose original is gone. Needs the install dir the user already scanned with.
      const installDir = currentSettings().installDir;
      if (!installDir) throw new Error("Scan your Aerofly install first, then register.");
      const scan = scanAndCache(installDir, userDir);
      log.info(`registerXref ok — ${result.registered.length} bundles registered under ${userDir}`);
      for (const w of result.warnings) log.warn(`registerXref warning: ${w}`);
      return { registered: result.registered.length, scan, warnings: result.warnings };
    }),
  );

  ipcMain.handle("pct:getCachedCatalog", (): Catalog | null => readCatalogCache(userData()));

  // ── Object photos (v0.6): a user-chosen folder whose `<name>.<ext>` images replace the glyph ──
  // listThumbnails re-scans the folder and returns the lowercased names that have a photo (the renderer
  // holds them as a Set → which cards even attempt an <img>). getThumbnail resolves ONE name to a small
  // JPEG data URL. Both degrade to "no photo" on any snag — a folder that isn't set, a name with no file,
  // an unreadable image — so the feature can never break a row, only upgrade it.
  ipcMain.handle("pct:listThumbnails", (): string[] => {
    const dir = currentSettings().thumbnailsDir;
    thumbnailIndex = indexThumbnails(dir);
    // "my photos don't show up" splits cleanly on this line: no folder, a folder with 0 usable files, or
    // files present and the name not matching — which is exactly how the dashed-XREF bug looked (#176).
    //
    // Logged only when the ANSWER changes. This handler runs on every window focus, and the v0.7 photo
    // workflow is a loop of alt-tab → screenshot → alt-tab back; logging each call would bury the session
    // in a line that says the same thing thirty times, which is how a log stops being read.
    logOnce("photos", `photos — ${thumbnailIndex.size} usable in ${dir ?? "— no folder set —"}`);
    return [...thumbnailIndex.keys()];
  });
  ipcMain.handle("pct:getThumbnail", (_e, name: string): string | null => {
    if (!isValidThumbName(name)) return null; // not a catalog-shaped name → also blocks path tricks
    const file = thumbnailIndex.get(name.toLowerCase());
    if (file === undefined) return null;
    try {
      const img = nativeImage.createFromPath(file);
      if (!img.isEmpty()) {
        // Downscale the (1080p+) screenshot to a light thumbnail; JPEG keeps the data URL small. resize
        // with width only preserves the aspect ratio, and the renderer object-fit: covers it into the slot.
        return `data:image/jpeg;base64,${img.resize({ width: THUMBNAIL_PX }).toJPEG(80).toString("base64")}`;
      }
      // nativeImage couldn't decode it (some webp builds) — serve the bytes verbatim; the <img> decodes
      // it and the CSP allows `data:`. Only hit for formats resize can't touch, so no size concern in practice.
      const ext = path.extname(file).slice(1).toLowerCase();
      return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${readFileSync(file).toString("base64")}`;
    } catch {
      return null; // unreadable/vanished file → the renderer keeps the glyph
    }
  });

  // ── Object photos: WRITE side (v0.7 "Paste photo") ──
  // The renderer names an OBJECT; main reads the clipboard image itself and writes `<name>.png` into the
  // folder the user chose — no path and no image bytes ever cross FROM the renderer (P0-2). The photo
  // folder stays opt-in (v0.6): with none set we throw NoPhotosDirError so the menu can send the user to
  // Settings, instead of PCT inventing a location. Each write/delete rebuilds the in-memory index so the
  // very next getThumbnail (the card refreshing) resolves the change without waiting for a folder re-scan.
  ipcMain.handle("pct:saveObjectPhoto", (_e, name: string) =>
    guarded("saveObjectPhoto", (): void => {
      const dir = photosDirOrThrow();
      const img = clipboard.readImage();
      if (img.isEmpty()) throw new ClipboardEmptyError();
      const file = photoWritePath(dir, name); // validates the name
      writeFileAtomic(file, img.toPNG());
      thumbnailIndex = indexThumbnails(dir);
      // The FILE PCT chose, not the object the renderer named: the name PCT derives is the whole feature,
      // and a photo written under a name the catalog then can't find is precisely bug #176.
      log.info(`photo pasted — ${name} → ${file}`);
    }),
  );
  ipcMain.handle("pct:deleteObjectPhoto", (_e, name: string) =>
    guarded("deleteObjectPhoto", (): void => {
      const dir = photosDirOrThrow();
      const files = photoFilesForStem(dir, name);
      for (const file of files) rmSync(file, { force: true }); // every extension
      thumbnailIndex = indexThumbnails(dir);
      log.info(`photo removed — ${name} (${files.length} file(s))`);
    }),
  );
  ipcMain.handle("pct:openPhotosDir", async (): Promise<void> => {
    const dir = currentSettings().thumbnailsDir;
    if (dir !== null && existsSync(dir)) await shell.openPath(dir); // best-effort, like revealInFolder
  });

  // ── Footprint overrides (v0.9) ──
  // The user's own width × depth × height for the objects PCT cannot measure — every airport light and
  // plant, which have no `.tmi` and therefore draw as bare dots on the map (forum #126/#129). Kept in
  // their own userData file, NOT in the catalog cache, so a Rescan can't wipe them; applied over the scan
  // in the renderer (core/catalog/footprints). Nothing here ever reaches an exported POI.
  ipcMain.handle("pct:getFootprints", (): FootprintOverrides => readFootprints(userData()));
  ipcMain.handle("pct:setFootprint", (_e, key: string, override: FootprintOverride | null) =>
    guarded("setFootprint", (): FootprintOverrides => {
      // The renderer sends a key it derived from a card, but this is a trust boundary: reject anything
      // that isn't key-shaped rather than writing it into a file the next launch would refuse to parse.
      if (!isValidPhotoKey(key)) throw new Error(`unsafe footprint key: ${key}`);
      const next = setFootprintEntry(readFootprints(userData()), key, override);
      const saved = writeFootprints(userData(), next);
      log.info(
        override === null
          ? `footprint cleared — ${key}`
          : `footprint set — ${key} = ${override.width} × ${override.depth} × ${override.height} m`,
      );
      return saved;
    }),
  );
  ipcMain.handle("pct:importFootprints", () =>
    guarded("importFootprints", async (): Promise<FootprintImport | null> => {
      const file = await showOpenFile({
        title: "Import object footprints",
        properties: ["openFile"],
        filters: FOOTPRINTS_FILTER,
      });
      if (file === null) return null;
      const { merged, added, updated } = mergeFootprints(readFootprints(userData()), readFootprintsFile(file));
      const saved = writeFootprints(userData(), merged);
      log.info(`footprints imported — ${added} new, ${updated} replaced, from ${file}`);
      return { overrides: saved, added, updated, path: file };
    }),
  );
  ipcMain.handle("pct:exportFootprints", () =>
    guarded("exportFootprints", async (): Promise<{ path: string; count: number } | null> => {
      const fp = readFootprints(userData());
      const file = await showSaveFile({
        title: "Export object footprints",
        defaultPath: "pct-footprints.json",
        filters: FOOTPRINTS_FILTER,
      });
      if (file === null) return null;
      writeFileAtomic(file, JSON.stringify(fp, null, 2));
      const count = countFootprints(fp);
      log.info(`footprints exported — ${count} entries to ${file}`);
      return { path: file, count };
    }),
  );
  ipcMain.handle("pct:getSettings", (): Settings => currentSettings());
  ipcMain.handle("pct:setSettings", (_e, patch: Partial<Settings>): Settings => {
    const before = currentSettings();
    const after = writeSettings(userData(), patch, documents());
    // The SAVED value, and only the fields that moved. writeSettings silently keeps the previous path when
    // the new one isn't on disk (Fable I6), so "I changed the folder and nothing happened" is a real
    // outcome — and this is the line that shows the change didn't take.
    for (const key of ["installDir", "afs4UserDir", "thumbnailsDir"] as const) {
      if (after[key] !== before[key]) log.info(`settings — ${key} is now ${after[key] ?? "— not set —"}`);
    }
    if (after.tiles.provider !== before.tiles.provider) log.info(`settings — tiles ${after.tiles.provider}`);
    if (after.elevation.provider !== before.elevation.provider) {
      log.info(`settings — elevation ${after.elevation.provider}`);
    }
    return after;
  });
  ipcMain.handle(
    "pct:chooseDirectory",
    async (_e, purpose: "install-dir" | "user-dir" | "thumbnails-dir"): Promise<string | null> => {
      const title =
        purpose === "install-dir"
          ? "Select the Aerofly FS 4 install folder"
          : purpose === "user-dir"
            ? "Select the Aerofly FS 4 user folder — the one that CONTAINS scenery/"
            : "Select the folder that holds your object photos";
      const dir = await pickDirectory(title);
      // Correct the path HERE, where main hands it back: browse to …\scenery\poi (the old "POI install
      // target" label invited exactly that) and Settings now shows the corrected …\Aerofly FS 4 straight
      // away, instead of quietly writing into …\scenery\poi\scenery\poi\ at the next export. Main owns
      // paths (P0-2), so main owns the correction — the renderer just displays what it is given.
      return dir !== null && purpose === "user-dir" ? normalizeUserDir(dir) : dir;
    },
  );

  // ── Project files (M1e-2b) — main owns the path + dialogs ──
  ipcMain.handle("pct:openProject", () => guarded("openProject", () => openProject(pickOpenProject)));
  ipcMain.handle("pct:saveProject", (_e, project: Project) =>
    guarded("saveProject", () => saveProject(project, () => pickSaveProject(project))),
  );
  ipcMain.handle("pct:saveProjectAs", (_e, project: Project) =>
    guarded("saveProjectAs", () => saveProjectAs(project, () => pickSaveProject(project))),
  );
  ipcMain.handle("pct:autosaveShadow", (_e, project: Project): void => {
    try {
      autosaveShadow(userData(), project);
    } catch {
      /* crash-recovery copy is best-effort — never surface a failure to the renderer */
    }
  });
  ipcMain.handle("pct:loadShadow", (): Project | null => loadShadow(userData()));
  ipcMain.handle("pct:clearShadow", (): void => {
    try {
      clearShadow(userData());
    } catch {
      /* best-effort, same as autosaveShadow */
    }
  });

  // ── Elevation / export / install (M1e-2b) ──
  ipcMain.handle("pct:resolveHeights", (_e, objects: PlacedObject[]) =>
    guarded(
      "resolveHeights",
      (): Promise<ResolvedObject[]> =>
        resolveHeights(objects, currentSettings().elevation.provider, {
          cacheDir: userData(),
          version: app.getVersion(),
        }),
    ),
  );
  ipcMain.handle("pct:exportPoi", (_e, project: Project, opts: ExportOptions) =>
    guarded("exportPoi", () => runExport(project, opts)),
  );
  ipcMain.handle("pct:uninstallPoi", (_e, folderName: string) =>
    guarded("uninstallPoi", (): void => {
      uninstallPoi(afs4UserDirOrThrow(), folderName);
      log.info(`uninstalled POI "${folderName}"`); // PCT deleting a folder is worth a permanent record
    }),
  );
  ipcMain.handle("pct:listInstalledPois", (): InstalledPoi[] => {
    const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
    return dir ? listInstalledPois(dir) : [];
  });
  // ── Heliports ──
  // isIcaoTaken is a READ for live feedback while typing; it deliberately uses the memo, and it is NOT
  // what protects the user — installHeliport re-scans before it writes.
  ipcMain.handle("pct:isIcaoTaken", (_e, icao: string): boolean => {
    const s = currentSettings();
    const dir = s.afs4UserDir ?? detectUserDir(documents());
    return takenIcaos(s.installDir, dir).has(String(icao).trim().toLowerCase());
  });
  ipcMain.handle("pct:installHeliport", (_e, project: Project, opts: HeliportInstallOptions) =>
    guarded("installHeliport", () => runHeliportInstall(project, opts)),
  );
  ipcMain.handle("pct:listInstalledHeliports", (): InstalledHeliport[] => {
    const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
    return dir ? listInstalledHeliports(dir) : [];
  });
  ipcMain.handle("pct:uninstallHeliport", (_e, country: string, folderName: string) =>
    guarded("uninstallHeliport", (): void => {
      uninstallHeliport(afs4UserDirOrThrow(), country, folderName);
      forgetTakenIcaos(); // its code is free again
      log.info(`uninstalled heliport "${folderName}" (${country})`);
    }),
  );
  // ── The session log ──
  // The renderer can WRITE to it (its own uncaught errors — otherwise they die in a DevTools console
  // nobody has open) and ASK FOR IT to be opened. It cannot read it back or name a path: `log` takes a
  // level and a string, `openLog` takes nothing and main opens the one file it owns (P0-2).
  ipcMain.handle("pct:log", (_e, level: LogLevel, message: string): void => {
    // Clamp what crosses the boundary. A renderer bug (or a loop) must not be able to define the log's
    // shape: one line, bounded length, and only the three known levels.
    const clean = String(message).replace(/\r?\n/g, " ⏎ ").slice(0, 2000);
    log.line(level === "error" || level === "warn" ? level : "info", `renderer: ${clean}`);
  });
  ipcMain.handle("pct:openLog", async (): Promise<void> => {
    if (log.file === "") return; // the log could not be opened this session — nothing to show
    // openPath hands it to whatever opens .log (Notepad, Console, an editor) so the user can select-all
    // and paste. It returns a non-empty STRING on failure rather than throwing — a machine with no .log
    // association is common — so fall back to revealing it in the file manager, which always works.
    const problem = await shell.openPath(log.file);
    if (problem !== "") shell.showItemInFolder(log.file);
  });
  ipcMain.handle("pct:getLogPath", (): string => log.file);

  ipcMain.handle("pct:revealInFolder", (_e, folderName: string): void => {
    try {
      const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
      if (!dir) return;
      const target = resolvePoiPath(poiRoot(dir), folderName); // validates the name at the boundary
      if (existsSync(target)) shell.showItemInFolder(target);
    } catch {
      /* reveal is best-effort */
    }
  });
}
