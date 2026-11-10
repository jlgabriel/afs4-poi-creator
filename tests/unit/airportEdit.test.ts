// Duplicating airport parts, bending a line's edges, and lining a ground text up with a runway.
import { describe, it, expect } from "vitest";
import {
  addAirportAerotow,
  addAirportCarlot,
  addAirportGroundText,
  addAirportJetway,
  addAirportLine,
  addAirportPad,
  addAirportParking,
  addAirportRunway,
  addAirportTarmac,
  addAirportTaxisign,
  addAirportWinch,
  createProject,
  duplicateAirportPart,
  setAirportLinePoints,
  setAirportLineShape,
  straightenAirportLine,
  type DuplicableAirportPart,
} from "../../src/core/project/mutate";
import { lineBends, linePath, linesOf, runwayAlignedHeading, runwaysOf } from "../../src/core/project/airport";
import { sagittaAt } from "../../src/core/geo/arc";
import { destination, haversine, initialBearing } from "../../src/core/geo/geo";
import { zProject } from "../../src/core/project/schemas";
import type { LonLat, Project, ProjectAirport } from "../../src/core/project/types";

const near = (got: number, want: number, tol: number): void => expect(Math.abs(got - want)).toBeLessThan(tol);
const angleDiff = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

const CAMERA = { lon: -71.6153, lat: -33.6564, zoom: 15 };
const NOW = "2026-11-10T00:00:00.000Z";
const LATER = "2026-11-10T01:00:00.000Z";
const P0: LonLat = { lon: -71.6153, lat: -33.6564 };
const base = (): Project => createProject({ name: "t", camera: CAMERA, now: NOW });

/** One of every duplicable kind, with known ids. */
function everything(): Project {
  let p = base();
  p = addAirportPad(p, P0, 10, NOW, "pad");
  p = addAirportRunway(p, destination(P0, 500, 230), destination(P0, 500, 50), { id: "rwy", width: 30, identifiers: ["05", "23"] }, NOW);
  p = addAirportParking(p, destination(P0, 100, 0), "parked_jet", NOW, "stand");
  p = addAirportAerotow(p, destination(P0, 100, 90), NOW, "tow");
  p = addAirportWinch(p, destination(P0, 100, 180), destination(P0, 900, 180), NOW, "winch");
  p = addAirportTarmac(p, [P0, destination(P0, 60, 90), destination(P0, 60, 0)], { id: "tarmac" }, NOW);
  p = addAirportLine(p, [P0, destination(P0, 80, 45)], { id: "line" }, NOW);
  p = addAirportGroundText(p, destination(P0, 50, 270), { id: "text" }, NOW);
  p = addAirportTaxisign(p, destination(P0, 60, 270), { id: "sign" }, NOW);
  p = addAirportJetway(p, destination(P0, 70, 270), { id: "jet" }, NOW);
  p = addAirportCarlot(p, destination(P0, 80, 270), { id: "cars" }, NOW);
  return p;
}

const LIST: Record<DuplicableAirportPart, keyof ProjectAirport> = {
  pad: "pads",
  runway: "runways",
  parking: "parkings",
  aerotow: "aerotows",
  winch: "winches",
  tarmac: "tarmacs",
  line: "lines",
  groundtext: "groundtexts",
  taxisign: "taxisigns",
  jetway: "jetways",
  carlot: "carlots",
};
const SOURCE: Record<DuplicableAirportPart, string> = {
  pad: "pad",
  runway: "rwy",
  parking: "stand",
  aerotow: "tow",
  winch: "winch",
  tarmac: "tarmac",
  line: "line",
  groundtext: "text",
  taxisign: "sign",
  jetway: "jet",
  carlot: "cars",
};

/** Every point an element has, in a fixed order. */
function pointsOf(item: Record<string, unknown>): LonLat[] {
  const out: LonLat[] = [];
  if (item.position) out.push(item.position as LonLat);
  if (item.winch) out.push(item.winch as LonLat);
  if (Array.isArray(item.points)) out.push(...(item.points as LonLat[]));
  if (Array.isArray(item.ends)) out.push(...(item.ends as { threshold: LonLat }[]).map((e) => e.threshold));
  return out;
}

