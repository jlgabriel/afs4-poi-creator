// commands.ts — the IPC↔store orchestration the TopBar delegates to. The store never calls IPC and
// IPC never touches the store; this thin layer is the one place they meet (P0-2: main owns paths +
// dialogs, the renderer only says WHAT). Every command no-ops without the bridge so preview stays
// safe; the buttons are also disabled there, this is belt-and-suspenders.
import * as mutate from "../../core/project/mutate";
import type { PlacedXref } from "../../core/project/types";
import type { PctError } from "../../shared/pctApi";
import { editorStore } from "../state/editorStore";
import { DEFAULT_CAMERA } from "../state/store";
import { getPct } from "./pct";

/** Minimal error surfacing for M1e-5 — a proper toast/banner is M2. */
function reportError(error: PctError): void {
  window.alert(error.message);
}

/** New blank project (no IPC). Confirms first if there are unsaved changes. */
export function doNew(): void {
  const store = editorStore.getState();
  if (store.dirty && !window.confirm("Discard unsaved changes and start a new project?")) return;
  store.newProject(mutate.createProject({ name: "", camera: DEFAULT_CAMERA }));
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
}

/** Save the current project (main saves to the known path, or prompts Save-As the first time). */
export async function doSave(): Promise<void> {
  const pct = getPct();
  if (!pct) return;
  const res = await pct.saveProject(editorStore.getState().serialize());
  if (!res.ok) return reportError(res.error);
  if (res.value === null) return; // user cancelled the Save-As dialog
  editorStore.getState().markSaved(res.value.path);
}

export type FetchResult = { ok: true } | { ok: false; message: string };

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
  const probe: PlacedXref = { ...obj, height: { mode: "terrain" } };
  const res = await pct.resolveHeights([probe]);
  if (!res.ok) return { ok: false, message: res.error.message };
  const terrainAsl = res.value[0]?.heightAsl;
  if (terrainAsl === undefined) return { ok: false, message: "No elevation returned." };
  editorStore.getState().setResolvedElev(id, terrainAsl);
  return { ok: true };
}
