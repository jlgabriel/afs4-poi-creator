import { describe, it, expect } from "vitest";
import { alongCross, fromAlongCross, lineUp, rowAxis, spaceEvenly } from "../../src/core/geo/arrange";
import { destination, haversine } from "../../src/core/geo/geo";
import type { LonLat } from "../../src/core/project/types";

const ORIGIN: LonLat = { lon: -111.3285, lat: 32.5102 };

/** Build a point `along` metres down a bearing from ORIGIN, then `cross` metres to its right. */
const at = (along: number, cross: number, bearing = 135): LonLat => {
  const p = destination(ORIGIN, along, bearing);
  return cross === 0 ? p : destination(p, cross, bearing + 90);
};

/** Metres between two points — the only assertion that matters for a placement tool. */
const apart = (a: LonLat, b: LonLat): number => haversine(a, b);

describe("rowAxis — the line a selection forms", () => {
  it("is the FARTHEST-APART pair, whatever order they were selected in", () => {
    const pts = [at(50, 0), at(200, 0), at(0, 0)];
    const axis = rowAxis(pts);
    expect(axis).not.toBeNull();
    expect([axis!.startIndex, axis!.endIndex].sort()).toEqual([1, 2]);
    expect(axis!.lengthM).toBeCloseTo(200, 6);
    // Index 1 comes first in the array, so it is the start and the bearing runs back up the row.
    // Not exactly 315: on a sphere the back-bearing is not the forward bearing + 180°, and over 200 m
    // at this latitude the meridians converge by ~0.0008°. That is geography, not slop.
    expect(axis!.bearing).toBeCloseTo(315, 2);
  });

  it("has no axis for fewer than two points, or for a pile of coincident ones", () => {
    expect(rowAxis([])).toBeNull();
    expect(rowAxis([at(0, 0)])).toBeNull();
    expect(rowAxis([at(0, 0), at(0.001, 0), at(0.002, 0)])).toBeNull(); // 2 mm apart: not a row
  });
});

describe("alongCross / fromAlongCross", () => {
  it("round-trips a point through the row's own frame to well under a millimetre", () => {
    // Stated as an absolute error rather than a decimal place, because the number is the point: the
    // frame is a tangent-plane one, and walking `cross` metres off a great circle that has already
    // turned slightly leaves ~0.3 mm on a 300 m row. The `.toc` writes 7 decimals — about 1.1 cm — so
    // a millimetre bar is thirty times finer than anything that can reach the file. If a future change
    // pushes this past 1 mm, that is a real regression and not rounding.
    const pts = [at(0, 0), at(300, 0)];
    const axis = rowAxis(pts)!;
    for (const [along, cross] of [
      [120, 40],
      [-25, -13],
      [300, 0],
      [0, 0],
    ]) {
      const back = alongCross(axis, fromAlongCross(axis, along, cross));
      expect(Math.abs(back.along - along)).toBeLessThan(0.001);
      expect(Math.abs(back.cross - cross)).toBeLessThan(0.001);
    }
  });

  it("measures cross POSITIVE to the right of the bearing", () => {
    const axis = rowAxis([at(0, 0), at(100, 0)])!;
    expect(alongCross(axis, at(50, 20)).cross).toBeCloseTo(20, 6);
    expect(alongCross(axis, at(50, -20)).cross).toBeCloseTo(-20, 6);
  });
});

describe("lineUp — straighten onto the row", () => {
  it("pulls a strayed object onto the line without changing where it sits along it", () => {
    const pts = [at(0, 0), at(50, 12), at(100, 0)];
    const out = lineUp(pts);
    const axis = rowAxis(out)!;
    expect(alongCross(axis, out[1]).cross).toBeCloseTo(0, 6);
    expect(alongCross(axis, out[1]).along).toBeCloseTo(50, 3); // its place along the row is untouched
    expect(apart(pts[1], out[1])).toBeCloseTo(12, 3); // it moved exactly its offset, no more
  });

  it("leaves the two objects that define the axis exactly where they are", () => {
    const pts = [at(0, 0), at(50, 12), at(100, 0)];
    const out = lineUp(pts);
    // Same REFERENCE, not merely the same coordinates: the caller uses identity to tell a real move
    // from a no-op, which is what keeps an untouched object out of the undo entry.
    expect(out[0]).toBe(pts[0]);
    expect(out[2]).toBe(pts[2]);
  });

  it("is a total no-op on an already-straight row", () => {
    const pts = [at(0, 0), at(50, 0), at(100, 0)];
    expect(lineUp(pts)).toEqual(pts);
    expect(lineUp(pts).every((p, i) => p === pts[i])).toBe(true);
  });

  it("returns the input untouched when there is no row at all", () => {
    const pts = [at(0, 0)];
    expect(lineUp(pts)).toBe(pts);
  });
});

