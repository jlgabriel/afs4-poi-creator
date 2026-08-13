import { afterEach, describe, expect, it, vi } from "vitest";
import type { Catalog, PlacedXref, Project } from "../../src/core/project/types";
import {
  NEW_RUNWAY_LENGTH_M,
  NEW_WINCH_ROPE_M,
  createEditorStore,
  type EditorDeps,
} from "../../src/renderer/state/store";
import { destination, haversine, initialBearing } from "../../src/core/geo/geo";

const near = (got: number, want: number, tol: number): void =>
  expect(Math.abs(got - want)).toBeLessThan(tol);

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

/** The id of the airport PART the store has selected. Throws rather than returning undefined, and the
 *  throw is the point: `{ kind: "data" }` names the airport itself and carries no id (store.ts), so a
 *  test that reaches for one after selecting Data has asked the wrong question and should say so. */
function selectedPartId(store: ReturnType<typeof makeStore>["store"]): string {
  const sel = store.getState().airportSelection;
  if (sel === null || sel.kind === "data") {
    throw new Error(`expected an airport part to be selected, got ${JSON.stringify(sel)}`);
  }
  return sel.id;
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

// v1.3, forum #173: the pad is placed from the catalog like any other card. It is NOT an object, so
// this is the one spec that writes the airport block — everything below is about that difference.
describe("placeAt — the helipad (v1.3)", () => {
  it("writes the airport block instead of an object, and invents no identity", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const st = store.getState();
    expect(st.project.objects).toHaveLength(0);
    // The id is minted, so it is asserted as "present" rather than by value.
    const pad = st.project.airport?.pads[0];
    expect(st.project.airport).toMatchObject({ icao: "", name: "", country: "" });
    expect(st.project.airport?.pads).toHaveLength(1);
    expect(pad).toMatchObject({ name: "", position: { lon: 10, lat: 48 }, heading: 0, radius: 10 });
    expect(pad?.id).toBeTruthy();
    expect(st.project.airport?.pad).toEqual(pad); // the compat mirror rides along
  });

  it("selects the pad it just dropped, and clears any object selection", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const st = store.getState();
    expect(st.airportSelection).toEqual({ kind: "pad", id: st.project.airport?.pads[0]?.id });
    // …and that id is a real one, so the assertion above is not two undefineds agreeing.
    expect(st.project.airport?.pads[0]?.id).toBeTruthy();
    expect(st.selection).toEqual([]);
  });

  // v1.4, forum #221: "this element can now be used as often as desired". Until then a second drop MOVED
  // the one pad, because a second pad was not a thing that could exist. His own SCLC ships three.
  it("placing again APPENDS a pad and keeps the identity typed in between", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().setAirportIdentity({ icao: "pct001", name: "Roof", country: "cl" });
    store.getState().placeAt({ lon: 11, lat: 49 }); // still armed — no re-arm needed
    const a = store.getState().project.airport;
    expect(store.getState().project.objects).toHaveLength(0); // a pad is never an object
    expect(a?.pads).toHaveLength(2);
    expect(a?.pads[0]?.position).toEqual({ lon: 10, lat: 48 }); // the first one stayed put
    expect(a?.pads[1]?.position).toEqual({ lon: 11, lat: 49 });
    expect(a).toMatchObject({ icao: "pct001", name: "Roof", country: "cl" });
  });

  it("a pad drops like a stand — selected, and STILL armed for the next", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const st = store.getState();
    expect(st.placing).toEqual({ kind: "helipad" });
    expect(st.airportSelection).toEqual({ kind: "pad", id: st.project.airport?.pads[0]?.id });
  });

  it("each pad moves, turns and resizes on its own", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().placeAt({ lon: 11, lat: 49 });
    const [a, b] = store.getState().project.airport?.pads ?? [];
    if (a === undefined || b === undefined) throw new Error("expected two pads");

    store.getState().moveAirportPad(b.id, { lon: 12, lat: 50 });
    store.getState().rotateAirportPad(b.id, 90);
    store.getState().setAirportPadRadius(b.id, 25);
    store.getState().setAirportPadName(b.id, "Helipad_W1");

    const pads = store.getState().project.airport?.pads ?? [];
    expect(pads[0]).toMatchObject({ position: { lon: 10, lat: 48 }, heading: 0, radius: 10, name: "" });
    expect(pads[1]).toMatchObject({
      position: { lon: 12, lat: 50 },
      heading: 90,
      radius: 25,
      name: "Helipad_W1",
    });
  });

  it("dragging pad A then pad B is TWO undo entries, not one", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().placeAt({ lon: 11, lat: 49 });
    const [a, b] = store.getState().project.airport?.pads ?? [];
    if (a === undefined || b === undefined) throw new Error("expected two pads");

    store.getState().moveAirportPad(a.id, { lon: 10.5, lat: 48.5 });
    store.getState().moveAirportPad(b.id, { lon: 11.5, lat: 49.5 });
    // One Ctrl+Z puts back only B — the coalesce key carries the pad id, so the two drags are two
    // gestures. With a shared key they folded into one entry and a single undo moved both.
    store.getState().undo();
    const pads = store.getState().project.airport?.pads ?? [];
    expect(pads[1]?.position).toEqual({ lon: 11, lat: 49 });
    expect(pads[0]?.position).toEqual({ lon: 10.5, lat: 48.5 });
  });

  it("deleting one pad leaves the others alone", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().placeAt({ lon: 11, lat: 49 });
    store.getState().placeAt({ lon: 12, lat: 50 });
    const pads = store.getState().project.airport?.pads ?? [];
    const middle = pads[1];
    if (middle === undefined) throw new Error("expected three pads");

    store.getState().selectAirportPart({ kind: "pad", id: middle.id });
    store.getState().deleteSelection();

    const left = store.getState().project.airport?.pads ?? [];
    expect(left).toHaveLength(2);
    expect(left.map((p) => p.position.lon)).toEqual([10, 12]);
  });

  // The bug the preview harness caught: this is the one selection write that does not go through
  // select(), so it was leaving the airport selected while `selection` pointed at the new object — the
  // Inspector showed the heliport for an object you had just placed.
  it("dropping an OBJECT lets the pad go", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().armPlacement({ kind: "xref", name: "tower" });
    store.getState().placeAt({ lon: 10.1, lat: 48.1 });
    const st = store.getState();
    expect(st.airportSelection).toBeNull();
    // id1, not id0: the pad above minted id0 from the same counter, because a pad carries an id of its
    // own now rather than being read back off `pads[0]`.
    expect(st.selection).toEqual(["id1"]);
  });

  it("selecting an object and selecting the pad are mutually exclusive", () => {
    const { store } = makeStore({ initialProject: baseProject([xref("a")]) });
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });

    const padId = store.getState().project.airport!.pads[0].id;

    store.getState().select(["a"]);
    expect(store.getState().airportSelection).toBeNull();
    expect(store.getState().selection).toEqual(["a"]);

    store.getState().selectAirportPart({ kind: "pad", id: padId });
    expect(store.getState().selection).toEqual([]);
    expect(store.getState().airportSelection).toEqual({ kind: "pad", id: padId });

    store.getState().clearSelection();
    expect(store.getState().airportSelection).toBeNull();
  });

  it("Delete on the pad of a never-named airport takes the block with it", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });

    store.getState().deleteSelection();
    expect(store.getState().project.airport).toBeUndefined();
    expect(store.getState().airportSelection).toBeNull();

    store.getState().undo();
    expect(store.getState().project.airport?.pads).toHaveLength(1);
  });

  // v1.4, and a deliberate change from v1.3: the identity used to go with the last part. It cannot any
  // more — the DATA submenu gives an identity-only airport a row and a panel, so keeping the old rule
  // would mean deleting a pad silently threw away a code the user had typed somewhere else.
  it("Delete on the pad KEEPS an airport that has been named", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().setAirportIdentity({ icao: "pct001", name: "Roof", country: "cl" });

    store.getState().deleteSelection();
    const a = store.getState().project.airport;
    expect(a).toMatchObject({ icao: "pct001", name: "Roof", country: "cl" });
    expect(a?.pads).toHaveLength(0);
  });

  it("Delete on DATA removes the whole airport, geometry and all", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().setAirportIdentity({ icao: "pct001", name: "Roof", country: "cl" });

    store.getState().selectAirportPart({ kind: "data" });
    store.getState().deleteSelection();
    expect(store.getState().project.airport).toBeUndefined();
    expect(store.getState().airportSelection).toBeNull();

    store.getState().undo(); // one commit, so the pad comes back with the identity
    expect(store.getState().project.airport).toMatchObject({ icao: "pct001", name: "Roof" });
    expect(store.getState().project.airport?.pads).toHaveLength(1);
  });

  it("the Data card makes an empty airport and selects it, without placing anything", () => {
    const { store } = makeStore();
    store.getState().createAirport();
    const st = store.getState();
    expect(st.project.airport).toMatchObject({ icao: "", name: "", country: "", pads: [] });
    expect(st.airportSelection).toEqual({ kind: "data" });
    expect(st.placing).toBeNull(); // it arms nothing — there is no map click coming
    expect(st.project.objects).toHaveLength(0);
  });

  it("the Data card on an existing airport only re-selects it — no second block, no new commit", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const undos = store.getState().undoStack.length;

    store.getState().createAirport();
    expect(store.getState().project.airport?.pads).toHaveLength(1);
    expect(store.getState().airportSelection).toEqual({ kind: "data" });
    expect(store.getState().undoStack).toHaveLength(undos);
  });

  it("IATA is writable — it was in the model and both writers with no way to set it", () => {
    const { store } = makeStore();
    store.getState().createAirport();
    store.getState().setAirportIata("SCL");
    expect(store.getState().project.airport?.iata).toBe("SCL");
  });

  it("setAirportIdentity is a no-op without a pad — the identity has nowhere to live", () => {
    const { store } = makeStore();
    store.getState().setAirportIdentity({ icao: "pct001" });
    expect(store.getState().project.airport).toBeUndefined();
  });
});

