// commands.ts — the IPC↔store orchestration the TopBar delegates to. The store never calls IPC and
// IPC never touches the store; this thin layer is the one place they meet (main owns paths + dialogs,
// the renderer only says WHAT). Every command no-ops without the bridge so preview stays
// safe; the buttons are also disabled there, this is belt-and-suspenders.
import * as mutate from "../../core/project/mutate";
import { firstProjectError } from "../../core/project/schemas";
import type { LonLat, PlacedObject, Project } from "../../core/project/types";
import type { PctError } from "../../shared/pctApi";
import { editorStore } from "../state/editorStore";
import { DEFAULT_CAMERA } from "../state/store";
import { setImportNotes } from "../state/importNotes";
import { getPct } from "./pct";

/** Minimal error surfacing: a native alert. */
function reportError(error: PctError): void {
  window.alert(error.message);
}

/** Save-time safety net: the editor must never write a document its own loader would
 *  reject (an out-of-range or non-finite coordinate), which would lock the project out on the next
 *  open. The Inspector's input clamps stop the common cases; this closes the whole class for any path
 *  that slips through. Returns the project to write, or null after warning (nothing is written). */
function validatedProjectToSave(): Project | null {
  const project = editorStore.getState().serialize();
  const problem = firstProjectError(project);
  if (problem === null) return project;
  reportError({
    code: "invalid-project",
    message: `Can't save — the project has a value Aerofly would reject (${problem}). Nothing was written; fix it and save again.`,
  });
  return null;
}

/** New blank project (no IPC). Confirms first if there are unsaved changes. */
export function doNew(): void {
  const store = editorStore.getState();
  if (store.dirty && !window.confirm("Discard unsaved changes and start a new project?")) return;
  store.newProject(mutate.createProject({ name: "", camera: DEFAULT_CAMERA }));
  void getPct()?.clearShadow(); // the discarded document's shadow is moot; a fresh edit re-arms it
}

/** Open a project file (main runs the dialog + validates). */
export async function doOpen(): Promise<void> {
  const pct = getPct();
  if (!pct) return;
  const store = editorStore.getState();
  if (store.dirty && !window.confirm("Discard unsaved changes and open another project?")) return;
  const res = await pct.openProject();
  if (!res.ok) return reportError(res.error);
  if (res.value === null) return; // user cancelled the dialog
  editorStore.getState().openProject(res.value.path, res.value.project);
  void pct.clearShadow(); // the opened file IS the saved state → drop the previous doc's shadow
}

/** Import TAP: a `.tap` (and its addendum) opened as a NEW, unsaved project. Confirms first if there are
 *  unsaved changes, like Open. What the import filled in or left out is listed after it loads. */
export async function doImportTap(): Promise<void> {
  const pct = getPct();
  if (!pct) return;
  if (editorStore.getState().dirty && !window.confirm("Discard unsaved changes and import a TAP file?")) return;
  const res = await pct.importTap();
  if (!res.ok) return reportError(res.error);
  if (res.value === null) return; // cancelled
  editorStore.getState().importProject(res.value.project);
  void pct.clearShadow();
  // The notes open in their own scrolling panel and stay for the session (state/importNotes.ts), so they
  // can be read again from the top bar while the .tap is being corrected.
  setImportNotes(res.value.fileName, res.value.warnings);
}

/** Save the current project (main saves to the known path, or prompts Save-As the first time). A
 *  document with no file of its own — new, imported or recovered — always goes through Save As: main's
 *  remembered path may still belong to the project open before it, and must not be written over. */
export async function doSave(): Promise<void> {
  const pct = getPct();
  if (!pct) return;
  if (editorStore.getState().projectPath === null) return doSaveAs();
  const project = validatedProjectToSave();
  if (project === null) return;
  const res = await pct.saveProject(project);
  if (!res.ok) return reportError(res.error);
  if (res.value === null) return; // user cancelled the Save-As dialog
  editorStore.getState().markSaved(res.value.path);
  void pct.clearShadow(); // work is now durable in the file → no crash-recovery copy needed
}

