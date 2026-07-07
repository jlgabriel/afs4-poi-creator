// App.tsx — M1e-4 DEV HARNESS (temporary). It seeds a small self-contained catalog + project so the
// map is visible and interactive in the dev server (no scan / IPC required), then renders MapView.
// The real shell — first-run wizard, CatalogPanel, Inspector, TopBar (design §5) — replaces all of
// this in M1e-5; the store + map beneath it are the actual M1e-4 deliverables.
import { useEffect } from "react";
import type { Catalog, CatalogObject } from "../core/project/types";
import * as mutate from "../core/project/mutate";
import { editorStore, useEditor } from "./state/editorStore";
import { MapView } from "./map/MapView";

// A couple of real object names/dimensions from the in-sim matrix (V2/V3), boxed symmetrically about
// the origin for the demo (the true asymmetric bbMin/bbMax come from the scanner in M1e-5).
function demoObject(
  name: string,
  displayName: string,
  category: string,
  [x, y, z]: [number, number, number],
): CatalogObject {
  return {
    name,
    bundle: "demo",
    source: "install",
    bbMin: [-x / 2, -y / 2, 0],
    bbMax: [x / 2, y / 2, z],
    bsRadius: Math.hypot(x, y, z) / 2,
    size: { x, y, z },
    category,
    displayName,
    act: true,
  };
}

const TOWER = "tower00_small_plates_ds_00_08_08";
const HANGAR = "hangar_small_plates_ds_02_15_42";

const DEMO_CATALOG: Catalog = {
  schemaVersion: 1,
  scannedAt: "2026-07-07T00:00:00Z",
  installDir: "(demo)",
  userXrefDir: null,
  bundles: [],
  xref: [
    demoObject(TOWER, "Tower00 Small Plates", "buildings/tower", [8.19, 7.99, 25.9]),
    demoObject(HANGAR, "Hangar Small Plates", "airport/hangar", [15.45, 41.28, 6.83]),
  ],
  plants: [],
  airportLights: [],
  animated: [],
};

function demoProject() {
  let p = mutate.createProject({
    name: "Demo (M1e-4 harness)",
    poiName: "demo",
    camera: { lon: 11.86, lat: 48.37, zoom: 18 },
  });
  p = mutate.addObject(p, mutate.createXref(TOWER, { lon: 11.86, lat: 48.37 }));
  p = mutate.addObject(p, mutate.createXref(HANGAR, { lon: 11.8604, lat: 48.3703 }, { direction: 90 }));
  return p;
}

function Toolbar(): React.ReactElement {
  const objCount = useEditor((s) => s.project.objects.length);
  const selCount = useEditor((s) => s.selection.length);
  const dirty = useEditor((s) => s.dirty);
  const placing = useEditor((s) => s.placing);
  const canUndo = useEditor((s) => s.undoStack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const act = editorStore.getState;

  return (
    <div className="pct-toolbar">
      <strong>PCT · M1e-4 map harness</strong>
      <button onClick={() => act().armPlacement(TOWER)}>Place tower</button>
      <button onClick={() => act().armPlacement(HANGAR)}>Place hangar</button>
      <button onClick={() => act().duplicateSelection()} disabled={selCount === 0}>
        Duplicate
      </button>
      <button onClick={() => act().deleteSelection()} disabled={selCount === 0}>
        Delete
      </button>
      <button onClick={() => act().undo()} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={() => act().redo()} disabled={!canRedo}>
        Redo
      </button>
      <span className="spacer" />
      <span className="readout">
        {objCount} obj · {selCount} sel · {dirty ? "● unsaved" : "○ saved"}
        {placing !== null ? ` · placing ${placing} (Esc to cancel)` : ""}
      </span>
    </div>
  );
}

export function App(): React.ReactElement {
  useEffect(() => {
    const s = editorStore.getState();
    s.loadCatalog(DEMO_CATALOG);
    s.newProject(demoProject());
  }, []);

  return (
    <div className="pct-app">
      <Toolbar />
      <MapView />
    </div>
  );
}