// v1.4, forum #232. The stand is the first REPEATABLE airport part to get a UI, so these pin the two
// things that make it different from the pad rather than re-testing the mutations (mutate.test.ts).
describe("store — parking positions", () => {
  const placeStand = (store: ReturnType<typeof makeStore>["store"], lon: number, lat: number): string => {
    store.getState().armPlacement({ kind: "parking", parkingType: "parked_ga" });
    store.getState().placeAt({ lon, lat });
    return selectedPartId(store);
  };

  it("drops a stand, selects it, and STAYS armed — any number can be created", () => {
    const { store } = makeStore();
    const first = placeStand(store, 10, 48);
    const st = store.getState();
    expect(st.placing).toEqual({ kind: "parking", parkingType: "parked_ga" }); // ≠ the pad, which disarms
    expect(st.airportSelection).toEqual({ kind: "parking", id: first });
    expect(st.selection).toEqual([]);
    expect(st.project.airport?.parkings).toHaveLength(1);
    expect(st.project.airport?.parkings?.[0]).toMatchObject({
      position: { lon: 10, lat: 48 },
      heading: 0,
      size: 7.5, // his margin note: [parked_ga] = 7.5 M
      name: "",
    });

    store.getState().placeAt({ lon: 11, lat: 49 });
    expect(store.getState().project.airport?.parkings).toHaveLength(2); // appended, not moved
  });

  it("keeps each stand's drag in its OWN undo entry", () => {
    // The regression this guards: a coalesce key without the id folds two stands' drags into one, and a
    // single Ctrl+Z puts both back.
    const { store } = makeStore({ coalesceMs: 800 });
    const a = placeStand(store, 10, 48);
    const b = placeStand(store, 11, 49);

    store.getState().moveAirportParking(a, { lon: 10.5, lat: 48.5 });
    store.getState().moveAirportParking(b, { lon: 11.5, lat: 49.5 });
    store.getState().undo();

    const parkings = store.getState().project.airport!.parkings!;
    expect(parkings.find((p) => p.id === b)!.position).toEqual({ lon: 11, lat: 49 }); // undone
    expect(parkings.find((p) => p.id === a)!.position).toEqual({ lon: 10.5, lat: 48.5 }); // untouched
  });

  it("Delete removes THAT stand and leaves the pad and its neighbours alone", () => {
    // Through v1.3 this branch deleted the whole airport block. With a second kind placeable that would
    // take the pad and the other stands with it.
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    store.getState().setAirportIdentity({ icao: "pct001", name: "Roof", country: "cl" });
    const a = placeStand(store, 10.1, 48.1);
    placeStand(store, 10.2, 48.2);

    store.getState().selectAirportPart({ kind: "parking", id: a });
    store.getState().deleteSelection();

    const airport = store.getState().project.airport!;
    expect(airport.parkings).toHaveLength(1);
    expect(airport.parkings![0].id).not.toBe(a);
    expect(airport.pads).toHaveLength(1);
    expect(airport).toMatchObject({ icao: "pct001", name: "Roof" });
    expect(store.getState().airportSelection).toBeNull();
  });

  it("deleting the LAST part of a never-named airport takes the block with it", () => {
    const { store } = makeStore();
    const a = placeStand(store, 10, 48);

    store.getState().selectAirportPart({ kind: "parking", id: a });
    store.getState().deleteSelection();
    expect(store.getState().project.airport).toBeUndefined();

    store.getState().undo(); // one commit, so the stand comes back
    expect(store.getState().project.airport?.parkings).toHaveLength(1);
  });

  // The dead end the DATA submenu was built to close: placing a stand creates the airport block, and
  // until v1.4 the identity fields lived inside the PAD's panel — so this project had an airport, no
  // pad, and no way to give it a code. Now the identity is reachable, and so it has to survive the
  // stand it arrived with.
  it("deleting the LAST part KEEPS an airport that has been named", () => {
    const { store } = makeStore();
    const a = placeStand(store, 10, 48);
    store.getState().setAirportIdentity({ icao: "pct001", name: "Roof", country: "cl" });

    store.getState().selectAirportPart({ kind: "parking", id: a });
    store.getState().deleteSelection();
    const airport = store.getState().project.airport;
    expect(airport).toMatchObject({ icao: "pct001", name: "Roof" });
    expect(airport?.parkings ?? []).toHaveLength(0);
    expect(airport?.pads).toHaveLength(0);
  });

  it("deleting the pad no longer takes the stands with it", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const padId = selectedPartId(store);
    placeStand(store, 10.1, 48.1);

    store.getState().selectAirportPart({ kind: "pad", id: padId });
    store.getState().deleteSelection();

    const airport = store.getState().project.airport!;
    expect(airport.pads).toHaveLength(0);
    expect(airport.parkings).toHaveLength(1);
  });

  it("switching type moves the size only while it is still the old type's default", () => {
    const { store } = makeStore();
    const a = placeStand(store, 10, 48);
    store.getState().setAirportParkingType(a, "parked_jet");
    expect(store.getState().project.airport!.parkings![0].size).toBe(40);

    store.getState().setAirportParkingSize(a, 33);
    store.getState().setAirportParkingType(a, "parked_ga");
    expect(store.getState().project.airport!.parkings![0].size).toBe(33); // a typed size is the user's
  });
});

