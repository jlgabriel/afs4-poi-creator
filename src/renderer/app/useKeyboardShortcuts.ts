// useKeyboardShortcuts.ts — the one global keydown listener (design §5), mounted once by AppShell.
// Coexists with the map's own Escape-only listener (MapView owns Esc → disarm placement); this hook
// deliberately never touches Escape. Every branch is gated by the P1-4 focus guard so keys do nothing
// while the user is typing in an input. Undo/redo/duplicate/delete/nudge all go through the store
// actions (→ commit → mutate.ts), keeping the map's O(changed) footprint diff intact.
import { useEffect } from "react";
import { editorStore } from "../state/editorStore";
import { arrowToVector, isEditableTarget } from "./keyboard";

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditableTarget(document.activeElement)) return; // don't hijack typing (P1-4)
      const store = editorStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && key === "d") {
        e.preventDefault(); // else the browser bookmarks the page
        store.duplicateSelection();
        return;
      }
      if (mod) return; // leave every other Ctrl/Cmd combo (reload, devtools, copy…) to the browser

      if (e.key === "Delete") {
        store.deleteSelection();
        return;
      }
      if (key === "r") {
        // Focus the inspector's direction field for quick numeric entry (design §5).
        const el = document.getElementById("pct-inspector-direction");
        if (el instanceof HTMLInputElement) {
          e.preventDefault();
          el.focus();
          el.select();
        }
        return;
      }

      const vec = arrowToVector(e.key, e.shiftKey);
      if (vec !== null && store.selection.length > 0) {
        e.preventDefault(); // else arrows scroll the panels
        for (const id of store.selection) store.nudgePosition(id, vec.deltaM, vec.bearingDeg);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
