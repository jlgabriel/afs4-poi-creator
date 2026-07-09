// ipc.ts — registers one ipcMain handler per PctApi method (design §3.5) and is the app's ONE trust
// boundary: it resolves Electron-owned paths (userData, documents, dialogs), delegates to the pure
// main modules, and maps their typed errors into PctResult envelopes (Fable review P0-1) — because a
// thrown error crossing ipcRenderer.invoke reaches the renderer as a flattened Error with its
// discriminating fields gone. Paths are owned here and never accepted FROM the renderer (P0-2): the
// renderer says WHAT (open / save / install / choose-folder), main decides WHERE via the dialogs.
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import { existsSync } from "node:fs";
import { ZodError } from "zod";
import type { Catalog, PlacedXref, Project, ResolvedXref, Settings } from "../core/project/types";
import type {
  DetectResult,
  ExportOptions,
  InstallResult,
  InstalledPoi,
  PctError,
  PctResult,
} from "../shared/pctApi";
import { NeedsElevationError, resolveHeightsFlat } from "../core/export/heights";
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
import {
  autosaveShadow,
  loadShadow,
  openProject,
  saveProject,
  saveProjectAs,
} from "./projectFile";
import { NoXrefError, readCatalogCache, scanXref, writeCatalogCache } from "./scan";
import { readSettings, writeSettings } from "./settings";

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
const pickOpenProject = (): Promise<string | null> =>
  showOpenFile({ title: "Open PCT project", properties: ["openFile"], filters: PROJECT_FILTER });
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
  const resolved =
    opts.baseElevation != null
      ? resolveHeightsFlat(project.objects, opts.baseElevation)
      : await resolveHeights(project.objects, settings.elevation.provider, {
          cacheDir: userData(),
          version: app.getVersion(),
        });
  const plan = planExport(project, resolved);

  if (opts.target === "install") {
    const w = writePoi(plan, poiRoot(afs4UserDirOrThrow()), { overwrite: opts.overwrite });
    return { folderName: w.folderName, path: w.path, installed: true, warnings: plan.warnings };
  }
  const chosen = await pickExportFolder();
  if (!chosen) return null;
  const w = writePoi(plan, chosen, { overwrite: opts.overwrite });
  return { folderName: w.folderName, path: w.path, installed: false, warnings: plan.warnings };
}

export function registerIpc(): void {
  // ── Detect / scan / settings (M1e-2a) ──
  ipcMain.handle(
    "pct:detectPaths",
    (): DetectResult => ({ installDirs: detectInstallDirs(), userDir: detectUserDir(documents()) }),
  );

  ipcMain.handle("pct:scan", (_e, installDir: string, userXrefDir: string | null) =>
    guarded((): Catalog => {
      const { catalog } = scanXref(installDir, userXrefDir);
      writeCatalogCache(userData(), catalog);
      writeSettings(userData(), { lastScanAt: catalog.scannedAt }, documents());
      return catalog;
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
    (_e, purpose: "install-dir" | "user-dir"): Promise<string | null> =>
      pickDirectory(
        purpose === "install-dir"
          ? "Select the Aerofly FS 4 install folder"
          : "Select the Aerofly FS 4 user folder",
      ),
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

  // ── Elevation / export / install (M1e-2b) ──
  ipcMain.handle("pct:resolveHeights", (_e, objects: PlacedXref[]) =>
    guarded(
      (): Promise<ResolvedXref[]> =>
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
