// pctApi.ts — the ONE typed contract between the sandboxed renderer and the Electron main process
// (design §3.5). The preload script implements it over ipcRenderer.invoke and exposes it as
// window.pct; main/ipc.ts registers one handler per method. Types only, no runtime code, so it is
// safe to import from any of the three targets (main / preload / renderer).
import type { Catalog, PlacedXref, Project, ResolvedXref, Settings } from "../core/project/types";

export interface DetectResult {
  installDirs: string[];
  userDir: string | null;
}

export interface ExportOptions {
  install: boolean; // copy into the AFS4 user dir's scenery/poi
  overwrite: boolean; // replace an existing folder of the same name
  targetDir?: string; // when not installing: export to this folder instead
}

export interface InstallResult {
  folderName: string;
  path: string; // where the POI folder landed (install dest, or export dir)
  installed: boolean; // true = copied into the AFS4 user dir
  warnings: string[];
}

export interface InstalledPoi {
  folderName: string;
  byPct: boolean; // carries PCT's README marker → safe to offer Uninstall
}

/** Every method is async (IPC). Implemented in preload/index.ts, handled in main/ipc.ts. */
export interface PctApi {
  detectPaths(): Promise<DetectResult>;
  scan(installDir: string, userXrefDir: string | null): Promise<Catalog>;
  getCachedCatalog(): Promise<Catalog | null>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  openProject(): Promise<{ path: string; project: Project } | null>;
  saveProject(project: Project, path: string | null): Promise<string>;
  autosaveShadow(project: Project): Promise<void>;
  loadShadow(): Promise<Project | null>;
  resolveHeights(objects: PlacedXref[]): Promise<ResolvedXref[]>;
  exportPoi(project: Project, opts: ExportOptions): Promise<InstallResult>;
  uninstallPoi(folderName: string): Promise<void>;
  listInstalledPois(): Promise<InstalledPoi[]>;
  revealInFolder(targetPath: string): Promise<void>;
}
