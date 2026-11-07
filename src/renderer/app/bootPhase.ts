// bootPhase.ts — the pure first-run decision, split out of pct.ts so it stays DOM-global-free and can
// be unit-tested under the node config (pct.ts touches `window` and is renderer-only, so a node test
// importing it would fail to resolve `window`).
import type { Catalog, Settings } from "../../core/project/types";

/** Go straight to the editor only when a scanned catalog is cached AND an install dir is known, or the
 *  catalog was scanned without one on purpose (its `installDir` is null); otherwise run the first-run
 *  wizard. */
export function decideBootPhase(settings: Settings, cached: Catalog | null): "wizard" | "editor" {
  if (cached === null) return "wizard";
  return settings.installDir !== null || cached.installDir === null ? "editor" : "wizard";
}
