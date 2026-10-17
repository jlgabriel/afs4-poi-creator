// importNotes.ts — the notes of the LAST Import TAP, kept for the session so they can be read again while
// the .tap is being corrected. They describe a file, not the document: never saved, never in undo, and they
// outlive New/Open — only the next import replaces them.
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

export interface ImportNotes {
  fileName: string;
  notes: readonly string[];
}

interface ImportNotesState {
  last: ImportNotes | null;
  open: boolean;
}

export const importNotesStore = createStore<ImportNotesState>(() => ({ last: null, open: false }));

/** A new import's notes. A clean import clears the previous ones, so what is offered always belongs to
 *  the last file imported. Opens the panel when there is something to read. */
export function setImportNotes(fileName: string, notes: readonly string[]): void {
  importNotesStore.setState({ last: notes.length > 0 ? { fileName, notes } : null, open: notes.length > 0 });
}

export function showImportNotes(open: boolean): void {
  importNotesStore.setState({ open: open && importNotesStore.getState().last !== null });
}

export function useImportNotes<T>(selector: (s: ImportNotesState) => T): T {
  return useStore(importNotesStore, selector);
}
