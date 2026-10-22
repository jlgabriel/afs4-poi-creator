import { describe, expect, it } from "vitest";
import type { PlacedObject, Project, ResolvedObject } from "../../src/core/project/types";
import { planTap } from "../../src/core/export/planExport";
import { TapImportError, parseTmLenient, readTap } from "../../src/core/import/tapReader";
import {
  addAirportAerotow,
  addAirportCarlot,
  addAirportGroundText,
  addAirportJetway,
  addAirportTaxisign,
  addAirportWinch,
  rotateAirportMark,
  setAirportRunwayEndMarkings,
  setAirportRunwaySurface,
  updateAirportGroundText,
  updateAirportJetway,
  updateAirportRunwayEnd,
  updateAirportTaxisign,
} from "../../src/core/project/mutate";

// A synthetic airport under a fictitious code, with one of every element. Headings NON-cardinal.
const BASE: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "Import fixture",
  poiName: "",
  createdAt: "2026-10-16T00:00:00.000Z",
  modifiedAt: "2026-10-16T00:00:00.000Z",
  reference: null,
  camera: { lon: -71.6153, lat: -33.6564, zoom: 15 },
  objects: [
    {
      id: "p1",
      kind: "plant",
      position: { lon: -71.616, lat: -33.6558 },
      height: { mode: "terrain" },
      group: "conifer_forest",
      species: "02",
      heightRange: [20.1, 22.5],
    },
    {
      id: "l1",
      kind: "light",
      position: { lon: -71.61585, lat: -33.6558 },
      height: { mode: "asl", value: 76 },
      color: [1, 1, 0],
      intensity: 1000,
      flashing: [1, 0, 3, 0],
      groupIndex: 3,
    },
    {
      id: "al1",
      kind: "airport_light",
      position: { lon: -71.6159, lat: -33.6558 },
      height: { mode: "asl", value: 69 },
      typeName: "helipad_large_flood_light",
      configuration: "g",
      orientation: 30,
      groupIndex: 0,
    },
    {
      id: "x1",
      kind: "xref",
      position: { lon: -71.6183, lat: -33.6575 },
      height: { mode: "terrain" },
      name: "airport_windsock_large1",
      direction: 37,
      scale: 1,
    },
  ],
  airport: {
    icao: "pctt01",
    name: "Santo Domingo Test",
    country: "cl",
    position: { lon: -71.6153, lat: -33.6564 },
    elevation: 75,
    boundary: [
      { lon: -71.6248, lat: -33.6602 },
      { lon: -71.6224, lat: -33.6628 },
      { lon: -71.6093, lat: -33.6548 },
      { lon: -71.6114, lat: -33.6523 },
    ],
    pads: [{ id: "h1", name: "Helipad_W", position: { lon: -71.616, lat: -33.656 }, heading: 92, radius: 8 }],
    runways: [
      {
        id: "r1",
        width: 18,
        ends: [
          {
            threshold: { lon: -71.61931, lat: -33.65866 },
            identifier: "05",
            appltsys: "none",
            papi: "left",
            reil: "omni",
            approach: true,
            takeoff: true,
          },
          {
            threshold: { lon: -71.61213, lat: -33.65465 },
            identifier: "23L",
            appltsys: "malsr",
            papi: "none",
            reil: "none",
            approach: false,
            takeoff: true,
          },
        ],
      },
    ],
    parkings: [
      { id: "s1", name: "Parking_G", position: { lon: -71.6151, lat: -33.6554 }, heading: 143, size: 7.5, type: "parked_jet" },
    ],
    tarmacs: [
      {
        id: "t0",
        points: [
          { lon: -71.6171, lat: -33.65595 },
          { lon: -71.6171, lat: -33.65705 },
          { lon: -71.616, lat: -33.65705 },
        ],
        level: 0,
        material: "flatten",
        brightness: 0.5,
      },
      {
        id: "t1",
        points: [
          { lon: -71.6161, lat: -33.65595 },
          { lon: -71.6161, lat: -33.65605 },
          { lon: -71.616, lat: -33.65605 },
          { lon: -71.616, lat: -33.65595 },
        ],
        level: 2,
        material: "concrete_apron__typeblue",
        brightness: 0.7,
      },
    ],
    lines: [
      {
        id: "n1",
        points: [
          { lon: -71.6161, lat: -33.656 },
          { lon: -71.616, lat: -33.656 },
          { lon: -71.6159, lat: -33.6561 },
        ],
        name: "holdshort",
      },
    ],
  },
};

