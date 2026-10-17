import { describe, it, expect } from "vitest";
import {
  addAirportLine,
  addAirportRunway,
  addAirportTarmac,
  createProject,
  removeAirportLine,
  removeAirportTarmac,
  setAirportLineName,
  setAirportLinePoints,
  setAirportRunwayEndMarkings,
  setAirportRunwaySurface,
  setAirportTarmacPoints,
  updateAirportTarmac,
} from "../../src/core/project/mutate";
import { linesOf, tarmacsOf } from "../../src/core/project/airport";
import {
  LINE_NAMES,
  TARMAC_MATERIALS,
  clampBrightness,
  fmtBrightness,
  RUNWAY_MATERIALS,
  materialHasBrightness,
  runwayEndMarkings,
  tarmacLevel,
} from "../../src/core/project/surfaces";
import { zProject } from "../../src/core/project/schemas";
import type { LonLat, Project } from "../../src/core/project/types";

const CAMERA = { lon: -71.6153, lat: -33.6564, zoom: 15 };
const NOW = "2026-10-13T00:00:00.000Z";
const LATER = "2026-10-13T01:00:00.000Z";
const base = (): Project => createProject({ name: "t", camera: CAMERA, now: NOW });

const SQUARE: LonLat[] = [
  { lon: -71.6161, lat: -33.65595 },
  { lon: -71.6161, lat: -33.65605 },
  { lon: -71.616, lat: -33.65605 },
  { lon: -71.616, lat: -33.65595 },
];

describe("surface vocabulary", () => {
  it("has no duplicate names and keeps the double underscores", () => {
    expect(new Set(TARMAC_MATERIALS.map((m) => m.name)).size).toBe(TARMAC_MATERIALS.length);
    expect(new Set(LINE_NAMES).size).toBe(LINE_NAMES.length);
    expect(TARMAC_MATERIALS.map((m) => m.name)).toContain("asphalt_apron__typestd");
    expect(LINE_NAMES).toContain("taxi_center");
  });

  it("knows which materials take a brightness, and keeps an unknown name's", () => {
    expect(materialHasBrightness("flatten")).toBe(false);
    expect(materialHasBrightness("grass01")).toBe(false);
    expect(materialHasBrightness("concrete_plate__typeblue")).toBe(true);
    expect(materialHasBrightness("something_new")).toBe(true);
  });

  it("formats and snaps a brightness onto the converter's steps", () => {
    expect(fmtBrightness(0.5)).toBe("0.5");
    expect(fmtBrightness(1)).toBe("1.0");
    expect(clampBrightness(0.04)).toBe(0.1);
    expect(clampBrightness(0.66)).toBe(0.7);
    expect(clampBrightness(3)).toBe(1);
  });

  it("pins flatten to level 0 and every other material to 1 or higher", () => {
    expect(tarmacLevel("flatten", 1)).toBe(0);
    expect(tarmacLevel("flatten", 5)).toBe(0);
    expect(tarmacLevel("grass00", 0)).toBe(1);
    expect(tarmacLevel("grass00", 3)).toBe(3);
    expect(tarmacLevel("asphalt_apron__typestd", 1)).toBe(1);
  });

  it("offers a runway every material except flatten and hole", () => {
    const names = RUNWAY_MATERIALS.map((m) => m.name);
    expect(names).not.toContain("flatten");
    expect(names).not.toContain("hole");
    expect(names).toContain("concrete_apron__typestd");
    expect(names).toContain("asphalt_runway__typestd");
    expect(names).toHaveLength(TARMAC_MATERIALS.length - 2);
  });
});

describe("runway markings", () => {
  it("default to numbers, threshold and piano", () => {
    expect(runwayEndMarkings({})).toEqual({
      numbers: true,
      threshold: true,
      piano: true,
      skidmarks: false,
      touchdown: false,
      aimingPoint: false,
    });
  });

  it("are written whole on the first edit, and an edit that changes nothing is a no-op", () => {
    const p = addAirportRunway(base(), SQUARE[0]!, SQUARE[2]!, { id: "r1" }, NOW);
    const q = setAirportRunwayEndMarkings(p, "r1", 1, { touchdown: true }, LATER);
    expect(q.airport!.runways![0]!.ends[0].markings).toBeUndefined();
    expect(q.airport!.runways![0]!.ends[1].markings).toEqual({ ...runwayEndMarkings({}), touchdown: true });
    expect(setAirportRunwayEndMarkings(q, "r1", 1, { touchdown: true }, LATER)).toBe(q);
    expect(zProject.safeParse(q).success).toBe(true);
  });

  it("sidelines and centerline are absent until set", () => {
    const p = addAirportRunway(base(), SQUARE[0]!, SQUARE[2]!, { id: "r1" }, NOW);
    expect(p.airport!.runways![0]!.sidelines).toBeUndefined();
    const q = setAirportRunwaySurface(p, "r1", { centerline: false }, LATER);
    expect(q.airport!.runways![0]!.centerline).toBe(false);
    expect(q.airport!.runways![0]!.sidelines).toBeUndefined();
    expect(setAirportRunwaySurface(q, "r1", { centerline: false }, LATER)).toBe(q);
  });
});

