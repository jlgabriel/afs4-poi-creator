import { describe, it, expect } from "vitest";
import {
  addObject,
  createProject,
  createXref,
  duplicateObject,
  moveObject,
  removeObject,
  renameProject,
  rotateObject,
  scaleObject,
  setCamera,
  setHeight,
  setLabel,
  setLocked,
  setPoiName,
  setReference,
} from "../../src/core/project/mutate";
import type { PlacedXref, Project } from "../../src/core/project/types";

const CAMERA = { lon: 11.86, lat: 48.37, zoom: 15 };
const NOW = "2026-07-07T00:00:00.000Z";
const LATER = "2026-07-07T01:00:00.000Z";

function baseProject(objects: PlacedXref[] = []): Project {
  return { ...createProject({ name: "t", camera: CAMERA, now: NOW }), objects };
}
const xref = (id: string, over: Partial<PlacedXref> = {}) =>
  createXref("tower_x", { lon: 11.86, lat: 48.37 }, { id, ...over });

describe("createXref", () => {
  it("applies M1 defaults", () => {
    const x = xref("a");
    expect(x).toMatchObject({
      id: "a",
      kind: "xref",
      name: "tower_x",
      direction: 0,
      scale: 1,
      height: { mode: "terrain" },
    });
    expect(x.label).toBeUndefined();
    expect(x.locked).toBeUndefined();
  });
  it("normalises direction and honours overrides", () => {
    expect(xref("a", { direction: -90 }).direction).toBe(270);
    expect(xref("a", { direction: 370 }).direction).toBe(10);
    expect(xref("a", { scale: 2, locked: true, label: "hi" })).toMatchObject({
      scale: 2,
      locked: true,
      label: "hi",
    });
  });
  it("mints a unique uuid when no id is given", () => {
    const a = createXref("n", { lon: 0, lat: 0 });
    const b = createXref("n", { lon: 0, lat: 0 });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("object mutations are pure & immutable", () => {
  it("addObject appends without touching the input", () => {
    const p0 = baseProject();
    const p1 = addObject(p0, xref("a"), LATER);
    expect(p0.objects).toHaveLength(0); // input untouched
    expect(p1.objects).toHaveLength(1);
    expect(p1.modifiedAt).toBe(LATER);
    expect(p1).not.toBe(p0);
  });
  it("removeObject drops by id; a missing id is a no-op (same reference)", () => {
    const p0 = baseProject([xref("a"), xref("b")]);
    expect(removeObject(p0, "a", LATER).objects.map((o) => o.id)).toEqual(["b"]);
    expect(removeObject(p0, "zzz", LATER)).toBe(p0);
  });
  it("moveObject / rotateObject / scaleObject / setHeight update only the target", () => {
    const p0 = baseProject([xref("a"), xref("b")]);
    const moved = moveObject(p0, "a", { lon: 1, lat: 2 }, LATER);
    expect(moved.objects[0].position).toEqual({ lon: 1, lat: 2 });
    expect(moved.objects[1]).toBe(p0.objects[1]); // sibling kept by reference
    expect(p0.objects[0].position).toEqual({ lon: 11.86, lat: 48.37 }); // input untouched

    expect(rotateObject(p0, "a", -45, LATER).objects[0].direction).toBe(315); // normalised
    expect(scaleObject(p0, "a", 2.5, LATER).objects[0].scale).toBe(2.5);
    expect(setHeight(p0, "a", { mode: "asl", value: 520 }, LATER).objects[0].height).toEqual({
      mode: "asl",
      value: 520,
    });
  });
  it("a missing id is a no-op for targeted mutations", () => {
    const p0 = baseProject([xref("a")]);
    expect(moveObject(p0, "zzz", { lon: 1, lat: 1 }, LATER)).toBe(p0);
  });
  it("setLabel / setLocked set and clear their optional fields", () => {
    const p0 = baseProject([xref("a")]);
    const labelled = setLabel(p0, "a", "gate 3", LATER);
    expect(labelled.objects[0].label).toBe("gate 3");
    expect(setLabel(labelled, "a", "", LATER).objects[0].label).toBeUndefined();

    const locked = setLocked(p0, "a", true, LATER);
    expect(locked.objects[0].locked).toBe(true);
    expect(setLocked(locked, "a", false, LATER).objects[0].locked).toBeUndefined();
  });
  it("duplicateObject copies with a fresh id, appended", () => {
    const p0 = baseProject([xref("a", { scale: 3 })]);
    const dup = duplicateObject(p0, "a", { id: "a2" }, LATER);
    expect(dup.objects).toHaveLength(2);
    expect(dup.objects[1]).toMatchObject({ id: "a2", scale: 3, name: "tower_x" });
    expect(duplicateObject(p0, "zzz")).toBe(p0);
  });
});

describe("project-level mutations", () => {
  it("setReference / renameProject / setPoiName / setCamera", () => {
    const p0 = baseProject();
    expect(setReference(p0, { lon: 1, lat: 2 }, LATER).reference).toEqual({ lon: 1, lat: 2 });
    expect(setReference(p0, null, LATER).reference).toBeNull();
    expect(renameProject(p0, "New", LATER).name).toBe("New");
    expect(setPoiName(p0, "munich_test", LATER).poiName).toBe("munich_test");
    expect(setCamera(p0, { lon: 9, lat: 9, zoom: 3 }, LATER).camera).toEqual({
      lon: 9,
      lat: 9,
      zoom: 3,
    });
    expect(p0.name).toBe("t"); // input untouched
  });
  it("createProject yields M1 defaults", () => {
    const p = createProject({ name: "Munich", poiName: "munich", camera: CAMERA, now: NOW });
    expect(p).toMatchObject({
      schemaVersion: 1,
      app: "pct",
      name: "Munich",
      poiName: "munich",
      reference: null,
      objects: [],
    });
    expect(p.createdAt).toBe(NOW);
    expect(p.modifiedAt).toBe(NOW);
  });
});
