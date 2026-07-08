// pct.ts — the renderer's access seam to the Electron main bridge (window.pct) + pure boot logic.
// window.pct is injected by the preload script inside Electron, but is UNDEFINED in the browser
// preview harness (vite.preview.mts). Every call site must go through getPct()/hasPct() and degrade
// gracefully when it's null — that is what keeps `npm run preview:renderer` usable for UI work.
// No React here, so the pure decideBootPhase can be unit-tested under the node vitest config.
import type { PctApi } from "../../shared/pctApi";
import type { Catalog, Settings } from "../../core/project/types";

/** The main-process bridge, or null in a plain browser (preview). */
export function getPct(): PctApi | null {
  return window.pct ?? null;
}

export function hasPct(): boolean {
  return getPct() !== null;
}

/** Real-app boot decision: go straight to the editor only when a scanned catalog is cached AND an
 *  install dir is known; otherwise run the first-run wizard. Pure (window-free) so it's node-testable. */
export function decideBootPhase(settings: Settings, cached: Catalog | null): "wizard" | "editor" {
  return cached !== null && settings.installDir !== null ? "editor" : "wizard";
}
