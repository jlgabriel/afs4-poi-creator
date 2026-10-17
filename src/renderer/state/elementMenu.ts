// elementMenu.ts — where the right-click menu of a placed element is open, if it is. The menu acts on the
// SELECTION (the right-click selects first), so all it needs to know is where to appear. Opened from the
// placed list's rows and from the map's shapes, which share no component to hold this in.
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

interface ElementMenuState {
  at: { x: number; y: number } | null;
}

export const elementMenuStore = createStore<ElementMenuState>(() => ({ at: null }));

export function openElementMenu(x: number, y: number): void {
  elementMenuStore.setState({ at: { x, y } });
}

export function closeElementMenu(): void {
  elementMenuStore.setState({ at: null });
}

export function useElementMenu<T>(selector: (s: ElementMenuState) => T): T {
  return useStore(elementMenuStore, selector);
}