describe("duplicateAirportPart", () => {
  for (const kind of Object.keys(LIST) as DuplicableAirportPart[]) {
    it(`copies a ${kind}: every field kept, a new id, moved as one piece, appended`, () => {
      const p = everything();
      const q = duplicateAirportPart(p, kind, SOURCE[kind], { id: "copy" }, LATER);
      const before = p.airport![LIST[kind]] as unknown as Record<string, unknown>[];
      const after = q.airport![LIST[kind]] as unknown as Record<string, unknown>[];
      expect(after).toHaveLength(before.length + 1);
      const src = before.find((x) => x.id === SOURCE[kind])!;
      const copy = after[after.length - 1]!;
      expect(copy.id).toBe("copy");
      expect(q.modifiedAt).toBe(LATER);
      // Only the points differ…
      const strip = (x: Record<string, unknown>): unknown =>
        JSON.parse(JSON.stringify(x, (k, v) => (k === "id" || k === "position" || k === "winch" || k === "points" || k === "threshold" ? undefined : v)));
      expect(strip(copy)).toEqual(strip(src));
      // …and they all moved by the same offset, a visible one.
      const a = pointsOf(src);
      const b = pointsOf(copy);
      expect(b).toHaveLength(a.length);
      const d0 = haversine(a[0]!, b[0]!);
      const br0 = initialBearing(a[0]!, b[0]!);
      expect(d0).toBeGreaterThanOrEqual(2);
      a.forEach((pa, i) => {
        near(haversine(pa, b[i]!), d0, 0.05);
        expect(angleDiff(initialBearing(pa, b[i]!), br0)).toBeLessThan(0.5);
      });
      // The original is untouched.
      expect(before.find((x) => x.id === SOURCE[kind])).toBe(src);
    });
  }

  it("puts a runway's copy alongside it, two widths across", () => {
    const p = everything();
    const q = duplicateAirportPart(p, "runway", "rwy", { id: "copy" });
    const [r, c] = runwaysOf(q.airport);
    const axis = initialBearing(r!.ends[0].threshold, r!.ends[1].threshold);
    near(haversine(r!.ends[0].threshold, c!.ends[0].threshold), 60, 0.1);
    expect(angleDiff(initialBearing(r!.ends[0].threshold, c!.ends[0].threshold), axis + 90)).toBeLessThan(0.5);
    expect(c!.ends.map((e) => e.identifier)).toEqual(["05", "23"]);
  });

  it("keeps the pad mirror on the first pad", () => {
    const q = duplicateAirportPart(everything(), "pad", "pad", { id: "copy" });
    expect(q.airport!.pads.map((x) => x.id)).toEqual(["pad", "copy"]);
    expect(q.airport!.pad).toBe(q.airport!.pads[0]);
  });

  it("copies a line's curves with it", () => {
    let p = everything();
    p = setAirportLineShape(p, "line", linesOf(p.airport)[0]!.points, [15]);
    const q = duplicateAirportPart(p, "line", "line", { id: "copy" });
    expect(linesOf(q.airport)[1]!.bends).toEqual([15]);
  });

  it("leaves the project alone for an unknown id or no airport", () => {
    const p = everything();
    expect(duplicateAirportPart(p, "jetway", "nope")).toBe(p);
    const empty = base();
    expect(duplicateAirportPart(empty, "pad", "pad")).toBe(empty);
  });

  it("gives a copy that still validates", () => {
    let p = everything();
    for (const kind of Object.keys(LIST) as DuplicableAirportPart[]) p = duplicateAirportPart(p, kind, SOURCE[kind]);
    expect(() => zProject.parse(p)).not.toThrow();
  });
});

