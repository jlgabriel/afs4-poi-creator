// pct.ts — the renderer's access seam to the Electron main bridge (window.pct). It is injected by the
// preload script inside Electron, but UNDEFINED in the browser preview harness (vite.preview.mts).
// Every call site goes through getPct()/hasPct() and degrades gracefully when it's null — that is what
// keeps `npm run preview:renderer` usable for UI work. This module touches `window`, so it is
// renderer-only; the pure boot decision lives in bootPhase.ts so it can be node-tested.
import type { PctApi } from "../../shared/pctApi";

/** The main-process bridge, or null in a plain browser (preview). */
export function getPct(): PctApi | null {
  return window.pct ?? null;
}

export function hasPct(): boolean {
  return getPct() !== null;
}
