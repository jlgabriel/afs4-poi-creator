// pctApi.ts — the ONE typed contract between the sandboxed renderer and Electron main (design §3.5),
// hardened per the Fable review 2026-07-07 (P0-1, P0-2). Two rules from that review:
//   1. Errors do NOT survive ipcRenderer.invoke (the renderer gets a flattened Error, losing
//      name/points/installDir). So every method that can fail in an EXPECTED way returns a
//      `PctResult` envelope with a discriminated `PctError.code`; the renderer switches on the code
//      (e.g. lists a needs-elevation's `points`). The core keeps throwing typed errors; main/ipc.ts
//      maps them into the envelope (pure transport).
//   2. No file path ever crosses FROM the renderer INTO main. Main owns the current project path and
//      every dialog; the renderer only says WHAT (save / save-as / install / choose-folder), never
//      WHERE. (Paths flowing back OUT, for display, are fine — they are main-produced.)
// Types only, no runtime code — safe to import from any target (main / preload / renderer).
import type { Catalog, PlacedXref, Project, ResolvedXref, Settings } from "../core/project/types";

export interface DetectResult {
  installDirs: string[];
  userDir: string | null;
}

/** Discriminated, serialization-safe error surface — plain data, survives IPC intact. */
export type PctError =
  | { code: "needs-elevation"; message: string; points: PlacedXref[] }
  | { code: "no-xref"; message: string; installDir: string }
  | { code: "unsupported-schema"; message: string; found: unknown }
  | { code: "invalid-project"; message: string }
  | { code: "folder-exists"; message: string; folderName: string }
  | { code: "io"; message: string };

export type PctResult<T> = { ok: true; value: T } | { ok: false; error: PctError };

export interface InstallResult {
  folderName: string;
  path: string; // where the POI folder landed (main-produced; safe to reveal)
  installed: boolean; // true = copied into the AFS4 user dir
  warnings: string[];
}

export interface InstalledPoi {
  folderName: string;
  byPct: boolean; // carries PCT's README marker → safe to offer Uninstall
}

export interface ExportOptions {
  target: "install" | "choose-folder"; // main resolves the destination; renderer names no path
  overwrite: boolean;
}

/** Async (IPC). Implemented in preload/index.ts, handled in main/ipc.ts. Fallible methods return a
 *  PctResult; infallible reads (detect / getSettings / caches) return plain values. `null` from a
 *  project method means the user cancelled a dialog. */
export interface PctApi {
  detectPaths(): Promise<DetectResult>;
  scan(installDir: string, userXrefDir: string | null): Promise<PctResult<Catalog>>;
  getCachedCatalog(): Promise<Catalog | null>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;

  // Project files — main owns the path + dialogs (P0-2). A returned `path` is for display only.
  openProject(): Promise<PctResult<{ path: string; project: Project } | null>>;
  saveProject(project: Project): Promise<PctResult<{ path: string } | null>>;
  saveProjectAs(project: Project): Promise<PctResult<{ path: string } | null>>;
  autosaveShadow(project: Project): Promise<void>;
  loadShadow(): Promise<Project | null>;

  resolveHeights(objects: PlacedXref[]): Promise<PctResult<ResolvedXref[]>>;
  exportPoi(project: Project, opts: ExportOptions): Promise<PctResult<InstallResult>>;
  uninstallPoi(folderName: string): Promise<PctResult<void>>;
  listInstalledPois(): Promise<InstalledPoi[]>;
  revealInFolder(folderName: string): Promise<void>; // main validates + resolves within known roots
}
