// ipc.ts — registers one ipcMain handler per PctApi method (design §3.5) and is the app's ONE trust
// boundary: it resolves Electron-owned paths (userData, documents, dialogs), delegates to the pure
// main modules, and maps their typed errors into PctResult envelopes (Fable review P0-1) — because a
// thrown error crossing ipcRenderer.invoke reaches the renderer as a flattened Error with its
// discriminating fields gone. Paths are owned here and never accepted FROM the renderer (P0-2): the
// renderer says WHAT (open / save / install / choose-folder), main decides WHERE via the dialogs.
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import type { Catalog, PlacedObject, Project, ResolvedObject, Settings } from "../core/project/types";
import type {
  DetectResult,
  ExportOptions,
  InstallResult,
  InstalledPoi,
  PctError,
  PctResult,
  ScanResult,
  XrefRegistrationPlan,
  XrefRegistrationResult,
} from "../shared/pctApi";
import {
  NeedsElevationError,
  UnsupportedInAutoheightError,
  resolveHeightsAgl,
  resolveHeightsFlat,
} from "../core/export/heights";
import { planExport } from "../core/export/planExport";
import { UnsupportedSchemaVersionError } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";
import { resolveHeights } from "./elevation";
import {
  FolderExistsError,
  UnsafeFolderNameError,
  listInstalledPois,
  poiRoot,
  resolvePoiPath,
  uninstallPoi,
  writePoi,
} from "./installer";
import { anchorAssetsDir } from "./anchorAsset";
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
import { planXrefRegistration, registerXref } from "./xrefRegistrar";
import { defaultXrefTableCandidates, loadXrefTable } from "./xrefTableSource";
import { normalizeUserDir, readSettings, writeSettings } from "./settings";

const PROJECT_FILTER = [{ name: "PCT project", extensions: ["json"] }];

const userData = (): string => app.getPath("userData");
const documents = (): string => app.getPath("documents"); // OneDrive-safe user-dir detection (R5)
const currentSettings = (): Settings => readSettings(userData(), documents());

/** The AFS4 user folder to write into, from settings or auto-detect. Throws a plain (→ "io") error
 *  the renderer can surface — the wizard/Settings is where the user fixes it. */
function afs4UserDirOrThrow(): string {
  const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
  if (!dir) throw new Error("AFS4 user folder is not set — choose it in Settings.");
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
  if (e instanceof UnsafeFolderNameError) return { code: "invalid-project", message: e.message };
  if (e instanceof ZodError) return { code: "invalid-project", message: e.message };
  return { code: "io", message: e instanceof Error ? e.message : String(e) };
}

/** Run a fallible handler body and wrap its outcome in a PctResult envelope. */
async function guarded<T>(fn: () => T | Promise<T>): Promise<PctResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: toPctError(e) };
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
  const plan = planExport(project, resolved);
  // Where the bundled anchor mesh+texture live (anchorAsset.ts). writePoi copies them into any POI that
  // carries the anchor — plants (baked-asl) or every non-empty autoheight POI; others ship none.
  const assetsDir = anchorAssetsDir({
    env: process.env,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });

  if (opts.target === "install") {
    const w = writePoi(plan, poiRoot(afs4UserDirOrThrow()), { overwrite: opts.overwrite, assetsDir });
    writeProjectSidecar(w.path, project); // #89-3: re-openable copy beside the POI
    return { folderName: w.folderName, path: w.path, installed: true, warnings: plan.warnings };
  }
  const chosen = await pickExportFolder();
  if (!chosen) return null;
  const w = writePoi(plan, chosen, { overwrite: opts.overwrite, assetsDir });
  writeProjectSidecar(w.path, project); // #89-3: re-openable copy beside the POI
  return { folderName: w.folderName, path: w.path, installed: false, warnings: plan.warnings };
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
  return { catalog, warnings: [...load.warnings, ...warnings] };
}

export function registerIpc(): void {
  // ── Detect / scan / settings (M1e-2a) ──
  ipcMain.handle(
    "pct:detectPaths",
    (): DetectResult => ({ installDirs: detectInstallDirs(), userDir: detectUserDir(documents()) }),
  );

  ipcMain.handle("pct:scan", (_e, installDir: string, userXrefDir: string | null) =>
    guarded((): ScanResult => scanAndCache(installDir, userXrefDir)),
  );

  // ── User-XREF registration (design B2) — main owns the user dir + the rescan (P0-2: no paths in) ──
  ipcMain.handle("pct:planXrefRegistration", () =>
    guarded((): XrefRegistrationPlan => {
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
    guarded((): XrefRegistrationResult => {
      const userDir = afs4UserDirOrThrow();
      const result = registerXref(userDir, userData());
      // Rescan so the renderer just reloads the fresh catalog: a registered bundle now resolves via its
      // generated .tmi and the loose original is gone. Needs the install dir the user already scanned with.
      const installDir = currentSettings().installDir;
      if (!installDir) throw new Error("Scan your Aerofly install first, then register.");
      const scan = scanAndCache(installDir, userDir);
      return { registered: result.registered.length, scan, warnings: result.warnings };
    }),
  );

  ipcMain.handle("pct:getCachedCatalog", (): Catalog | null => readCatalogCache(userData()));
  ipcMain.handle("pct:getSettings", (): Settings => currentSettings());
  ipcMain.handle(
    "pct:setSettings",
    (_e, patch: Partial<Settings>): Settings => writeSettings(userData(), patch, documents()),
  );
  ipcMain.handle(
    "pct:chooseDirectory",
    async (_e, purpose: "install-dir" | "user-dir"): Promise<string | null> => {
      const dir = await pickDirectory(
        purpose === "install-dir"
          ? "Select the Aerofly FS 4 install folder"
          : "Select the Aerofly FS 4 user folder — the one that CONTAINS scenery/",
      );
      // Correct the path HERE, where main hands it back: browse to …\scenery\poi (the old "POI install
      // target" label invited exactly that) and Settings now shows the corrected …\Aerofly FS 4 straight
      // away, instead of quietly writing into …\scenery\poi\scenery\poi\ at the next export. Main owns
      // paths (P0-2), so main owns the correction — the renderer just displays what it is given.
      return dir !== null && purpose === "user-dir" ? normalizeUserDir(dir) : dir;
    },
  );

  // ── Project files (M1e-2b) — main owns the path + dialogs ──
  ipcMain.handle("pct:openProject", () => guarded(() => openProject(pickOpenProject)));
  ipcMain.handle("pct:saveProject", (_e, project: Project) =>
    guarded(() => saveProject(project, () => pickSaveProject(project))),
  );
  ipcMain.handle("pct:saveProjectAs", (_e, project: Project) =>
    guarded(() => saveProjectAs(project, () => pickSaveProject(project))),
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
      (): Promise<ResolvedObject[]> =>
        resolveHeights(objects, currentSettings().elevation.provider, {
          cacheDir: userData(),
          version: app.getVersion(),
        }),
    ),
  );
  ipcMain.handle("pct:exportPoi", (_e, project: Project, opts: ExportOptions) =>
    guarded(() => runExport(project, opts)),
  );
  ipcMain.handle("pct:uninstallPoi", (_e, folderName: string) =>
    guarded((): void => uninstallPoi(afs4UserDirOrThrow(), folderName)),
  );
  ipcMain.handle("pct:listInstalledPois", (): InstalledPoi[] => {
    const dir = currentSettings().afs4UserDir ?? detectUserDir(documents());
    return dir ? listInstalledPois(dir) : [];
  });
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