// v1.4, forum #242. A runway is the only airport part a single click cannot finish, because it is defined
// by TWO points — these pin what one click actually produces and how the two ends stay independent.
describe("store — runways", () => {
  const placeRunway = (store: ReturnType<typeof makeStore>["store"], lon: number, lat: number): string => {
    store.getState().armPlacement({ kind: "runway" });
    store.getState().placeAt({ lon, lat });
    return selectedPartId(store);
  };

  it("one click drops a WHOLE runway, then disarms", () => {
    const { store } = makeStore();
    const id = placeRunway(store, 10, 48);
    const st = store.getState();
    // Disarms, unlike a stand: dropping runway on runway is not a gesture, and the next thing anyone
    // does is adjust the one they just made.
    expect(st.placing).toBeNull();
    expect(st.airportSelection).toEqual({ kind: "runway", id });

    const r = st.project.airport!.runways![0];
    expect(r.ends[0].threshold).toEqual({ lon: 10, lat: 48 });
    expect(r.width).toBe(40);
    // End 2 lands a default length due east. The bearing is what makes the strip readable at once; the
    // IDENTIFIERS stay empty on purpose — naming a runway 09/27 would be a claim about the real world
    // that a default heading cannot make.
    near(haversine(r.ends[0].threshold, r.ends[1].threshold), NEW_RUNWAY_LENGTH_M, 1);
    near(initialBearing(r.ends[0].threshold, r.ends[1].threshold), 90, 0.5);
    expect([r.ends[0].identifier, r.ends[1].identifier]).toEqual(["", ""]);
    // A fresh end is unlit and usable both ways — the defaults every end in his files carries.
    expect(r.ends[0]).toMatchObject({ appltsys: "none", papi: "none", reil: "none", approach: true, takeoff: true });
  });

  it("keeps the two ENDS in separate undo entries", () => {
    // The key has to carry the end as well as the runway id: dragging threshold 1 and then threshold 2 is
    // two gestures, and one Ctrl+Z must not snap the whole strip back.
    const { store } = makeStore({ coalesceMs: 800 });
    const id = placeRunway(store, 10, 48);
    store.getState().moveAirportRunwayEnd(id, 0, { lon: 10.001, lat: 48.001 });
    store.getState().moveAirportRunwayEnd(id, 1, { lon: 10.02, lat: 48.002 });
    store.getState().undo();

    const r = store.getState().project.airport!.runways![0];
    expect(r.ends[1].threshold).not.toEqual({ lon: 10.02, lat: 48.002 }); // undone
    expect(r.ends[0].threshold).toEqual({ lon: 10.001, lat: 48.001 }); // untouched
  });

  it("moves the WHOLE strip as one undo entry, keeping its length and direction", () => {
    // Juan's first gesture in the real app was to drag the runway, and it panned the map instead: the
    // strip had no mousedown handler, so nothing disabled Leaflet's own container drag. These pin the
    // store half of the fix — the layer half is the handler itself.
    const { store } = makeStore({ coalesceMs: 800 });
    const id = placeRunway(store, 10, 48);
    const before = store.getState().project.airport!.runways![0];
    const lengthBefore = haversine(before.ends[0].threshold, before.ends[1].threshold);
    const dirBefore = initialBearing(before.ends[0].threshold, before.ends[1].threshold);

    store.getState().moveAirportRunway(
      id,
      { lon: before.ends[0].threshold.lon + 0.01, lat: before.ends[0].threshold.lat + 0.01 },
      { lon: before.ends[1].threshold.lon + 0.01, lat: before.ends[1].threshold.lat + 0.01 },
    );

    const after = store.getState().project.airport!.runways![0];
    expect(after.ends[0].threshold).toEqual({ lon: 10.01, lat: 48.01 });
    near(haversine(after.ends[0].threshold, after.ends[1].threshold), lengthBefore, 2);
    near(initialBearing(after.ends[0].threshold, after.ends[1].threshold), dirBefore, 0.5);

    // ONE entry: undo must not leave one threshold moved and the other back where it started.
    store.getState().undo();
    const undone = store.getState().project.airport!.runways![0];
    expect(undone.ends[0].threshold).toEqual(before.ends[0].threshold);
    expect(undone.ends[1].threshold).toEqual(before.ends[1].threshold);
  });

  it("edits one end without touching the other", () => {
    const { store } = makeStore();
    const id = placeRunway(store, 10, 48);
    store.getState().updateAirportRunwayEnd(id, 0, { identifier: "08", appltsys: "alsf-2", papi: "both" });
    const r = store.getState().project.airport!.runways![0];
    expect(r.ends[0]).toMatchObject({ identifier: "08", appltsys: "alsf-2", papi: "both" });
    expect(r.ends[1]).toMatchObject({ identifier: "", appltsys: "none", papi: "none" });
  });

  it("Delete removes THAT runway and leaves the stands and the pad alone", () => {
    const { store } = makeStore();
    store.getState().armPlacement({ kind: "helipad" });
    store.getState().placeAt({ lon: 10, lat: 48 });
    const first = placeRunway(store, 10.1, 48.1);
    placeRunway(store, 10.2, 48.2);

    store.getState().selectAirportPart({ kind: "runway", id: first });
    store.getState().deleteSelection();

    const airport = store.getState().project.airport!;
    expect(airport.runways).toHaveLength(1);
    expect(airport.runways![0].id).not.toBe(first);
    expect(airport.pads).toHaveLength(1);
  });

  it("deleting the only runway takes the airport block with it", () => {
    const { store } = makeStore();
    const id = placeRunway(store, 10, 48);
    store.getState().selectAirportPart({ kind: "runway", id });
    store.getState().deleteSelection();
    expect(store.getState().project.airport).toBeUndefined();
  });
});

