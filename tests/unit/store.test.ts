import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, PlacedXref, Project } from "../../src/core/project/types";
import { createEditorStore, type EditorDeps } from "../../src/renderer/state/store";

function baseProject(objects: PlacedXref[] = []): Project {
  return {
    schemaVersion: 1,
    app: "pct",
    name: "T",
    poiName: "t",
    createdAt: "2026-07-07T00:00:00Z",
    modifiedAt: "2026-07-07T00:00:00Z",
    reference: null,
    camera: { lon: 10, lat: 48, zoom: 15 },
    objects,
  };
}

const xref = (id: string, over: Partial<PlacedXref> = {}): PlacedXref => ({
  id,
  kind: "xref",
  name: "tower",
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  direction: 0,
  scale: 1,
  ...over,
});

/** A store with a controllable clock, deterministic ids, and a spy autosave sink. */
function makeStore(over: Partial<EditorDeps> = {}) {
  const persist = vi.fn();
  const clock = { t: 1000 };
  let idn = 0;
  const store = createEditorStore({
    persist,
    now: () => clock.t,
    newId: () => `id${idn++}`,
    autosaveMs: 500,
    coalesceMs: 800,
    initialProject: baseProject(),
    ...over,
  });
  return { store, persist, clock };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("commit chokepoint", () => {
  it("a mutation pushes undo, dirties, and clears redo", () => {
    const { store } = makeStore();
    store.getState().renameProject("A");
    const s = store.getState();
    expect(s.project.name).toBe("A");
    expect(s.dirty).toBe(true);
    expect(s.undoStack).toHaveLength(1);
    expect(s.redoStack).toHaveLength(0);
  });

  it("a no-op transform (same reference) changes nothing", () => {
    const { store, persist } = makeStore();
    store.getState().moveObject("nope", { lon: 1, lat: 1 }); // no such id → mutate returns same ref
    const s = store.getState();
    expect(s.dirty).toBe(false);
    expect(s.undoStack).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it("caps the undo stack at 50 snapshots", () => {
    const { store } = makeStore();
    for (let i = 0; i < 55; i++) store.getState().renameProject(`n${i}`);
    expect(store.getState().undoStack).toHaveLength(50);
    expect(store.getState().project.name).toBe("n54");
  });
});

describe("undo / redo", () => {
  it("round-trips and prunes selection to surviving ids", () => {
    const { store } = makeStore();
    const s = store.getState();
    s.armPlacement({ kind: "xref", name: "tower" });
    s.placeAt({ lon: 10, lat: 48 }); // adds id0, selects it
    expect(store.getState().project.objects).toHaveLength(1);
    expect(store.getState().selection).toEqual(["id0"]);

    store.getState().undo(); // object gone
    expect(store.getState().project.objects).toHaveLength(0);
    expect(store.getState().selection).toEqual([]); // pruned — id0 no longer exists

    store.getState().redo(); // back
    expect(store.getState().project.objects).toHaveLength(1);
  });

  it("a fresh commit clears the redo stack", () => {
    const { store } = makeStore();
    const s = store.getState();
    s.renameProject("A");
    s.undo();
    expect(store.getState().redoStack).toHaveLength(1);
    store.getState().renameProject("B");
    expect(store.getState().redoStack).toHaveLength(0);
  });
});

describe("placeAt", () => {
  it("no-ops when nothing is armed", () => {
    const { store } = makeStore();
    store.getState().placeAt({ lon: 10, lat: 48 });
    expect(store.getState().project.objects).toHaveLength(0);
  });

  it("adds + selects the object and keeps placement armed for multi-drop", () => {
    const { store } = makeStore();
    const s = store.getState();
    s.armPlacement({ kind: "xref", name: "tower" });
    s.placeAt({ lon: 10, lat: 48 });
    const st = store.getState();
    expect(st.project.objects[0]).toMatchObject({ id: "id0", name: "tower" });
    expect(st.selection).toEqual(["id0"]);
    expect(st.placing).toEqual({ kind: "xref", name: "tower" }); // still armed
  });

  it("places an airport light from an airport_light spec", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "airport_light", name: "runway_edge_light" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    expect(store.getState().project.objects[0]).toMatchObject({
      id: "id0",
      kind: "airport_light",
      typeName: "runway_edge_light",
    });
  });

  it("places a parametric point light from a light spec", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "light" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    expect(store.getState().project.objects[0]).toMatchObject({ id: "id0", kind: "light" });
  });
});

describe("nudgeHeight — promotion + coalescing", () => {
  it("promotes terrain → terrain-offset and coalesces a rapid run into one undo entry", () => {
    const { store, clock } = makeStore({ coalesceMs: 800 });
    store.getState().openProject("/p", baseProject([xref("a", { height: { mode: "terrain" } })]));

    clock.t = 1000;
    store.getState().nudgeHeight("a", 0.5); // promote → offset 0.5, undo entry #1
    clock.t = 1200;
    store.getState().nudgeHeight("a", 0.5); // within window → coalesced, offset 1.0
    clock.t = 1400;
    store.getState().nudgeHeight("a", 0.5); // coalesced, offset 1.5

    expect(store.getState().project.objects[0].height).toEqual({
      mode: "terrain-offset",
      offset: 1.5,
    });
    expect(store.getState().undoStack).toHaveLength(1);

    store.getState().undo(); // single step back to the original terrain spec
    expect(store.getState().project.objects[0].height).toEqual({ mode: "terrain" });
  });

  it("starts a new undo entry once the coalesce window lapses", () => {
    const { store, clock } = makeStore({ coalesceMs: 800 });
    store.getState().openProject("/p", baseProject([xref("a")]));
    clock.t = 1000;
    store.getState().nudgeHeight("a", 0.5);
    clock.t = 2000; // > 800 ms later
    store.getState().nudgeHeight("a", 0.5);
    expect(store.getState().undoStack).toHaveLength(2);
  });

  it("a commit between nudges breaks coalescing", () => {
    const { store, clock } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a")]));
    clock.t = 1000;
    store.getState().nudgeHeight("a", 0.5); // undo #1
    store.getState().rotateObject("a", 45); // undo #2, resets coalescing
    clock.t = 1100; // still inside the window numerically…
    store.getState().nudgeHeight("a", 0.5); // …but the run was reset → undo #3
    expect(store.getState().undoStack).toHaveLength(3);
  });
});

describe("nudgePosition — coalescing + elevation drop", () => {
  it("coalesces a rapid east run into one undo entry, and undo restores the origin", () => {
    const { store, clock } = makeStore({ coalesceMs: 800 });
    store.getState().openProject("/p", baseProject([xref("a", { position: { lon: 10, lat: 48 } })]));

    clock.t = 1000;
    store.getState().nudgePosition("a", 5, 90); // east, undo entry #1
    clock.t = 1200;
    store.getState().nudgePosition("a", 5, 90); // within window → coalesced

    const st = store.getState();
    expect(st.project.objects[0].position.lon).toBeGreaterThan(10); // moved east
    expect(st.project.objects[0].position.lat).toBeCloseTo(48, 4);
    expect(st.undoStack).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().project.objects[0].position).toEqual({ lon: 10, lat: 48 });
  });

  it("drops the object's cached terrain elevation (like moveObject)", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a")]));
    store.getState().setResolvedElev("a", 500);
    store.getState().nudgePosition("a", 0.5, 0);
    expect(store.getState().resolvedElev.has("a")).toBe(false);
  });

  it("no-ops on a missing id (no undo entry, stays clean)", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a")]));
    store.getState().nudgePosition("ghost", 5, 90);
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(false);
  });
});

