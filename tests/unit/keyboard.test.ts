import { describe, expect, it } from "vitest";
import {
  arrowToVector,
  hasDeletable,
  isEditableTarget,
  lifecycleShortcut,
} from "../../src/renderer/app/keyboard";

describe("isEditableTarget — the P1-4 focus guard", () => {
  it("is true for text-entry controls", () => {
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });

  it("is false for non-editable nodes and null", () => {
    expect(isEditableTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as unknown as EventTarget)).toBe(false);
  });
});

describe("hasDeletable — the guard in front of Del (forum #253 → #258)", () => {
  it("is true for a placed-object selection", () => {
    expect(hasDeletable(["obj-1"], null)).toBe(true);
    expect(hasDeletable(["obj-1", "obj-2"], null)).toBe(true);
  });

  // ★ THE REGRESSION. Selecting an airport part EMPTIES `selection` and fills `airportSelection`, so a
  // guard that counted only `selection` returned before deleteSelection ever ran and Del was dead on all
  // six airport elements while it still worked on objects — which is precisely how he described it.
  it("is true for every airport part, whose selection leaves `selection` empty", () => {
    expect(hasDeletable([], { kind: "data" })).toBe(true);
    expect(hasDeletable([], { kind: "pad", id: "p1" })).toBe(true);
    expect(hasDeletable([], { kind: "parking", id: "s1" })).toBe(true);
    expect(hasDeletable([], { kind: "runway", id: "r1" })).toBe(true);
    expect(hasDeletable([], { kind: "aerotow", id: "a1" })).toBe(true);
    expect(hasDeletable([], { kind: "winch", id: "w1" })).toBe(true);
  });

  it("is false only when nothing at all is selected — a bare Backspace stays unswallowed", () => {
    expect(hasDeletable([], null)).toBe(false);
  });
});

describe("arrowToVector", () => {
  it("maps arrows to compass bearings, 0.5 m default / 5 m with Shift", () => {
    expect(arrowToVector("ArrowUp", false)).toEqual({ deltaM: 0.5, bearingDeg: 0 });
    expect(arrowToVector("ArrowDown", false)).toEqual({ deltaM: 0.5, bearingDeg: 180 });
    expect(arrowToVector("ArrowRight", false)).toEqual({ deltaM: 0.5, bearingDeg: 90 });
    expect(arrowToVector("ArrowLeft", false)).toEqual({ deltaM: 0.5, bearingDeg: 270 });
    expect(arrowToVector("ArrowUp", true)).toEqual({ deltaM: 5, bearingDeg: 0 });
  });

  it("returns null for non-arrow keys", () => {
    expect(arrowToVector("a", false)).toBeNull();
    expect(arrowToVector("Enter", true)).toBeNull();
  });
});

describe("lifecycleShortcut", () => {
  it("maps Ctrl chords to lifecycle actions (Shift+S = Save As)", () => {
    expect(lifecycleShortcut("s", true, false)).toBe("save");
    expect(lifecycleShortcut("S", true, true)).toBe("save-as");
    expect(lifecycleShortcut("o", true, false)).toBe("open");
    expect(lifecycleShortcut("n", true, false)).toBe("new");
  });

  it("requires the modifier — a bare key is not a lifecycle action", () => {
    expect(lifecycleShortcut("s", false, false)).toBeNull();
    expect(lifecycleShortcut("n", false, false)).toBeNull();
  });

  it("Shift only matters for S — Ctrl+Shift+O/N stay open/new", () => {
    expect(lifecycleShortcut("o", true, true)).toBe("open");
    expect(lifecycleShortcut("n", true, true)).toBe("new");
  });

  it("returns null for unrelated Ctrl chords (z/y/d belong to the edit shortcuts)", () => {
    expect(lifecycleShortcut("z", true, false)).toBeNull();
    expect(lifecycleShortcut("d", true, false)).toBeNull();
  });
});
