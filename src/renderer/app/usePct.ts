// usePct.ts — the app bootstrap hook. Runs once on mount and decides the top-level phase:
//   • no bridge (preview)      → seed the demo catalog + project, go to "editor"
//   • bridge + cached catalog  → load it, start a blank project, go to "editor"
//   • bridge, nothing cached   → "wizard" (first-run; the real wizard lands in M1e-5e)
// The store is seeded BEFORE the editor renders, so MapView (which reads the camera once at mount)
// sees the right project. The `cancelled` latch keeps React 19 StrictMode's double-invoke from
// double-seeding / racing the async IPC reads (which are idempotent anyway).
import { useCallback, useEffect, useState } from "react";
import * as mutate from "../../core/project/mutate";
import { editorStore } from "../state/editorStore";
import { DEFAULT_CAMERA } from "../state/store";
import { DEMO_CATALOG, demoProject } from "../dev/devFixtures";
import { AIRPORTS } from "../data/airports";
import { getPct } from "./pct";
import { decideBootPhase } from "./bootPhase";

export type BootPhase = "loading" | "wizard" | "editor";

export interface Bootstrap {
  phase: BootPhase;
  showEditor: () => void; // the wizard calls this once it has loaded the catalog
  showWizard: () => void; // TopBar Rescan re-enters the wizard (keeps the open project)
}

export function useBootstrap(): Bootstrap {
  const [phase, setPhase] = useState<BootPhase>("loading");

  useEffect(() => {
    let cancelled = false;
    const pct = getPct();
    const store = editorStore.getState();

    // Bundled sim-airport list for the TopBar search — the same static data on every path (preview or
    // real), so load it once before the branch. Reference data: never saved, never on the undo stack.
    store.loadAirports(AIRPORTS);

    // Preview / browser harness: no bridge → seed the demo so the map + panels are interactive.
    if (!pct) {
      store.loadCatalog(DEMO_CATALOG);
      store.newProject(demoProject());
      setPhase("editor");
      return;
    }

    void (async () => {
      const [settings, cached, shadow] = await Promise.all([
        pct.getSettings(),
        pct.getCachedCatalog(),
        pct.loadShadow(), // a crash-recovery copy from a previous session, or null
      ]);
      if (cancelled) return;
      if (cached !== null && decideBootPhase(settings, cached) === "editor") {
        store.loadCatalog(cached);
        store.setTiles(settings.tiles); // adopt the saved tile provider before the map mounts
        store.newProject(mutate.createProject({ name: "", camera: DEFAULT_CAMERA }));
        // Offer recovery non-blockingly: stash the shadow so the editor shows a Restore/Discard banner
        // (RecoveryBanner). newProject cleared pendingRecovery, so set it AFTER.
        if (shadow !== null) store.setPendingRecovery(shadow);
        setPhase("editor");
      } else {
        setPhase("wizard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const showEditor = useCallback(() => setPhase("editor"), []);
  const showWizard = useCallback(() => setPhase("wizard"), []);
  return { phase, showEditor, showWizard };
}