describe("deleteSelection / duplicateSelection", () => {
  it("deletes all selected objects in one undo entry and clears selection", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a"), xref("b"), xref("c")]));
    store.getState().select(["a", "b"]);
    store.getState().deleteSelection();

    expect(store.getState().project.objects.map((o) => o.id)).toEqual(["c"]);
    expect(store.getState().selection).toEqual([]);
    expect(store.getState().undoStack).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().project.objects).toHaveLength(3);
  });

  it("duplicates the selection offset east, selecting the copies, in one undo entry", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a", { position: { lon: 10, lat: 48 } })]));
    store.getState().select(["a"]);
    store.getState().duplicateSelection(5);

    const st = store.getState();
    expect(st.project.objects).toHaveLength(2);
    const copy = st.project.objects[1] as PlacedXref;
    expect(copy.name).toBe("tower");
    expect(copy.position.lon).toBeGreaterThan(10); // moved east
    expect(copy.position.lat).toBeCloseTo(48, 4);
    expect(st.selection).toEqual([copy.id]);
    expect(st.undoStack).toHaveLength(1);
  });
});

describe("camera — capture-on-save, not mutate-on-pan", () => {
  it("setMapView is ephemeral: no dirty, no undo, no autosave; serialize stamps it in", () => {
    const { store, persist } = makeStore();
    store.getState().setMapView({ lon: 1, lat: 2, zoom: 9 });
    const s = store.getState();
    expect(s.dirty).toBe(false);
    expect(s.undoStack).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
    expect(s.project.camera).toEqual({ lon: 10, lat: 48, zoom: 15 }); // document untouched
    expect(s.serialize().camera).toEqual({ lon: 1, lat: 2, zoom: 9 }); // …but the snapshot has it
  });

  it("markSaved clears dirty, records the path, and folds the live camera into the document", () => {
    const { store } = makeStore();
    store.getState().renameProject("Edited");
    store.getState().setMapView({ lon: 3, lat: 4, zoom: 12 });
    store.getState().markSaved("/x.json");
    const s = store.getState();
    expect(s.dirty).toBe(false);
    expect(s.projectPath).toBe("/x.json");
    expect(s.project.camera).toEqual({ lon: 3, lat: 4, zoom: 12 });
  });

  it("flyTo recenters via a cameraEpoch bump, ephemerally, zooming in to at least 17", () => {
    const { store, persist } = makeStore();
    const e0 = store.getState().cameraEpoch;
    store.getState().flyTo({ lon: 6.98, lat: 46.27 });
    const s = store.getState();
    expect(s.mapView).toEqual({ lon: 6.98, lat: 46.27, zoom: 17 }); // 15 → 17
    expect(s.cameraEpoch).toBe(e0 + 1); // signals the map to recenter
    expect(s.dirty).toBe(false); // ephemeral — document untouched
    expect(s.undoStack).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });

  it("flyTo keeps the current zoom when already closer than 17", () => {
    const { store } = makeStore();
    store.getState().setMapView({ lon: 0, lat: 0, zoom: 20 });
    store.getState().flyTo({ lon: 1, lat: 2 });
    expect(store.getState().mapView.zoom).toBe(20); // don't zoom back out
  });

  it("flyTo honours an explicit target zoom (airport search frames the field, not object-close)", () => {
    const { store } = makeStore();
    store.getState().setMapView({ lon: 0, lat: 0, zoom: 20 }); // already closer than 17
    store.getState().flyTo({ lon: 2.5479, lat: 49.0097 }, 13);
    expect(store.getState().mapView).toEqual({ lon: 2.5479, lat: 49.0097, zoom: 13 }); // exact override
  });
});