function fixture(): Project {
  let p = BASE;
  p = setAirportRunwaySurface(p, "r1", { material: "concrete_apron__typestd", brightness: 0.8, sidelines: false });
  p = setAirportRunwayEndMarkings(p, "r1", 1, { numbers: false, touchdown: true, aimingPoint: true });
  p = updateAirportRunwayEnd(p, "r1", 0, { extension: 450 });
  p = addAirportGroundText(p, { lon: -71.6157, lat: -33.6562 }, { id: "g1" });
  p = updateAirportGroundText(p, "g1", { value: "TAXI B", pointing: "right", textColor: "white" });
  p = rotateAirportMark(p, "groundtexts", "g1", 47);
  p = addAirportTaxisign(p, { lon: -71.6156, lat: -33.6563 }, { id: "ts1" });
  p = rotateAirportMark(p, "taxisigns", "ts1", 211);
  p = updateAirportTaxisign(p, "ts1", {
    elements: [
      { type: "runway", value: "23L-05R" },
      { type: "linebreak", value: "" },
      { type: "destination", value: "B<RIGHT30><HOLD1>" },
    ],
  });
  p = addAirportJetway(p, { lon: -71.6155, lat: -33.6565 }, { id: "j1" });
  p = updateAirportJetway(p, "j1", { extensionDirection: -35, extensionAmount: 12.5, exitDirection: 20, docked: true });
  p = addAirportCarlot(p, { lon: -71.6154, lat: -33.6566 }, { id: "c1" });
  p = addAirportAerotow(p, { lon: -71.6188, lat: -33.6581 }, undefined, "a1");
  p = addAirportWinch(p, { lon: -71.6187, lat: -33.6582 }, { lon: -71.611, lat: -33.653 }, undefined, "w1");
  return p;
}

/** Lights as Export TAP gets them: their ASL height resolved. */
const resolved = (objects: readonly PlacedObject[]): ResolvedObject[] =>
  objects
    .filter((o) => o.kind === "light" || o.kind === "airport_light")
    .map((o) => ({ ...o, heightAsl: o.height.mode === "asl" ? o.height.value : 0 })) as ResolvedObject[];

const exportTap = (p: Project): { tap: string; addendum: string | null } => {
  const plan = planTap(p, resolved(p.objects));
  return { tap: plan.content, addendum: plan.addendum.content };
};

describe("Import TAP — round trip", () => {
  it("export → import → export writes the same two files", () => {
    const first = exportTap(fixture());
    const imported = readTap(first.tap, first.addendum, { now: "2026-10-16T00:00:00.000Z" });
    expect(imported.warnings).toEqual([]);
    const second = exportTap(imported.project);
    expect(second.tap).toBe(first.tap);
    expect(second.addendum).toBe(first.addendum);
  });

  it("brings back the project's own values, not only the same file", () => {
    const first = exportTap(fixture());
    const a = readTap(first.tap, first.addendum).project.airport!;
    expect(a.icao).toBe("pctt01");
    expect(a.elevation).toBe(75);
    expect(a.boundary).toHaveLength(4); // the closing point is dropped
    expect(a.pads[0]!.name).toBe("Helipad_W");
    expect(a.runways![0]!.ends[1].markings).toMatchObject({ numbers: false, touchdown: true, aimingPoint: true });
    expect(a.runways![0]!.sidelines).toBe(false);
    expect(a.runways![0]!.ends[0].extension).toBe(450);
    expect(a.runways![0]!.ends[1].extension).toBeUndefined(); // 0 imports as absent, the model's default
    expect(a.tarmacs!.map((t) => t.level)).toEqual([0, 2]);
    expect(a.taxisigns![0]!.heading).toBeCloseTo(211, 6);
    expect(a.jetways![0]).toMatchObject({ extensionDirection: -35, extensionAmount: 12.5, exitDirection: 20, docked: true });
    expect(a.winches).toHaveLength(1);
    expect(a.aerotows).toHaveLength(1);
    // The writer's filler names come back empty.
    expect(a.groundtexts![0]!.name).toBe("");
    expect(a.taxisigns![0]!.name).toBe("");
  });
});