/** Save the project under a NEW path (main always prompts), adopting it as the current file. */
export async function doSaveAs(): Promise<void> {
  const pct = getPct();
  if (!pct) return;
  const project = validatedProjectToSave();
  if (project === null) return;
  const res = await pct.saveProjectAs(project);
  if (!res.ok) return reportError(res.error);
  if (res.value === null) return; // user cancelled the dialog
  editorStore.getState().markSaved(res.value.path);
  void pct.clearShadow();
}

// ── Crash-recovery banner. The shadow found at boot sits in store.pendingRecovery; the banner
// resolves it exactly once. Restore loads it as unsaved work; Discard drops it (store + disk shadow). ──

/** Load the pending crash-recovery shadow as unsaved work. */
export function restoreRecovery(): void {
  const pending = editorStore.getState().pendingRecovery;
  if (pending !== null) editorStore.getState().recoverProject(pending);
}

/** Dismiss the recovery offer and delete the shadow so it never prompts again. */
export function discardRecovery(): void {
  editorStore.getState().setPendingRecovery(null);
  void getPct()?.clearShadow();
}

/** Switch the map tile provider (TopBar quick-switch / Settings). Swaps the map live via the store,
 *  and persists to settings.json so the choice survives a restart. Keeps any configured custom URL so
 *  toggling Satellite ↔ Streets ↔ Custom never loses it. No-ops the persist without the bridge. */
export function setTileProvider(provider: "esri" | "osm" | "custom"): void {
  const tiles = { ...editorStore.getState().tiles, provider };
  editorStore.getState().setTiles(tiles); // live tile swap (MapView subscribes)
  void getPct()?.setSettings({ tiles }); // persist (best-effort; absent in the preview harness)
}

export type FetchResult = { ok: true; asl: number } | { ok: false; message: string };

/** The terrain elevation under a point, for the airport's Elevation field. Same lookup as fetchElevation
 *  below — a terrain-mode probe through resolveHeights — but nothing is cached in the store: the field
 *  keeps the answer for as long as the point does not move. */
export async function fetchTerrainAt(position: LonLat): Promise<FetchResult> {
  const pct = getPct();
  if (!pct) return { ok: false, message: "Elevation lookup needs the desktop app." };
  const probe: PlacedObject = {
    id: "airport",
    kind: "xref",
    name: "airport",
    position,
    height: { mode: "terrain" },
    direction: 0,
    scale: 1,
  };
  const res = await pct.resolveHeights([probe]);
  if (!res.ok) return { ok: false, message: res.error.message };
  const asl = res.value[0]?.heightAsl;
  return asl === undefined ? { ok: false, message: "No elevation returned." } : { ok: true, asl };
}

/** Fetch the terrain elevation under one object and cache it for the inspector (design §5: the height
 *  control "shows the resolved effective ASL value once elevation is known, fetched lazily"). The store
 *  keeps it in the EPHEMERAL resolvedElev map — not the document — and drops it when the object moves.
 *
 *  Key detail: we probe as if the object were TERRAIN-mode so `heightAsl` comes back as the ground ASL
 *  regardless of the object's real mode — an `asl`-mode object would otherwise short-circuit the lookup
 *  (resolveHeight returns its literal value, never touching the network). Returns the outcome so the
 *  caller can show a loading/error state; the store write happens here on success. */
export async function fetchElevation(id: string): Promise<FetchResult> {
  const pct = getPct();
  if (!pct) return { ok: false, message: "Elevation lookup needs the desktop app." };
  const obj = editorStore.getState().project.objects.find((o) => o.id === id);
  if (!obj) return { ok: false, message: "Object no longer exists." };
  const probe: PlacedObject = { ...obj, height: { mode: "terrain" } };
  const res = await pct.resolveHeights([probe]);
  if (!res.ok) return { ok: false, message: res.error.message };
  const terrainAsl = res.value[0]?.heightAsl;
  if (terrainAsl === undefined) return { ok: false, message: "No elevation returned." };
  editorStore.getState().setResolvedElev(id, terrainAsl);
  return { ok: true, asl: terrainAsl };
}
