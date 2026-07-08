// bootPhase.ts — the pure first-run decision, split out of pct.ts so it stays DOM-global-free and can
// be unit-tested under the node config (pct.ts touches `window` and is renderer-only, so a node test
// importing it would fail to resolve `window`).
import type { Catalog, Settings } from "../../core/project/types";

/** Go straight to the editor only when a scanned catalog is cached AND an install dir is known;
 *  otherwise run the first-run wizard. */
export function decideBootPhase(settings: Settings, cached: Catalog | null): "wizard" | "editor" {
  return cached !== null && settings.installDir !== null ? "editor" : "wizard";
}