describe("autosave debounce", () => {
  it("debounces rapid commits into one persist carrying the live camera", () => {
    vi.useFakeTimers();
    const { store, persist } = makeStore({ autosaveMs: 500 });
    const s = store.getState();
    s.setMapView({ lon: 11, lat: 49, zoom: 17 });
    s.renameProject("One");
    s.renameProject("Two");
    expect(persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(persist).toHaveBeenCalledTimes(1);
    const snap = persist.mock.calls[0][0] as Project;
    expect(snap.name).toBe("Two");
    expect(snap.camera).toEqual({ lon: 11, lat: 49, zoom: 17 });
  });
});

describe("resolved-elevation cache", () => {
  it("moveObject invalidates the object's cached terrain", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a")]));
    store.getState().setResolvedElev("a", 438);
    expect(store.getState().resolvedElev.get("a")).toBe(438);
    store.getState().moveObject("a", { lon: 10.01, lat: 48.01 });
    expect(store.getState().resolvedElev.has("a")).toBe(false);
  });

  it("setResolvedElev is ephemeral — no dirty, no undo, no autosave", () => {
    const { store, persist } = makeStore({ initialProject: baseProject([xref("a")]) });
    store.getState().setResolvedElev("a", 437.5);
    const s = store.getState();
    expect(s.resolvedElev.get("a")).toBe(437.5);
    expect(s.dirty).toBe(false);
    expect(s.undoStack).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("M2d inspector mutations", () => {
  it("scale / label / lock each commit exactly one undo entry", () => {
    const { store } = makeStore({ initialProject: baseProject([xref("a")]) });
    store.getState().scaleObject("a", 2);
    store.getState().setLabel("a", "north hangar");
    store.getState().setLocked("a", true);
    const o = store.getState().project.objects[0] as PlacedXref;
    expect(o.scale).toBe(2);
    expect(o.label).toBe("north hangar");
    expect(o.locked).toBe(true);
    expect(store.getState().undoStack).toHaveLength(3);
  });

  it("clearing the label and unlocking DROP the optional fields", () => {
    const init = baseProject([xref("a", { label: "x", locked: true })]);
    const { store } = makeStore({ initialProject: init });
    store.getState().setLabel("a", undefined);
    store.getState().setLocked("a", false);
    const o = store.getState().project.objects[0];
    expect("label" in o).toBe(false);
    expect("locked" in o).toBe(false);
  });
});

describe("M2e crash-recovery + autosave lifecycle", () => {
  it("recoverProject loads the shadow as UNSAVED (dirty), resets history/selection, adopts its camera, clears the banner", () => {
    const { store } = makeStore();
    store.getState().renameProject("scratch"); // some history to prove it's reset
    store.getState().select(["ghost"]);
    const shadow = baseProject([xref("r1")]);
    shadow.camera = { lon: 7, lat: 46, zoom: 16 };
    store.getState().setPendingRecovery(shadow);
    store.getState().recoverProject(shadow);
    const s = store.getState();
    expect(s.project.objects.map((o) => o.id)).toEqual(["r1"]);
    expect(s.dirty).toBe(true); // recovered work is unsaved
    expect(s.projectPath).toBeNull();
    expect(s.undoStack).toHaveLength(0);
    expect(s.redoStack).toHaveLength(0);
    expect(s.selection).toEqual([]);
    expect(s.mapView).toEqual({ lon: 7, lat: 46, zoom: 16 });
    expect(s.pendingRecovery).toBeNull(); // banner dismissed by the load
  });

  it("setPendingRecovery is ephemeral — no dirty, no undo", () => {
    const { store } = makeStore();
    store.getState().setPendingRecovery(baseProject([xref("a")]));
    expect(store.getState().pendingRecovery).not.toBeNull();
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toHaveLength(0);
    store.getState().setPendingRecovery(null);
    expect(store.getState().pendingRecovery).toBeNull();
  });

  it("markSaved cancels a pending autosave — a save never leaves a stale shadow behind", () => {
    vi.useFakeTimers();
    const { store, persist } = makeStore({ autosaveMs: 500 });
    store.getState().renameProject("edit"); // schedules the autosave
    store.getState().markSaved("/p.json"); // must cancel it
    vi.advanceTimersByTime(500);
    expect(persist).not.toHaveBeenCalled();
    expect(store.getState().dirty).toBe(false);
  });

  it("loading a document cancels the OUTGOING doc's pending autosave", () => {
    vi.useFakeTimers();
    const { store, persist } = makeStore({ autosaveMs: 500 });
    store.getState().renameProject("edit"); // schedules autosave for the current doc
    store.getState().newProject(baseProject()); // load() cancels it
    vi.advanceTimersByTime(500);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("M2h tile config", () => {
  it("setTiles updates the map provider without dirtying the document (reference data)", () => {
    const { store, persist } = makeStore();
    const tiles = { provider: "custom" as const, customUrl: "https://t/{z}/{x}/{y}.png" };
    store.getState().setTiles(tiles);
    expect(store.getState().tiles).toEqual(tiles);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toHaveLength(0);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("lifecycle", () => {
  it("openProject resets history, dirty, selection, and adopts the project's camera", () => {
    const { store } = makeStore();
    store.getState().renameProject("dirtying");
    store.getState().select(["ghost"]);
    store.getState().openProject("/p.json", baseProject([xref("a")]));
    const s = store.getState();
    expect(s.dirty).toBe(false);
    expect(s.undoStack).toHaveLength(0);
    expect(s.redoStack).toHaveLength(0);
    expect(s.selection).toEqual([]);
    expect(s.projectPath).toBe("/p.json");
    expect(s.mapView).toEqual({ lon: 10, lat: 48, zoom: 15 });
  });

  it("bumps cameraEpoch on document load (open/new) but not on edits or pan (P1-4 re-center signal)", () => {
    const { store } = makeStore();
    const e0 = store.getState().cameraEpoch;
    store.getState().renameProject("edit"); // a document edit…
    expect(store.getState().cameraEpoch).toBe(e0); // …does not re-center
    store.getState().openProject("/p.json", baseProject([xref("a")]));
    expect(store.getState().cameraEpoch).toBe(e0 + 1); // a load re-centers
    store.getState().newProject(baseProject());
    expect(store.getState().cameraEpoch).toBe(e0 + 2);
    store.getState().setMapView({ lon: 1, lat: 2, zoom: 9 }); // panning…
    expect(store.getState().cameraEpoch).toBe(e0 + 2); // …never yanks the view back
  });

  it("loadCatalog indexes objects by exact name", () => {
    const { store } = makeStore();
    const catalog: Catalog = {
      schemaVersion: 1,
      scannedAt: "2026-07-07T00:00:00Z",
      installDir: "/i",
      userXrefDir: null,
      bundles: [],
      xref: [
        { name: "tower_a", bundle: "b", source: "install", bbMin: [0, 0, 0], bbMax: [1, 1, 1], bsRadius: 1, size: { x: 1, y: 1, z: 1 }, category: "buildings/tower", displayName: "Tower A", act: true },
      ],
      plants: [],
      airportLights: [],
      animated: [],
    };
    store.getState().loadCatalog(catalog);
    expect(store.getState().catalogIndex.get("tower_a")?.displayName).toBe("Tower A");
  });

  it("loadAirports holds the airport list as ephemeral reference data (never dirties the document)", () => {
    const { store, persist } = makeStore();
    store.getState().loadAirports([{ icao: "LFPG", name: "Charles de Gaulle", lat: 49.0097, lon: 2.5479 }]);
    expect(store.getState().airports).toHaveLength(1);
    expect(store.getState().dirty).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
