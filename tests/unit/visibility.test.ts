import { describe, expect, it, vi } from "vitest";
import type { PlacedPlant, PlacedXref, Project } from "../../src/core/project/types";
import { createEditorStore } from "../../src/renderer/state/store";
import { hiddenCount, objectGroup, visibleOf } from "../../src/renderer/state/visibility";

const xref = (id: string): PlacedXref => ({
  id,
  kind: "xref",
  name: "tower",
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  direction: 0,
  scale: 1,
});
const plant = (id: string): PlacedPlant =>
  ({ id, kind: "plant", position: { lon: 10, lat: 48 } }) as unknown as PlacedPlant;

const project = (): Project => ({
  schemaVersion: 1,
  app: "pct",
  name: "T",
  poiName: "t",
  createdAt: "2026-07-07T00:00:00Z",
  modifiedAt: "2026-07-07T00:00:00Z",
  reference: null,
  camera: { lon: 10, lat: 48, zoom: 15 },
  objects: [xref("x1"), xref("x2"), plant("p1")],
  airport: {
    icao: "",
    name: "",
    country: "",
    pads: [],
    position: { lon: 10, lat: 48 },
    boundary: [
      { lon: 10, lat: 48 },
      { lon: 10.01, lat: 48 },
      { lon: 10.01, lat: 48.01 },
    ],
    tarmacs: [
      { id: "t1", points: [], level: 1, material: "grass00", brightness: 0.5 },
      { id: "t2", points: [], level: 1, material: "grass00", brightness: 0.5 },
    ],
  },
});

function makeStore() {
  let idn = 0;
  return createEditorStore({
    persist: vi.fn(),
    now: () => 1000,
    newId: () => `id${idn++}`,
    autosaveMs: 500,
    coalesceMs: 800,
    initialProject: project(),
  });
}

describe("map visibility", () => {
  it("leaves out a hidden group and hidden ids, and passes the list through when nothing is hidden", () => {
    const items = project().airport!.tarmacs!;
    const none = { hiddenGroups: new Set<never>(), hiddenIds: new Set<string>() };
    expect(visibleOf(none, "tarmacs", items)).toBe(items);
    expect(visibleOf({ ...none, hiddenIds: new Set(["t1"]) }, "tarmacs", items).map((t) => t.id)).toEqual(["t2"]);
    expect(visibleOf({ hiddenGroups: new Set(["tarmacs"] as const), hiddenIds: new Set() }, "tarmacs", items)).toEqual([]);
    expect(objectGroup(xref("x"))).toBe("objects");
    expect(objectGroup(plant("p"))).toBe("plants");
  });

  it("hides and shows the selection without touching the document, undo or dirty", () => {
    const store = makeStore();
    const before = store.getState().project;
    store.getState().select(["x1", "x2"], false);
    store.getState().toggleHideSelection();
    expect([...store.getState().hiddenIds].sort()).toEqual(["x1", "x2"]);
    expect(store.getState().project).toBe(before);
    expect(store.getState().dirty).toBe(false);
    expect(store.getState().undoStack).toHaveLength(0);
    // Everything selected is hidden ⇒ the same button shows them again.
    store.getState().toggleHideSelection();
    expect(store.getState().hiddenIds.size).toBe(0);
  });

  it("hides the airport point and the boundary by their group, and counts what is hidden", () => {
    const store = makeStore();
    store.getState().selectAirportPart({ kind: "boundary" });
    store.getState().toggleHideSelection();
    expect(store.getState().hiddenGroups.has("boundary")).toBe(true);
    store.getState().selectAirportPart({ kind: "tarmac", id: "t2" });
    store.getState().toggleHideSelection();
    store.getState().setGroupHidden("plants", true);
    const s = store.getState();
    expect(hiddenCount(s, s.project.objects, s.project.airport)).toBe(3);
    store.getState().showAll();
    expect(store.getState().hiddenGroups.size + store.getState().hiddenIds.size).toBe(0);
  });

  it("a new document forgets the hidden elements and keeps the hidden groups", () => {
    const store = makeStore();
    store.getState().setGroupHidden("tarmacs", true);
    store.getState().select(["x1"], false);
    store.getState().toggleHideSelection();
    store.getState().newProject(project());
    expect(store.getState().hiddenIds.size).toBe(0);
    expect(store.getState().hiddenGroups.has("tarmacs")).toBe(true);
  });
});
