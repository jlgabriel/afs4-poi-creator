// editorStore.ts — the renderer's SINGLE editor store instance + the React hook, plus the real
// autosave sink. Split from store.ts so the pure factory stays free of DOM globals (window /
// localStorage) and unit-tests under the node config; everything DOM-coupled lives here and is only
// loaded by the renderer bundle.

import { useStore } from "zustand";
import type { Project } from "../../core/project/types";
import { createEditorStore, type EditorState } from "./store";

const AUTOSAVE_KEY = "pct:autosave";

// Crash-recovery autosave (P1-4): a fast local copy in localStorage + the durable shadow written to
// main's userData. Both are best-effort — a save must never throw out of the debounce timer.
function persist(snapshot: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage full/unavailable — the main-side shadow is the real safety net */
  }
  void window.pct?.autosaveShadow(snapshot);
}

/** The app's editor store. The map layer subscribes to it directly (outside React, P1-5); React
 *  components read it through the `useEditor` hook below. */
export const editorStore = createEditorStore({ persist });

/** Subscribe a React component to a slice of the editor store. */
export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useStore(editorStore, selector);
}