// v1.4, forum #237/#238. The two glider starts are the same family with one structural difference, and
// that difference is what these pin: an aerotow is a point with a HEADING, a winch launch is a PAIR of
// points with none — "the length and direction then result from the two positions".
describe("store — glider starts", () => {
  const placeAerotow = (store: ReturnType<typeof makeStore>["store"], lon: number, lat: number): string => {
    store.getState().armPlacement({ kind: "aerotow" });
    store.getState().placeAt({ lon, lat });
    return selectedPartId(store);
  };
  const placeWinch = (store: ReturnType<typeof makeStore>["store"], lon: number, lat: number): string => {
    store.getState().armPlacement({ kind: "winch" });
    store.getState().placeAt({ lon, lat });
    return selectedPartId(store);
  };

  it("an aerotow drops like a stand — selected, and STILL armed", () => {
    const { store } = makeStore();
    const id = placeAerotow(store, 10, 48);
    const st = store.getState();
    expect(st.placing).toEqual({ kind: "aerotow" });
    expect(st.airportSelection).toEqual({ kind: "aerotow", id });
    expect(st.project.airport!.aerotows![0]).toMatchObject({
      position: { lon: 10, lat: 48 },
      heading: 0,
      name: "", // his rule: the name is the user's job, PCT never derives it from a nearby runway
    });
  });

  it("a winch launch drops like a runway — the whole rope, then disarms", () => {
    const { store } = makeStore();
    const id = placeWinch(store, 10, 48);
    const st = store.getState();
    expect(st.placing).toBeNull();
    expect(st.airportSelection).toEqual({ kind: "winch", id });
    const w = st.project.airport!.winches![0];
    expect(w.position).toEqual({ lon: 10, lat: 48 });
    expect(w.spacing).toBe(25); // his number: "basically the span"
    near(haversine(w.position, w.winch), NEW_WINCH_ROPE_M, 1); // inside his 800–1000 m
    near(initialBearing(w.position, w.winch), 90, 0.5);
  });

  it("dragging the rope moves BOTH points by the same offset, as one undo entry", () => {
    // The regression: the rope shipped without a mousedown at first, so pressing the longest part of an
    // 800 m object panned the map — the same defect the runway strip had.
    const { store } = makeStore({ coalesceMs: 800 });
    const id = placeWinch(store, 10, 48);
    const before = store.getState().project.airport!.winches![0];
    store.getState().moveAirportWinch(
      id,
      { lon: before.position.lon + 0.01, lat: before.position.lat + 0.01 },
      { lon: before.winch.lon + 0.01, lat: before.winch.lat + 0.01 },
    );
    const after = store.getState().project.airport!.winches![0];
    near(haversine(after.position, after.winch), haversine(before.position, before.winch), 2);

    store.getState().undo();
    const undone = store.getState().project.airport!.winches![0];
    expect(undone.position).toEqual(before.position);
    expect(undone.winch).toEqual(before.winch); // one entry, so BOTH come back
  });

  it("keeps the glider and the winch in separate undo entries when dragged one at a time", () => {
    const { store } = makeStore({ coalesceMs: 800 });
    const id = placeWinch(store, 10, 48);
    const before = store.getState().project.airport!.winches![0];
    store.getState().moveAirportWinchPoint(id, "glider", { lon: 10.001, lat: 48.001 });
    store.getState().moveAirportWinchPoint(id, "winch", { lon: 10.02, lat: 48.002 });
    store.getState().undo();
    const w = store.getState().project.airport!.winches![0];
    expect(w.position).toEqual({ lon: 10.001, lat: 48.001 }); // untouched
    expect(w.winch).toEqual(before.winch); // undone
  });

  it("refuses a non-positive glider spacing rather than clamping it", () => {
    const { store } = makeStore();
    const id = placeWinch(store, 10, 48);
    store.getState().setAirportWinchSpacing(id, 0);
    expect(store.getState().project.airport!.winches![0].spacing).toBe(25);
    store.getState().setAirportWinchSpacing(id, 18);
    expect(store.getState().project.airport!.winches![0].spacing).toBe(18);
  });

  it("Delete removes THAT glider start and leaves the other kind alone", () => {
    const { store } = makeStore();
    const tow = placeAerotow(store, 10, 48);
    placeWinch(store, 10.1, 48.1);
    store.getState().selectAirportPart({ kind: "aerotow", id: tow });
    store.getState().deleteSelection();

    const airport = store.getState().project.airport!;
    expect(airport.aerotows).toHaveLength(0);
    expect(airport.winches).toHaveLength(1); // an empty aerotow list is not an empty airport
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

describe("nudgeSelection — coalescing + elevation drop", () => {
  it("coalesces a rapid east run into one undo entry, and undo restores the origin", () => {
    const { store, clock } = makeStore({ coalesceMs: 800 });
    store.getState().openProject("/p", baseProject([xref("a", { position: { lon: 10, lat: 48 } })]));
    store.getState().select(["a"]);

    clock.t = 1000;
    store.getState().nudgeSelection(5, 90); // east, undo entry #1
    clock.t = 1200;
    store.getState().nudgeSelection(5, 90); // within window → coalesced

    const st = store.getState();
    expect(st.project.objects[0].position.lon).toBeGreaterThan(10); // moved east
    expect(st.project.objects[0].position.lat).toBeCloseTo(48, 4);
    expect(st.undoStack).toHaveLength(1);

    store.getState().undo();
    expect(store.getState().project.objects[0].position).toEqual({ lon: 10, lat: 48 });
  });

  // Fable I4 — the actual bug. The old per-object nudge coalesced on a `${id}:pos` key, so with 2+
  // selected the key alternated and the run NEVER continued: one keypress = N undo entries, and a held
  // arrow flooded the 50-entry cap in about a second, taking the real history with it.
  it("moves a MULTI selection as one undo entry per gesture, and one undo restores them all", () => {
    const { store, clock } = makeStore({ coalesceMs: 800 });
    store.getState().openProject(
      "/p",
      baseProject([
        xref("a", { position: { lon: 10, lat: 48 } }),
        xref("b", { position: { lon: 11, lat: 49 } }),
      ]),
    );
    store.getState().select(["a", "b"]);

    clock.t = 1000;
    store.getState().nudgeSelection(5, 90);
    clock.t = 1100;
    store.getState().nudgeSelection(5, 90);
    clock.t = 1200;
    store.getState().nudgeSelection(5, 90);

    const st = store.getState();
    expect(st.undoStack).toHaveLength(1); // was 6 (3 keypresses × 2 objects)
    expect(st.project.objects[0].position.lon).toBeGreaterThan(10); // BOTH moved
    expect(st.project.objects[1].position.lon).toBeGreaterThan(11);

    store.getState().undo();
    const back = store.getState().project.objects;
    expect(back[0].position).toEqual({ lon: 10, lat: 48 });
    expect(back[1].position).toEqual({ lon: 11, lat: 49 });
  });

  it("drops every moved object's cached terrain elevation (like moveObject)", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a"), xref("b")]));
    store.getState().setResolvedElev("a", 500);
    store.getState().setResolvedElev("b", 600);
    store.getState().select(["a", "b"]);
    store.getState().nudgeSelection(0.5, 0);
    expect(store.getState().resolvedElev.has("a")).toBe(false);
    expect(store.getState().resolvedElev.has("b")).toBe(false);
  });

  it("no-ops with an empty selection, and on a selection of ghosts (stays clean)", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", baseProject([xref("a")]));
    store.getState().nudgeSelection(5, 90); // nothing selected
    store.getState().select(["ghost"]);
    store.getState().nudgeSelection(5, 90); // selected id isn't in the document
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

describe("object photos (v0.6/v0.7)", () => {
  it("setThumbnails bumps the epoch only when the set CONTENT changes", () => {
    const { store } = makeStore();
    const e0 = store.getState().thumbnailEpoch;
    store.getState().setThumbnails(["tower", "hangar"]);
    const e1 = store.getState().thumbnailEpoch;
    expect(e1).toBe(e0 + 1);
    store.getState().setThumbnails(["hangar", "tower"]); // same set, different order → no-op
    expect(store.getState().thumbnailEpoch).toBe(e1);
  });

  it("invalidateThumbnail bumps the epoch even for a name ALREADY in the set (a re-paste busts the cache)", () => {
    const { store } = makeStore();
    store.getState().setThumbnails(["tower"]); // tower already has a photo
    const e1 = store.getState().thumbnailEpoch;
    const set1 = store.getState().thumbnailNames;
    store.getState().invalidateThumbnail("Tower"); // case-insensitive, already present
    const s = store.getState();
    expect(s.thumbnailEpoch).toBe(e1 + 1); // epoch moved → useThumbnailSrc re-fetches the new bytes
    expect(s.thumbnailNames).toBe(set1); // same reference — only the epoch changed
    expect(s.thumbnailNames.has("tower")).toBe(true);
  });

  it("invalidateThumbnail adds a brand-new (lowercased) name and bumps the epoch (first photo)", () => {
    const { store } = makeStore();
    const e0 = store.getState().thumbnailEpoch;
    store.getState().invalidateThumbnail("Hangar_02");
    const s = store.getState();
    expect(s.thumbnailNames.has("hangar_02")).toBe(true);
    expect(s.thumbnailEpoch).toBe(e0 + 1);
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

// ── v0.9.2 arrange ────────────────────────────────────────────────────────────
// Three objects 100 m apart along a 135° row, with the middle one pushed 12 m off the line.
const ROW_ORIGIN = { lon: 10, lat: 48 };
const rowPoint = (along: number, cross: number) => {
  const p = destination(ROW_ORIGIN, along, 135);
  return cross === 0 ? p : destination(p, cross, 225);
};
const strayRow = () =>
  baseProject([
    xref("a", { position: rowPoint(0, 0) }),
    xref("b", { position: rowPoint(100, 12) }),
    xref("c", { position: rowPoint(200, 0) }),
  ]);

describe("lineUpSelection / spaceSelectionEvenly", () => {
  it("straightens the row in ONE undo entry, and one undo puts it back", () => {
    const { store } = makeStore();
    const before = strayRow();
    store.getState().openProject("/p", before);
    store.getState().select(["a", "b", "c"]);
    store.getState().lineUpSelection();

    const after = store.getState();
    expect(after.undoStack).toHaveLength(1); // not one per object
    // The two ends define the axis and must not have budged; the stray one moved its 12 m.
    expect(after.project.objects[0].position).toEqual(before.objects[0].position);
    expect(after.project.objects[2].position).toEqual(before.objects[2].position);
    expect(haversine(after.project.objects[1].position, before.objects[1].position)).toBeCloseTo(12, 2);

    store.getState().undo();
    expect(store.getState().project.objects[1].position).toEqual(before.objects[1].position);
  });

  it("evens the gaps, keeping the ends put", () => {
    const { store } = makeStore();
    store.getState().openProject(
      "/p",
      baseProject([
        xref("a", { position: rowPoint(0, 0) }),
        xref("b", { position: rowPoint(20, 0) }), // bunched up against the first
        xref("c", { position: rowPoint(200, 0) }),
      ]),
    );
    store.getState().select(["a", "b", "c"]);
    store.getState().spaceSelectionEvenly();

    const o = store.getState().project.objects;
    expect(haversine(o[0].position, o[1].position)).toBeCloseTo(100, 2);
    expect(haversine(o[1].position, o[2].position)).toBeCloseTo(100, 2);
    expect(store.getState().undoStack).toHaveLength(1);
  });

  // The point of returning identical references out of core/geo/arrange: an operation that changes
  // nothing must not cost an undo entry, or "did that do anything?" becomes a history full of no-ops.
  it("is a TRUE no-op on an already-straight, already-even row", () => {
    const { store } = makeStore();
    store.getState().openProject(
      "/p",
      baseProject([
        xref("a", { position: rowPoint(0, 0) }),
        xref("b", { position: rowPoint(100, 0) }),
        xref("c", { position: rowPoint(200, 0) }),
      ]),
    );
    store.getState().select(["a", "b", "c"]);
    store.getState().lineUpSelection();
    store.getState().spaceSelectionEvenly();
    expect(store.getState().undoStack).toHaveLength(0);
    expect(store.getState().dirty).toBe(false);
  });

  it("leaves a LOCKED object where it is, but still counts it in the row", () => {
    const { store } = makeStore();
    const before = strayRow();
    before.objects[1].locked = true;
    store.getState().openProject("/p", before);
    store.getState().select(["a", "b", "c"]);
    store.getState().lineUpSelection();
    // Nothing else was off the line, so with the only stray one locked there is nothing left to do.
    expect(store.getState().project.objects[1].position).toEqual(before.objects[1].position);
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("needs three: two objects are a line already", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", strayRow());
    store.getState().select(["a", "b"]);
    store.getState().lineUpSelection();
    expect(store.getState().undoStack).toHaveLength(0);
  });

  it("drops the cached terrain elevation of everything it moved", () => {
    const { store } = makeStore();
    store.getState().openProject("/p", strayRow());
    store.getState().setResolvedElev("a", 500);
    store.getState().setResolvedElev("b", 500);
    store.getState().select(["a", "b", "c"]);
    store.getState().lineUpSelection();
    expect(store.getState().resolvedElev.has("b")).toBe(false); // it moved
    expect(store.getState().resolvedElev.has("a")).toBe(true); // it didn't
  });
});

describe("setSelectionRotation", () => {
  it("writes one raw rotation to every kind that has one, as a single undo entry", () => {
    const { store } = makeStore();
    store.getState().openProject(
      "/p",
      baseProject([xref("a", { direction: 10 }), xref("b", { direction: 250 })]),
    );
    store.getState().select(["a", "b"]);
    store.getState().setSelectionRotation(315);
    const o = store.getState().project.objects;
    expect((o[0] as PlacedXref).direction).toBe(315);
    expect((o[1] as PlacedXref).direction).toBe(315);
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("skips a locked object — the lock reads 'ignore map drag & rotate'", () => {
    const { store } = makeStore();
    store.getState().openProject(
      "/p",
      baseProject([xref("a", { direction: 10 }), xref("b", { direction: 10, locked: true })]),
    );
    store.getState().select(["a", "b"]);
    store.getState().setSelectionRotation(90);
    const o = store.getState().project.objects;
    expect((o[0] as PlacedXref).direction).toBe(90);
    expect((o[1] as PlacedXref).direction).toBe(10);
  });
});
