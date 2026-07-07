import { describe, expect, it } from "vitest";
import type { PlacedXref } from "../../src/core/project/types";
import { diffEntry } from "../../src/renderer/map/syncDiff";

const obj = (id = "a"): PlacedXref => ({
  id,
  kind: "xref",
  name: "tower",
  position: { lon: 10, lat: 48 },
  height: { mode: "terrain" },
  direction: 0,
  scale: 1,
});

// The P1-5 reference-diff contract: mutate.ts keeps untouched objects at the same reference, so the
// layer can skip them and only rebuild what actually changed.
describe("diffEntry — the O(changed) sync decision", () => {
  it("rebuilds when there is no previous entry", () => {
    expect(diffEntry(undefined, obj(), false)).toBe("rebuild");
  });

  it("skips when both the object reference and selection are unchanged", () => {
    const o = obj();
    expect(diffEntry({ obj: o, selected: false }, o, false)).toBe("skip");
    expect(diffEntry({ obj: o, selected: true }, o, true)).toBe("skip");
  });

  it("restyles when only the selection flag changed (same object reference)", () => {
    const o = obj();
    expect(diffEntry({ obj: o, selected: false }, o, true)).toBe("restyle");
    expect(diffEntry({ obj: o, selected: true }, o, false)).toBe("restyle");
  });

  it("rebuilds when the object reference changed (a geometry edit)", () => {
    // same id, different reference — what mutate.moveObject/rotateObject/scaleObject produce
    expect(diffEntry({ obj: obj(), selected: false }, obj(), false)).toBe("rebuild");
    expect(diffEntry({ obj: obj(), selected: true }, obj(), true)).toBe("rebuild");
  });
});
