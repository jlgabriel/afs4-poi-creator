import { describe, expect, it } from "vitest";
import { arrowToVector, isEditableTarget } from "../../src/renderer/app/keyboard";

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