describe("a line's bends", () => {
  const A = P0;
  const B = destination(P0, 100, 90);
  const C = destination(B, 100, 0);
  const withLine = (): Project => addAirportLine(base(), [A, B, C], { id: "n" }, NOW);

  it("starts straight, with no bends key at all", () => {
    const l = linesOf(withLine().airport)[0]!;
    expect("bends" in l).toBe(false);
    expect(lineBends(l)).toEqual([0, 0]);
    expect(linePath(l)).toEqual(l.points);
  });

  it("stores one bend per edge, clamped to the chord and kept to the millimetre", () => {
    const p = setAirportLineShape(withLine(), "n", [A, B, C], [12.34567, 9999], LATER);
    const l = linesOf(p.airport)[0]!;
    expect(l.bends).toEqual([12.346, 100]);
    expect(p.modifiedAt).toBe(LATER);
  });

  it("drops the key when every edge is straight again", () => {
    let p = setAirportLineShape(withLine(), "n", [A, B, C], [10, 0]);
    p = setAirportLineShape(p, "n", [A, B, C], [0, 0]);
    expect("bends" in linesOf(p.airport)[0]!).toBe(false);
    p = setAirportLineShape(p, "n", [A, B, C], [0, 5]);
    p = straightenAirportLine(p, "n");
    expect("bends" in linesOf(p.airport)[0]!).toBe(false);
    expect(straightenAirportLine(p, "n")).toBe(p);
  });

  it("keeps the bends through a move of the same points, and loses them when the count changes", () => {
    const p = setAirportLineShape(withLine(), "n", [A, B, C], [10, -5]);
    const moved = [A, B, C].map((x) => destination(x, 3, 0));
    expect(linesOf(setAirportLinePoints(p, "n", moved).airport)[0]!.bends).toEqual([10, -5]);
    expect("bends" in linesOf(setAirportLinePoints(p, "n", [A, C]).airport)[0]!).toBe(false);
  });

  it("paints the arc: the path passes through the bent edge's middle", () => {
    const p = setAirportLineShape(withLine(), "n", [A, B, C], [20, 0]);
    const path = linePath(linesOf(p.airport)[0]!);
    expect(path.length).toBeGreaterThan(3);
    expect(path[0]).toEqual(A);
    expect(path[path.length - 1]).toEqual(C);
    // The first edge bulges 20 m to its left at most (within the arc's drawing tolerance); the second
    // edge stays straight.
    const firstEdge = path.slice(0, path.indexOf(path.find((q) => q.lon === B.lon && q.lat === B.lat)!) + 1);
    near(Math.max(...firstEdge.map((q) => sagittaAt(A, B, q))), 20, 0.11);
    expect(firstEdge.length).toBeGreaterThan(2);
    expect(path.slice(firstEdge.length)).toEqual([C]);
  });

  it("survives a save: the schema takes it and an old file without it loads", () => {
    const p = setAirportLineShape(withLine(), "n", [A, B, C], [20, 0]);
    expect(zProject.parse(JSON.parse(JSON.stringify(p))).airport!.lines![0]!.bends).toEqual([20, 0]);
    expect(() => zProject.parse(withLine())).not.toThrow();
  });
});

describe("runwayAlignedHeading", () => {
  const rwyAt = (p: Project, at: LonLat, axis: number, id: string): Project =>
    addAirportRunway(p, destination(at, 600, axis + 180), destination(at, 600, axis), { id }, NOW);

  it("is null without a runway", () => {
    expect(runwayAlignedHeading(P0, 10, [])).toBeNull();
  });

  it("turns to the nearest of parallel, square, or the two reverses — whichever is nearest the current heading", () => {
    const p = rwyAt(base(), P0, 47, "r");
    const rwys = runwaysOf(p.airport);
    const spot = destination(P0, 80, 137);
    near(runwayAlignedHeading(spot, 50, rwys)!, 47, 0.05);
    near(runwayAlignedHeading(spot, 100, rwys)!, 137, 0.05);
    near(runwayAlignedHeading(spot, 200, rwys)!, 227, 0.05);
    near(runwayAlignedHeading(spot, 330, rwys)!, 317, 0.05);
    // Across north.
    near(runwayAlignedHeading(spot, 359, rwys)!, 317, 0.05);
  });

  it("follows the NEAREST runway, measured to its centreline, not its middle", () => {
    let p = rwyAt(base(), P0, 0, "north-south");
    p = rwyAt(p, destination(P0, 2000, 90), 90, "east-west");
    const rwys = runwaysOf(p.airport);
    // 500 m from the N-S runway's centreline but near its end; the E-W one is ~1500 m away.
    const spot = destination(destination(P0, 550, 0), 500, 90);
    near(runwayAlignedHeading(spot, 10, rwys)!, 0, 0.05);
    // Right beside the E-W runway.
    near(runwayAlignedHeading(destination(P0, 2000, 90), 10, rwys)!, 0, 0.05); // square to E-W is 0 too
    near(runwayAlignedHeading(destination(P0, 2000, 90), 80, rwys)!, 90, 0.05);
  });

  it("is in [0, 360)", () => {
    const p = rwyAt(base(), P0, 0, "r");
    const h = runwayAlignedHeading(P0, 359.9, runwaysOf(p.airport))!;
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