describe("Import TAP — tolerance", () => {
  const first = exportTap(fixture());

  it("ignores element numbering and order, and the order of rows inside an element", () => {
    // Every element number set to 7, and every element's rows reversed.
    const renumbered = first.tap.replace(/\[element\]\[\d+\]/g, "[element][7]");
    const lines = renumbered.split("\n");
    const out: string[] = [];
    let rows: string[] = [];
    for (const l of lines) {
      if (/^\s*<\[[^\]]*\]\[[^\]]*\]\[[^\]]*\]>\s*$/.test(l)) rows.push(l);
      else {
        out.push(...rows.reverse(), l);
        rows = [];
      }
    }
    out.push(...rows.reverse());
    const shuffled = out.join("\n");
    expect(shuffled).not.toBe(first.tap);
    const imported = readTap(shuffled, first.addendum);
    expect(exportTap(imported.project).tap).toBe(first.tap);
  });

  it("cleans an extended runway that is not whole metres in range, and says so", () => {
    const odd = first.tap.replace("<[float64][xtension][450]>", "<[float64][xtension][12.7]>");
    expect(odd).not.toBe(first.tap);
    const imported = readTap(odd, first.addendum);
    expect(imported.project.airport!.runways![0]!.ends[0].extension).toBe(13);
    expect(imported.warnings.some((w) => /extended runway 12\.7 m/.test(w))).toBe(true);
  });

  it("fills a missing row with the default and says so, and keeps the element", () => {
    const noWidth = first.tap.replace(/\s*<\[float64\]\[width\]\[[^\]]*\]>/, "");
    const r = readTap(noWidth, null);
    expect(r.project.airport!.runways).toHaveLength(1);
    expect(r.warnings.join(" | ")).toMatch(/Runway 1: width/);
  });

  it("leaves out an element it cannot place, and says which", () => {
    const noPos = first.tap.replace(
      /(<\[tm_airport_pd_carlot\]\[element\]\[0\]\s*)<\[vector2_float64\]\[position\]\[[^\]]*\]>/,
      "$1",
    );
    const r = readTap(noPos, null);
    expect(r.project.airport!.carlots).toBeUndefined();
    expect(r.warnings.join(" | ")).toMatch(/Car lot 1 has no readable position/);
  });

  it("reads a file whose last blocks were never closed", () => {
    const cut = first.tap.trimEnd().replace(/>\s*>\s*$/, "");
    const r = readTap(cut, null);
    expect(r.project.airport!.carlots).toHaveLength(1);
    expect(r.warnings.join(" | ")).toMatch(/ended before every block was closed/);
    expect(parseTmLenient(cut).closedAtEnd).toBe(2);
  });

  it("takes rows typed differently (string vs string8, float32 vs float64)", () => {
    const retyped = first.tap.replace(/\[string8\]\[material\]/g, "[string][material]").replace(/\[float64\]/g, "[float32]");
    const r = readTap(retyped, null);
    expect(r.project.airport!.tarmacs![1]!.material).toBe("concrete_apron__typeblue");
    expect(r.project.airport!.runways![0]!.width).toBe(18);
  });

  it("imports without the addendum, and without lists the file does not have", () => {
    const r = readTap(first.tap, null);
    expect(r.project.airport!.winches).toBeUndefined();
    const minimal = `<[file][][]
    <[tm_airport_pd][][]
        <[string8][name][Tiny]>
        <[stringt8c][icao][PCTT02]>
        <[vector2_float64][model_center][-70.5 -33.4]>
    >
>`;
    const m = readTap(minimal, null).project;
    expect(m.airport).toMatchObject({ icao: "pctt02", name: "Tiny", position: { lon: -70.5, lat: -33.4 } });
    expect(m.objects).toEqual([]);
  });

  it("refuses a file with no airport in it", () => {
    expect(() => readTap("hello", null)).toThrow(TapImportError);
    expect(() => readTap("<[file][][] <[tmsimulator_scenery_place][][] > >", null)).toThrow(TapImportError);
  });
});