describe("spaceEvenly — equalise the gaps", () => {
  it("centres a lopsided middle object between the two ends", () => {
    const pts = [at(0, 0), at(10, 0), at(100, 0)];
    const out = spaceEvenly(pts);
    expect(apart(out[0], out[1])).toBeCloseTo(50, 3);
    expect(apart(out[1], out[2])).toBeCloseTo(50, 3);
    expect(out[0]).toBe(pts[0]); // the ends define the span and never move
    expect(out[2]).toBe(pts[2]);
  });

  it("keeps each object's offset ACROSS the row — it re-spaces, it does not straighten", () => {
    const pts = [at(0, 0), at(10, 7), at(100, 0)];
    const out = spaceEvenly(pts);
    const axis = rowAxis(out)!;
    expect(alongCross(axis, out[1]).cross).toBeCloseTo(7, 3);
    expect(alongCross(axis, out[1]).along).toBeCloseTo(50, 3);
  });

  it("spreads five objects at equal steps and keeps their order", () => {
    const pts = [at(0, 0), at(7, 0), at(9, 0), at(11, 0), at(200, 0)];
    const out = spaceEvenly(pts);
    for (let i = 1; i < out.length; i++) expect(apart(out[i - 1], out[i])).toBeCloseTo(50, 3);
  });

  it("needs three objects — two are already evenly spaced by definition", () => {
    const pts = [at(0, 0), at(100, 0)];
    expect(spaceEvenly(pts)).toBe(pts);
  });
});

// REAL DATA — three of the seven B747s ApfelFlieger parked at KMZJ (forum #152, positions read out of
// the .toc he attached). He dragged each one by hand, so the row runs at 134.46° and is off by
// centimetres: exactly the mess these two operations exist to clean up, and a check that the maths
// behaves on coordinates from the field rather than ones this test built.
const KMZJ_ROW: LonLat[] = [
  { lon: -111.3285720348358, lat: 32.510263877778215 }, // b747_afr
  { lon: -111.32800340652467, lat: 32.50979792641912 }, // b747_baw
  { lon: -111.32742941379549, lat: 32.50931840114307 }, // b747_sia
];

describe("arrange — ApfelFlieger's hand-dragged row at KMZJ", () => {
  it("reads as a 150 m row at 134.5°, with the middle aircraft 36 cm off the line", () => {
    const axis = rowAxis(KMZJ_ROW)!;
    expect(axis.lengthM).toBeCloseTo(150.11, 1);
    expect(axis.bearing).toBeCloseTo(134.46, 1);
    expect(alongCross(axis, KMZJ_ROW[1]).cross).toBeCloseTo(-0.36, 1);
  });

  it("lineUp moves only that aircraft, and only by those 36 cm", () => {
    const out = lineUp(KMZJ_ROW);
    expect(out[0]).toBe(KMZJ_ROW[0]);
    expect(out[2]).toBe(KMZJ_ROW[2]);
    expect(apart(KMZJ_ROW[1], out[1])).toBeCloseTo(0.36, 1);
  });

  it("spaceEvenly closes the 74.35 / 75.76 m gap into two equal halves", () => {
    expect(apart(KMZJ_ROW[0], KMZJ_ROW[1])).toBeCloseTo(74.35, 1);
    expect(apart(KMZJ_ROW[1], KMZJ_ROW[2])).toBeCloseTo(75.76, 1);
    const out = spaceEvenly(KMZJ_ROW);
    expect(apart(out[0], out[1])).toBeCloseTo(75.05, 1);
    expect(apart(out[1], out[2])).toBeCloseTo(75.05, 1);
  });

  it("both together give a straight row with equal gaps", () => {
    const out = spaceEvenly(lineUp(KMZJ_ROW));
    const axis = rowAxis(out)!;
    for (const p of out) expect(Math.abs(alongCross(axis, p).cross)).toBeLessThan(0.01);
    expect(apart(out[0], out[1])).toBeCloseTo(apart(out[1], out[2]), 6);
  });
});
