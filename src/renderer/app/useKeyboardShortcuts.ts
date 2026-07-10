// useKeyboardShortcuts.ts — the one global keydown listener (design §5), mounted once by AppShell.
// Coexists with the map's own Escape-only listener (MapView owns Esc → disarm placement); this hook
// deliberately never touches Escape. Every branch is gated by the P1-4 focus guard so keys do nothing
// while the user is typing in an input. Undo/redo/duplicate/delete/nudge all go through the store
// actions (→ commit → mutate.ts), keeping the map's O(changed) footprint diff intact.
import { useEffect } from "react";
import { editorStore } from "../state/editorStore";
import { arrowToVector, isEditableTarget, lifecycleShortcut } from "./keyboard";
import { doNew, doOpen, doSave, doSaveAs } from "./commands";

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // A modal (the Export dialog) owns the keyboard while open. Its buttons aren't editable targets,
      // so without this the focus guard below lets Delete/arrows/Ctrl+Z mutate the document behind the
      // modal (P1-2). aria-modal is the semantic signal every PCT modal sets — covers Settings in M2 too.
      if (document.querySelector('[aria-modal="true"]') !== null) return;
      const mod = e.ctrlKey || e.metaKey;

      // Project-lifecycle chords (Ctrl+S / Shift+S / O / N) fire BEFORE the focus guard — Ctrl+S must
      // save even while the cursor is in an inspector field. They no-op without the bridge (preview).
      const life = lifecycleShortcut(e.key, mod, e.shiftKey);
      if (life !== null) {
        e.preventDefault(); // else the browser saves the page / opens a file / spawns a window
        if (life === "save") void doSave();
        else if (life === "save-as") void doSaveAs();
        else if (life === "open") void doOpen();
        else doNew();
        return;
      }

      if (isEditableTarget(document.activeElement)) return; // edit shortcuts don't hijack typing (P1-4)
      const store = editorStore.getState();
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

      if (e.key === "Delete" || e.key === "Backspace") {
        // macOS laptops send Backspace for their only delete key (P1-6). Consume it only when there's
        // something to delete, so a bare Backspace isn't swallowed (and never triggers history back-nav).
        if (store.selection.length === 0) return;
        e.preventDefault();
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
