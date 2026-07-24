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
import type { Catalog, PlacedObject, Project, ResolvedObject, Settings } from "../core/project/types";

export interface DetectResult {
  installDirs: string[];
  userDir: string | null;
}

/** Discriminated, serialization-safe error surface — plain data, survives IPC intact. */
export type PctError =
  | { code: "needs-elevation"; message: string; points: PlacedObject[] }
  // Autoheight export can't represent these objects (heights.ts): "asl" = an absolute height (switch it to
  // Terrain / Terrain+offset, or export in Baked ASL); "lights" = a light kind not yet verified in autoheight.
  | { code: "unsupported-in-autoheight"; message: string; points: PlacedObject[]; reason: "asl" | "lights" }
  | { code: "no-xref"; message: string; installDir: string }
  | { code: "unsupported-schema"; message: string; found: unknown }
  | { code: "invalid-project"; message: string }
  | { code: "folder-exists"; message: string; folderName: string }
  // v0.7 "Paste photo": the photo folder isn't chosen yet (Settings), or the clipboard holds no image.
  | { code: "no-photos-dir"; message: string }
  | { code: "clipboard-empty"; message: string }
  | { code: "io"; message: string };

export type PctResult<T> = { ok: true; value: T } | { ok: false; error: PctError };

/** What a scan produced. `warnings` are NON-fatal parse problems (a corrupt .tmi, an entry missing its
 *  bounding box): the catalog is still usable, just smaller. They used to be discarded in main, which
 *  meant an object silently absent from the catalog looked like a PCT bug rather than a damaged install. */
export interface ScanResult {
  catalog: Catalog;
  warnings: string[];
}

export interface InstallResult {
  folderName: string;
  path: string; // where the POI folder landed (main-produced; safe to reveal)
  installed: boolean; // true = copied into the AFS4 user dir
  warnings: string[];
}

/** One loose user `.tmb` PCT can register, previewed in the register dialog (main-produced, display-only). */
export interface RegistrablePreview {
  base: string; // the bundle/subfolder name it will get
  geometries: number; // geometries that will be indexed (usually 1)
  ttx: number; // textures that will be copied into the bundle
  missingTextures: string[]; // referenced `.ttx` not found beside the `.tmb` → the object may render untextured
}

/** Read-only preview of what registerXref would do (drives the banner → confirm dialog). */
export interface XrefRegistrationPlan {
  registerable: RegistrablePreview[];
  skipped: { name: string; reason: string }[]; // name = the loose `.tmb` filename, for display
}

/** Outcome of a registration: how many landed, the fresh catalog (the renderer just reloads it), warnings. */
export interface XrefRegistrationResult {
  registered: number;
  scan: ScanResult;
  warnings: string[];
}

export interface InstalledPoi {
  folderName: string;
  byPct: boolean; // carries PCT's README marker → safe to offer Uninstall
}

export interface ExportOptions {
  target: "install" | "choose-folder"; // main resolves the destination; renderer names no path
  overwrite: boolean;
  // Manual terrain ASL for the WHOLE POI — the offline / needs-elevation fallback (design R1, and
  // the CLI's --base-elevation). When set, export skips the network lookup and resolves every
  // terrain-relative height against this one value; when absent, main uses the elevation provider
  // and may return a `needs-elevation` envelope the renderer answers by re-exporting WITH a base.
  baseElevation?: number;
}

/** Async (IPC). Implemented in preload/index.ts, handled in main/ipc.ts. Fallible methods return a
 *  PctResult; infallible reads (detect / getSettings / caches) return plain values. `null` from a
 *  project method means the user cancelled a dialog. */
export interface PctApi {
  detectPaths(): Promise<DetectResult>;
  scan(installDir: string, userXrefDir: string | null): Promise<PctResult<ScanResult>>;
  getCachedCatalog(): Promise<Catalog | null>;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  // Native folder picker for the first-run wizard / Settings — main runs the dialog. Returns the
  // chosen path OUTward for display + a follow-up scan(installDir, …) / setSettings; the P0-2 rule
  // forbids paths flowing IN, not out (same as detectPaths → scan). null = the user cancelled.
  chooseDirectory(purpose: "install-dir" | "user-dir" | "thumbnails-dir"): Promise<string | null>;

  // Object photos (v0.6). listThumbnails re-scans the settings.thumbnailsDir folder and returns the
  // lowercased catalog names that have a `<name>.<ext>` photo; getThumbnail resolves one name to a small
  // JPEG data URL (or null — no folder / no file / unreadable). The renderer never sends a path (P0-2):
  // it names an OBJECT, main maps it to a file within the one folder the user chose.
  listThumbnails(): Promise<string[]>;
  getThumbnail(name: string): Promise<string | null>;
  // v0.7 — populate that folder from PCT. The renderer names an OBJECT (never a path or the bytes — P0-2);
  // main reads the clipboard image itself and writes `<name>.png`, so the file is named right by
  // construction. saveObjectPhoto → "no-photos-dir"/"clipboard-empty" on the two expected snags;
  // deleteObjectPhoto clears every extension of the stem; openPhotosDir reveals the folder (best-effort).
  saveObjectPhoto(name: string): Promise<PctResult<void>>;
  deleteObjectPhoto(name: string): Promise<PctResult<void>>;
  openPhotosDir(): Promise<void>;

  // Project files — main owns the path + dialogs (P0-2). A returned `path` is for display only.
  openProject(): Promise<PctResult<{ path: string; project: Project } | null>>;
  saveProject(project: Project): Promise<PctResult<{ path: string } | null>>;
  saveProjectAs(project: Project): Promise<PctResult<{ path: string } | null>>;
  autosaveShadow(project: Project): Promise<void>;
  loadShadow(): Promise<Project | null>;
  clearShadow(): Promise<void>; // drop the shadow after a save or a declined recovery

  // User-XREF registration (design B2): turn loose scenery/xref/*.tmb into resolvable subfolder bundles.
  // No args — main uses its known user dir (P0-2). planXrefRegistration is read-only (the dialog preview);
  // registerXref writes, then rescans, so the renderer just reloads `result.scan.catalog`.
  planXrefRegistration(): Promise<PctResult<XrefRegistrationPlan>>;
  registerXref(): Promise<PctResult<XrefRegistrationResult>>;

  resolveHeights(objects: PlacedObject[]): Promise<PctResult<ResolvedObject[]>>;
  // `null` value = the user cancelled the choose-folder dialog (target "install" never cancels).
  exportPoi(project: Project, opts: ExportOptions): Promise<PctResult<InstallResult | null>>;
  uninstallPoi(folderName: string): Promise<PctResult<void>>;
  listInstalledPois(): Promise<InstalledPoi[]>;
  revealInFolder(folderName: string): Promise<void>; // main validates + resolves within known roots
}
