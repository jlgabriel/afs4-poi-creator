// usePct.ts — the app bootstrap hook. Runs once on mount and decides the top-level phase:
//   • no bridge (preview)      → seed the demo catalog + project, go to "editor"
//   • bridge + cached catalog  → load it, start a blank project, go to "editor"
//   • bridge, nothing cached   → "wizard" (first-run; the real wizard lands in M1e-5e)
// The store is seeded BEFORE the editor renders, so MapView (which reads the camera once at mount)
// sees the right project. The `cancelled` latch keeps React 19 StrictMode's double-invoke from
// double-seeding / racing the async IPC reads (which are idempotent anyway).
import { useEffect, useState } from "react";
import * as mutate from "../../core/project/mutate";
import { editorStore } from "../state/editorStore";
import { DEFAULT_CAMERA } from "../state/store";
import { DEMO_CATALOG, demoProject } from "../dev/devFixtures";
import { getPct } from "./pct";
import { decideBootPhase } from "./bootPhase";

export type BootPhase = "loading" | "wizard" | "editor";

export function useBootstrap(): BootPhase {
  const [phase, setPhase] = useState<BootPhase>("loading");

  useEffect(() => {
    let cancelled = false;
    const pct = getPct();
    const store = editorStore.getState();

    // Preview / browser harness: no bridge → seed the demo so the map + panels are interactive.
    if (!pct) {
      store.loadCatalog(DEMO_CATALOG);
      store.newProject(demoProject());
      setPhase("editor");
      return;
    }

    void (async () => {
      const [settings, cached] = await Promise.all([pct.getSettings(), pct.getCachedCatalog()]);
      if (cancelled) return;
      if (cached !== null && decideBootPhase(settings, cached) === "editor") {
        store.loadCatalog(cached);
        store.newProject(mutate.createProject({ name: "", camera: DEFAULT_CAMERA }));
        setPhase("editor");
      } else {
        setPhase("wizard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return phase;
}