describe("runway surface", () => {
  it("is absent until set, then set and snapped", () => {
    const p = addAirportRunway(base(), SQUARE[0]!, SQUARE[2]!, { id: "r1" }, NOW);
    expect(p.airport!.runways![0]!.material).toBeUndefined();
    const q = setAirportRunwaySurface(p, "r1", { material: "grass01", brightness: 0.73 }, LATER);
    expect(q.airport!.runways![0]).toMatchObject({ material: "grass01", brightness: 0.7 });
    expect(q.modifiedAt).toBe(LATER);
    expect(setAirportRunwaySurface(q, "r1", { material: "grass01" }, "x")).toBe(q);
    expect(setAirportRunwaySurface(q, "nope", { material: "x" }, "x")).toBe(q);
  });
});

describe("tarmac polygons", () => {
  it("adds one with the defaults, creating the airport and seeding its point at the centre", () => {
    const p = addAirportTarmac(base(), SQUARE, { id: "t1" }, LATER);
    expect(tarmacsOf(p.airport)).toEqual([
      { id: "t1", points: SQUARE, level: 1, material: "asphalt_apron__typestd", brightness: 0.5 },
    ]);
    expect(p.airport!.position!.lon).toBeCloseTo(-71.61605, 6);
    expect(tarmacsOf(p.airport)[0]!.points).not.toBe(SQUARE);
  });

  it("refuses fewer than three points, to add or to edit", () => {
    const b = base();
    expect(addAirportTarmac(b, SQUARE.slice(0, 2))).toBe(b);
    const p = addAirportTarmac(b, SQUARE, { id: "t1" }, NOW);
    expect(setAirportTarmacPoints(p, "t1", SQUARE.slice(0, 2))).toBe(p);
    const q = setAirportTarmacPoints(p, "t1", SQUARE.slice(0, 3), LATER);
    expect(tarmacsOf(q.airport)[0]!.points.length).toBe(3);
  });

  it("edits level, material and brightness, refusing a level below 1", () => {
    const p = addAirportTarmac(base(), SQUARE, { id: "t1" }, NOW);
    const q = updateAirportTarmac(p, "t1", { level: 2.4, material: "grass00", brightness: 0.95 }, LATER);
    expect(tarmacsOf(q.airport)[0]).toMatchObject({ level: 2, material: "grass00", brightness: 1 });
    expect(updateAirportTarmac(q, "t1", { level: 0 })).toBe(q);
    expect(updateAirportTarmac(q, "t1", { level: 2 })).toBe(q);
    // Flatten pins the level to 0 and ignores a level patch; another material lifts it back to 1.
    const f = updateAirportTarmac(q, "t1", { material: "flatten" }, LATER);
    expect(tarmacsOf(f.airport)[0]!.level).toBe(0);
    expect(updateAirportTarmac(f, "t1", { level: 4 })).toBe(f);
    expect(tarmacsOf(updateAirportTarmac(f, "t1", { material: "grass00" }, LATER).airport)[0]!.level).toBe(1);
  });

  it("removes by id", () => {
    const p = addAirportTarmac(addAirportTarmac(base(), SQUARE, { id: "t1" }, NOW), SQUARE, { id: "t2" }, NOW);
    const q = removeAirportTarmac(p, "t1", LATER);
    expect(tarmacsOf(q.airport).map((t) => t.id)).toEqual(["t2"]);
    expect(removeAirportTarmac(q, "t1")).toBe(q);
  });
});

describe("painted lines", () => {
  it("adds one named taxi_center, edits its points and name, removes it", () => {
    const p = addAirportLine(base(), SQUARE.slice(0, 2), { id: "n1" }, NOW);
    expect(linesOf(p.airport)).toEqual([{ id: "n1", points: SQUARE.slice(0, 2), name: "taxi_center" }]);
    expect(addAirportLine(p, SQUARE.slice(0, 1))).toBe(p);
    expect(setAirportLinePoints(p, "n1", SQUARE.slice(0, 1))).toBe(p);
    const q = setAirportLineName(setAirportLinePoints(p, "n1", SQUARE, LATER), "n1", "hold_pos_b", LATER);
    expect(linesOf(q.airport)[0]).toMatchObject({ name: "hold_pos_b" });
    expect(linesOf(q.airport)[0]!.points.length).toBe(4);
    expect(linesOf(removeAirportLine(q, "n1", LATER).airport)).toEqual([]);
  });
});

describe("project.json", () => {
  it("round-trips tarmacs, lines and a runway surface through the schema", () => {
    let p = addAirportTarmac(base(), SQUARE, { id: "t1" }, NOW);
    p = addAirportLine(p, SQUARE.slice(0, 2), { id: "n1" }, NOW);
    p = addAirportRunway(p, SQUARE[0]!, SQUARE[2]!, { id: "r1" }, NOW);
    p = setAirportRunwaySurface(p, "r1", { material: "asphalt_runway__typeblue", brightness: 0.3 }, NOW);
    const back = zProject.parse(JSON.parse(JSON.stringify(p)));
    expect(back.airport?.tarmacs).toEqual(p.airport!.tarmacs);
    expect(back.airport?.lines).toEqual(p.airport!.lines);
    expect(back.airport?.runways?.[0]).toMatchObject({ material: "asphalt_runway__typeblue", brightness: 0.3 });
  });
});
