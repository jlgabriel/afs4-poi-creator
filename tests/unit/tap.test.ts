import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Project, ResolvedAirportLight, ResolvedLight } from "../../src/core/project/types";
import {
  InvalidHeliportIdentityError,
  NeedsAirportElevationError,
  NoAirportError,
  planTap,
} from "../../src/core/export/planExport";
import { buildTapAddendum, tapAddendumFileName, tapFileName } from "../../src/core/export/tapWriter";
import { NoTapDirError, TapFileExistsError, writeTap } from "../../src/main/tapExport";
import { parseTm, type TmNode } from "../../src/core/tm/tmParser";

// A small synthetic airport: one runway, one helipad, one stand and one object of each kind, under a
// fictitious code. Headings are NON-cardinal on purpose.

const TAP_LIGHT: ResolvedLight = {
  id: "l1",
  kind: "light",
  position: { lon: -71.61585, lat: -33.6558 },
  color: [1, 1, 0],
  intensity: 1000,
  flashing: [1, 0, 3, 0],
  groupIndex: 3,
  heightAsl: 76,
};

const TAP_AIRPORT_LIGHT: ResolvedAirportLight = {
  id: "al1",
  kind: "airport_light",
  position: { lon: -71.6159, lat: -33.6558 },
  typeName: "helipad_large_flood_light",
  configuration: "",
  orientation: 30,
  groupIndex: 0,
  heightAsl: 69,
};

const TAP_LIGHTS = [TAP_LIGHT, TAP_AIRPORT_LIGHT];

const TAP_PROJECT: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "TAP fixture",
  poiName: "tap_fixture",
  createdAt: "2026-10-12T00:00:00.000Z",
  modifiedAt: "2026-10-12T00:00:00.000Z",
  reference: null,
  camera: { lon: -71.6153, lat: -33.6564, zoom: 15 },
  heightMode: "baked-asl",
  objects: [
    {
      id: "p1",
      kind: "plant",
      position: { lon: -71.616, lat: -33.6558 },
      height: { mode: "terrain" },
      group: "conifer_forest",
      species: "02",
      heightRange: [20.14, 20.14],
    },
    { ...TAP_LIGHT, height: { mode: "terrain-offset", offset: 1 } },
    { ...TAP_AIRPORT_LIGHT, height: { mode: "terrain" } },
    {
      id: "x1",
      kind: "xref",
      position: { lon: -71.6183, lat: -33.6575 },
      height: { mode: "terrain" },
      name: "airport_windsock_large1",
      direction: 37,
      scale: 1,
    },
  ].map((o) => {
    const { heightAsl: _drop, ...rest } = o as typeof o & { heightAsl?: number };
    return rest;
  }) as Project["objects"],
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
            identifier: "",
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
      { id: "s1", name: "Parking_G", position: { lon: -71.6151, lat: -33.6554 }, heading: 143, size: 7.5, type: "parked_ga" },
    ],
    tarmacs: [
      {
        id: "t1",
        points: [
          { lon: -71.6161, lat: -33.65595 },
          { lon: -71.6161, lat: -33.65605 },
          { lon: -71.616, lat: -33.65605 },
          { lon: -71.616, lat: -33.65595 },
        ],
        level: 1,
        material: "asphalt_apron__typestd",
        brightness: 0.5,
      },
    ],
    lines: [
      {
        id: "n1",
        points: [
          { lon: -71.6161, lat: -33.656 },
          { lon: -71.616, lat: -33.656 },
        ],
        name: "taxi_center",
      },
    ],
  },
};

/** Every node with this `name`, at any depth. */
function nodesByName(root: TmNode, name: string): TmNode[] {
  const out: TmNode[] = [];
  const walk = (n: TmNode): void => {
    if (n.name === name) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}
const valuesOf = (text: string, name: string): string[] => nodesByName(parseTm(text), name).map((n) => n.value);

// Row names, types and order follow a `.tap` the TAP converter accepts.
const GOLDEN_TAP = `<[file][][]
    <[tm_airport_pd][][]
        <[string8][name][Santo Domingo Test]>
        <[string8][name_short][Santo Domingo Test]>
        <[stringt8c][icao][PCTT01]>
        <[stringt8c][country][cl]>
        <[float64][elevation][75]>
        <[vector2_float64][model_center][-71.6153000 -33.6564000]>
        <[bool][auto_height][true]>
        <[vector2_float64][offset][0 0]>
        <[list_tm_airport_pd_boundary][boundaries][]
            <[tm_airport_pd_boundary][element][0]
                <[list_vector2_float64][points][ (-71.6248000 -33.6602000) (-71.6224000 -33.6628000) (-71.6093000 -33.6548000) (-71.6114000 -33.6523000) (-71.6248000 -33.6602000) ]>
            >
        >
        <[list_tm_airport_pd_custom_model][custom_models][]
        >
        <[list_tm_airport_pd_rwy_pair][runway_pairs][]
            <[tm_airport_pd_rwy_pair][element][0]
                <[array_tm_airport_pd_rwy][runway_pair][]
                    <[tm_airport_pd_rwy][element][0]
                        <[vector2_float64][threshold][-71.6193100 -33.6586600]>
                        <[float64][xtension][0]>
                        <[string8][identifier][05]>
                        <[string8][appltsys][none]>
                        <[string8][reil][omni]>
                        <[string8][papi][left]>
                        <[float64][direction][56.14]>
                        <[float64][elevation][75]>
                        <[bool][landing][true]>
                        <[bool][takeoff][true]>
                        <[bool][navigation][true]>
                        <[bool][departures][true]>
                        <[bool][non_precision][false]>
                        <[bool][precision][false]>
                        <[bool][marking_piano][true]>
                        <[bool][marking_touchdown][false]>
                        <[bool][marking_threshold][true]>
                        <[bool][marking_aimingpoint][false]>
                        <[bool][marking_nonumbers][false]>
                        <[bool][marking_skidmark][false]>
                    >
                    <[tm_airport_pd_rwy][element][1]
                        <[vector2_float64][threshold][-71.6121300 -33.6546500]>
                        <[float64][xtension][0]>
                        <[string8][identifier][]>
                        <[string8][appltsys][malsr]>
                        <[string8][reil][none]>
                        <[string8][papi][none]>
                        <[float64][direction][236.14]>
                        <[float64][elevation][75]>
                        <[bool][landing][false]>
                        <[bool][takeoff][true]>
                        <[bool][navigation][true]>
                        <[bool][departures][true]>
                        <[bool][non_precision][false]>
                        <[bool][precision][false]>
                        <[bool][marking_piano][true]>
                        <[bool][marking_touchdown][false]>
                        <[bool][marking_threshold][true]>
                        <[bool][marking_aimingpoint][false]>
                        <[bool][marking_nonumbers][true]>
                        <[bool][marking_skidmark][false]>
                    >
                >
                <[float64][width][18]>
                <[string8][material][asphalt_runway__typestd]>
                <[string8][brightness][0.5]>
                <[bool][marking_centreline][true]>
                <[bool][marking_sidelines][true]>
            >
        >
        <[list_tm_airport_pd_helipad][helipads][]
            <[tm_airport_pd_helipad][element][0]
                <[vector2_float64][position][-71.6160000 -33.6560000]>
                <[float64][direction][92]>
                <[float64][radius][8]>
                <[string8][name][Helipad_W]>
            >
        >
        <[list_tm_airport_pd_parking_position][parking_positions][]
            <[tm_airport_pd_parking_position][element][0]
                <[vector2_float64][position][-71.6151000 -33.6554000]>
                <[float64][direction][143]>
                <[float64][radius][7.5]>
                <[string8][name][Parking_G]>
                <[string8][type][parked_ga]>
            >
        >
        <[list_tm_airport_pd_tarmac][tarmacs][]
            <[tm_airport_pd_tarmac][element][0]
                <[list_vector2_float64][points][ (-71.6161000 -33.6559500) (-71.6161000 -33.6560500) (-71.6160000 -33.6560500) (-71.6160000 -33.6559500) (-71.6161000 -33.6559500) ]>
                <[int32][level][1]>
                <[string8][material][asphalt_apron__typestd]>
                <[string8][brightness][0.5]>
            >
        >
        <[list_tm_airport_pd_line][lines][]
            <[tm_airport_pd_line][element][0]
                <[list_vector2_float64][points][ (-71.6161000 -33.6560000) (-71.6160000 -33.6560000) ]>
                <[string8][name][taxi_center]>
            >
        >
        <[list_tm_airport_pd_plant][plants][]
            <[tm_airport_pd_plant][element][0]
                <[vector2_float64][position][-71.6160000 -33.6558000]>
                <[vector2_float32][height_range][20.14 20.14]>
                <[string8][group][conifer_forest]>
                <[string8][species][02]>
            >
        >
        <[list_tm_airport_pd_light][lights][]
            <[tm_airport_pd_light][element][0]
                <[vector3_float64][position][-71.6158500 -33.6558000 76.00]>
                <[vector3_float32][color][1 1 0]>
                <[float32][intensity][1000]>
                <[vector4_float32][flashing][1 0 3 0]>
                <[uint32][group_index][3]>
            >
        >
        <[list_tm_airport_pd_airportlight][airport_lights][]
            <[tm_airport_pd_airportlight][element][0]
                <[string8u][name][helipad_large_flood_light]>
                <[string8u][configuration][]>
                <[vector3_float64][position][-71.6159000 -33.6558000 69.00]>
                <[float64][direction][30]>
                <[uint32][group_index][0]>
            >
        >
        <[list_tm_airport_pd_xref][xrefs][]
            <[tm_airport_pd_xref][element][0]
                <[string8][name][airport_windsock_large1]>
                <[vector2_float64][position][-71.6183000 -33.6575000]>
                <[float64][direction][53]>
            >
        >
    >
>
`;

// The converter's own addendum layout: `stringt8c` names, bare `tmvector2d` points, compass `direction`.
const GOLDEN_ADDENDUM = `<[file][][]
    <[tm_airport_pd][][]
        <[list_tm_airport_pd_glider_winch][glider_winches][]
            <[tm_airport_pd_glider_winch][element][0]
                <[stringt8c][name][23]>
                <[tmvector2d][position][-71.6112000 -33.6541000]>
                <[tmvector2d][winch][-71.6226000 -33.6606000]>
                <[float32][spacing][25]>
            >
        >
        <[list_tm_airport_pd_glider_aerotow][glider_aerotows][]
            <[tm_airport_pd_glider_aerotow][element][0]
                <[stringt8c][name][23]>
                <[tmvector2d][position][-71.6123000 -33.6547400]>
                <[float64][direction][236]>
                <[tmvector2d][waypoints][]>
            >
        >
    >
>
`;

describe("Export TAP — the .tap file", () => {
  it("writes the whole airport and every object (golden)", () => {
    const plan = planTap(TAP_PROJECT, TAP_LIGHTS);
    expect(plan.fileName).toBe("PCTT01.tap");
    expect(plan.content).toBe(GOLDEN_TAP);
    expect(plan.warnings).toEqual([]);
  });

  it("parses back with PCT's own reader", () => {
    const root = parseTm(planTap(TAP_PROJECT, TAP_LIGHTS).content);
    expect(root.children[0]?.type).toBe("tm_airport_pd");
  });

  it("names the file after the code, in capitals", () => {
    expect(tapFileName("scsn")).toBe("SCSN.tap");
    expect(tapFileName(" pct001 ")).toBe("PCT001.tap");
  });

  it("gives an end without a runway number the direction from its threshold toward the other one", () => {
    // A north-south runway: the south end lands north (0), the north end lands south (180).
    const runway = TAP_PROJECT.airport!.runways![0]!;
    const ns: Project = {
      ...TAP_PROJECT,
      airport: {
        ...TAP_PROJECT.airport!,
        runways: [
          {
            ...runway,
            ends: [
              { ...runway.ends[0], threshold: { lon: -92.047, lat: 1.64 } },
              { ...runway.ends[1], threshold: { lon: -92.047, lat: 1.67 } },
            ],
          },
        ],
      },
    };
    const unnamed = (n: Project): Project => ({
      ...n,
      airport: {
        ...n.airport!,
        runways: n.airport!.runways!.map((r) => ({
          ...r,
          ends: [{ ...r.ends[0], identifier: "" }, { ...r.ends[1], identifier: "ALSF2" }],
        })),
      },
    });
    expect(valuesOf(planTap(unnamed(ns), []).content, "direction").slice(0, 2)).toEqual(["0", "180"]);
  });

  it("writes each end's extended runway into its `xtension` row, whole metres in range", () => {
    const runway = TAP_PROJECT.airport!.runways![0]!;
    const extended = (a: number | undefined, b: number | undefined): Project => ({
      ...TAP_PROJECT,
      airport: {
        ...TAP_PROJECT.airport!,
        runways: [{ ...runway, ends: [{ ...runway.ends[0], extension: a }, { ...runway.ends[1], extension: b }] }],
      },
    });
    expect(valuesOf(planTap(extended(450, undefined), []).content, "xtension")).toEqual(["450", "0"]);
    // A hand-edited project file is cleaned at the writer, not refused.
    expect(valuesOf(planTap(extended(12.6, 123456), []).content, "xtension")).toEqual(["13", "99999"]);
    expect(valuesOf(planTap(extended(-3, Number.NaN), []).content, "xtension")).toEqual(["0", "0"]);
  });

  it("writes each end's markings and the pair's side and centre lines; numbers is the negated row", () => {
    const runway = TAP_PROJECT.airport!.runways![0]!;
    const marked: Project = {
      ...TAP_PROJECT,
      airport: {
        ...TAP_PROJECT.airport!,
        runways: [
          {
            ...runway,
            sidelines: false,
            centerline: true,
            ends: [
              {
                ...runway.ends[0],
                markings: {
                  numbers: false,
                  threshold: false,
                  piano: false,
                  skidmarks: true,
                  touchdown: true,
                  aimingPoint: true,
                },
              },
              { ...runway.ends[1], identifier: "23" },
            ],
          },
        ],
      },
    };
    const c = planTap(marked, []).content;
    expect(valuesOf(c, "marking_nonumbers").slice(0, 2)).toEqual(["true", "false"]);
    expect(valuesOf(c, "marking_threshold").slice(0, 2)).toEqual(["false", "true"]);
    expect(valuesOf(c, "marking_piano").slice(0, 2)).toEqual(["false", "true"]);
    expect(valuesOf(c, "marking_skidmark").slice(0, 2)).toEqual(["true", "false"]);
    expect(valuesOf(c, "marking_touchdown").slice(0, 2)).toEqual(["true", "false"]);
    expect(valuesOf(c, "marking_aimingpoint").slice(0, 2)).toEqual(["true", "false"]);
    expect(valuesOf(c, "marking_sidelines")[0]).toBe("false");
    expect(valuesOf(c, "marking_centreline")[0]).toBe("true");
  });

  it("gives a numbered end the axis direction that matches its number, whichever threshold it sits at", () => {
    // "05" at the NORTH-EAST threshold and "23" at the south-west one: 05 still gets ~056, 23 ~236.
    const runway = TAP_PROJECT.airport!.runways![0]!;
    const swapped: Project = {
      ...TAP_PROJECT,
      airport: {
        ...TAP_PROJECT.airport!,
        runways: [
          {
            ...runway,
            ends: [
              { ...runway.ends[0], identifier: "05", threshold: runway.ends[1].threshold },
              { ...runway.ends[1], identifier: "23", threshold: runway.ends[0].threshold },
            ],
          },
        ],
      },
    };
    const dirs = valuesOf(planTap(swapped, []).content, "direction").slice(0, 2).map(Number);
    expect(dirs[0]).toBeCloseTo(56.14, 1);
    expect(dirs[1]).toBeCloseTo(236.14, 1);
    // A side letter does not hide the number.
    const lettered: Project = {
      ...swapped,
      airport: {
        ...swapped.airport!,
        runways: [{ ...swapped.airport!.runways![0]!, ends: [{ ...swapped.airport!.runways![0]!.ends[0], identifier: "05L" }, swapped.airport!.runways![0]!.ends[1]] }],
      },
    };
    expect(Number(valuesOf(planTap(lettered, []).content, "direction")[0])).toBeCloseTo(56.14, 1);
  });

  it("writes an XREF's compass heading, not its .toc rotation", () => {
    // .toc direction 37 ⇒ heading 90 − 37 = 53; .toc 120 ⇒ heading 330.
    const xref = TAP_PROJECT.objects.find((o) => o.kind === "xref")!;
    const p: Project = { ...TAP_PROJECT, objects: [{ ...xref, direction: 120 } as Project["objects"][number]] };
    const xrefs = nodesByName(parseTm(planTap(p, []).content), "xrefs")[0]!;
    expect(nodesByName(xrefs, "direction").map((n) => n.value)).toEqual(["330"]);
  });

  it("is always auto_height true, whatever the project's height mode", () => {
    const auto = planTap({ ...TAP_PROJECT, heightMode: "autoheight" }, TAP_LIGHTS).content;
    expect(valuesOf(auto, "auto_height")).toEqual(["true"]);
    expect(valuesOf(planTap(TAP_PROJECT, TAP_LIGHTS).content, "auto_height")).toEqual(["true"]);
  });

  it("takes the airport's elevation, else the terrain passed in, else refuses", () => {
    const { elevation: _e, ...noElev } = TAP_PROJECT.airport!;
    const terrainOnly: Project = { ...TAP_PROJECT, airport: noElev };
    // Airport + both runway ends.
    expect(valuesOf(planTap(terrainOnly, TAP_LIGHTS, 71.34).content, "elevation")).toEqual(["71.34", "71.34", "71.34"]);
    // A typed elevation wins over the terrain.
    expect(valuesOf(planTap(TAP_PROJECT, TAP_LIGHTS, 10).content, "elevation")[0]).toBe("75");
    expect(() => planTap(terrainOnly, TAP_LIGHTS)).toThrow(NeedsAirportElevationError);
  });

  it("omits empty lists, except custom_models, which is always there and always empty", () => {
    const { boundary: _b, ...noBoundary } = TAP_PROJECT.airport!;
    const bare: Project = {
      ...TAP_PROJECT,
      objects: [],
      airport: { ...noBoundary, runways: [], parkings: [], tarmacs: [], lines: [] },
    };
    const plan = planTap(bare, []);
    for (const list of ["runway_pairs", "parking_positions", "tarmacs", "lines", "plants", "lights", "airport_lights", "xrefs", "boundaries"]) {
      expect(plan.content).not.toContain(`[${list}]`);
    }
    expect(plan.content).toContain("[helipads]");
    expect(plan.content).toContain("<[list_tm_airport_pd_custom_model][custom_models][]\n        >");
    expect(plan.warnings.join(" ")).toContain("no boundary");
  });

  it("closes the boundary ring and warns when it crosses itself", () => {
    const ring = valuesOf(planTap(TAP_PROJECT, TAP_LIGHTS).content, "points")[0]!;
    const pairs = ring.trim().split(") (");
    expect(pairs.length).toBe(5);
    expect(pairs[0]!.replace("(", "")).toBe(pairs[4]!.replace(")", ""));
    // Swap two points: the ring now crosses itself (a bow tie).
    const [a, b, c, d] = TAP_PROJECT.airport!.boundary!;
    const bowTie: Project = { ...TAP_PROJECT, airport: { ...TAP_PROJECT.airport!, boundary: [a!, c!, b!, d!] } };
    expect(planTap(bowTie, TAP_LIGHTS).warnings.join(" ")).toContain("crosses itself");
    // Two points are no ring: left out, with a warning.
    const two: Project = { ...TAP_PROJECT, airport: { ...TAP_PROJECT.airport!, boundary: [a!, b!] } };
    const plan = planTap(two, TAP_LIGHTS);
    expect(plan.content).not.toContain("[boundaries]");
    expect(plan.warnings.join(" ")).toContain("fewer than three points");
  });

  it("writes a runway's own material and brightness, and an empty brightness for a material that takes none", () => {
    const a = TAP_PROJECT.airport!;
    const blue: Project = {
      ...TAP_PROJECT,
      airport: { ...a, runways: [{ ...a.runways![0]!, material: "asphalt_runway__typeblue", brightness: 0.8 }] },
    };
    const content = planTap(blue, TAP_LIGHTS).content;
    expect(content).toContain("<[string8][material][asphalt_runway__typeblue]>");
    expect(content).toContain("<[string8][brightness][0.8]>");
    const grass: Project = { ...TAP_PROJECT, airport: { ...a, runways: [{ ...a.runways![0]!, material: "grass01" }] } };
    expect(planTap(grass, TAP_LIGHTS).content).toContain(
      "<[string8][material][grass01]>\n                <[string8][brightness][]>",
    );
  });

  it("writes each tarmac closed and each line open, and warns about what the converter cannot use", () => {
    const a = TAP_PROJECT.airport!;
    const t = a.tarmacs![0]!;
    const full = planTap(TAP_PROJECT, TAP_LIGHTS).content;
    expect(full.indexOf("[parking_positions]")).toBeLessThan(full.indexOf("[tarmacs]"));
    expect(full.indexOf("[tarmacs]")).toBeLessThan(full.indexOf("[lines]"));
    expect(full.indexOf("[lines]")).toBeLessThan(full.indexOf("[plants]"));
    // Flatten takes no brightness and is written on level 0 whatever the project says; any other
    // material is written on level 1 or higher.
    const flatten: Project = {
      ...TAP_PROJECT,
      airport: {
        ...a,
        tarmacs: [
          { ...t, material: "flatten", level: 2 },
          { ...t, id: "t2", material: "grass00", level: 0 },
          { ...t, id: "t3", points: t.points.slice(0, 2) },
          { ...t, id: "t4", points: [t.points[0]!, t.points[2]!, t.points[1]!, t.points[3]!] },
        ],
        lines: [{ ...a.lines![0]!, points: [a.lines![0]!.points[0]!] }],
      },
    };
    const plan = planTap(flatten, TAP_LIGHTS);
    const elements = nodesByName(parseTm(plan.content), "tarmacs")[0]!.children;
    expect(elements.length).toBe(3);
    expect(valuesOf(plan.content, "brightness").slice(1, 3)).toEqual(["", ""]);
    expect(plan.content).not.toContain("[lines]");
    const w = plan.warnings.join(" | ");
    expect(valuesOf(plan.content, "level").slice(0, 2)).toEqual(["0", "1"]);
    expect(w).not.toContain("level");
    expect(w).toContain("Tarmac 3 has fewer than three points");
    expect(w).toContain("Tarmac 4 crosses itself");
    expect(w).toContain("Line 1 has fewer than two points");
  });

  it("writes the glider starts to <ICAO>_addendum.tap, and none when there are none", () => {
    expect(planTap(TAP_PROJECT, TAP_LIGHTS).addendum).toEqual({ fileName: "PCTT01_addendum.tap", content: null });
    expect(tapAddendumFileName("scsn")).toBe("SCSN_addendum.tap");
    const p: Project = {
      ...TAP_PROJECT,
      airport: {
        ...TAP_PROJECT.airport!,
        winches: [
          { id: "w1", name: "23", position: { lon: -71.6112, lat: -33.6541 }, winch: { lon: -71.6226, lat: -33.6606 }, spacing: 25 },
        ],
        aerotows: [{ id: "a1", name: "23", position: { lon: -71.6123, lat: -33.65474 }, heading: 236 }],
      },
    };
    const plan = planTap(p, TAP_LIGHTS);
    expect(plan.addendum.content).toBe(GOLDEN_ADDENDUM);
    // Not in the .tap itself, and no warning about them any more.
    expect(plan.content).not.toContain("glider");
    expect(plan.warnings.join(" ")).not.toContain("glider");
    // Only one of the two kinds: the other list is left out.
    expect(buildTapAddendum([], [{ name: "23", position: { lon: 0, lat: 0 }, headingDeg: 236 }])).not.toContain("winch");
  });

  it("moves every point with the export shift", () => {
    const shifted = planTap({ ...TAP_PROJECT, shift: { east: 0, north: 1000 } }, TAP_LIGHTS).content;
    const lat = (v: string): number => Number(v.split(" ")[1]);
    const before = planTap(TAP_PROJECT, TAP_LIGHTS).content;
    for (const name of ["model_center", "threshold", "position"]) {
      const a = valuesOf(before, name);
      const b = valuesOf(shifted, name);
      expect(b.length).toBe(a.length);
      b.forEach((v, i) => expect(lat(v) - lat(a[i]!)).toBeCloseTo(0.009, 3));
    }
  });

  it("warns about what a .tap cannot carry", () => {
    const xref = TAP_PROJECT.objects.find((o) => o.kind === "xref")!;
    const p: Project = {
      ...TAP_PROJECT,
      objects: [
        ...TAP_PROJECT.objects,
        { ...xref, id: "x2", scale: 2 },
        { ...xref, id: "x3", height: { mode: "terrain-offset", offset: 12 } },
      ] as Project["objects"],
    };
    const w = planTap(p, TAP_LIGHTS).warnings.join(" ");
    expect(w).toContain("1 XREF has a scale other than 1");
    expect(w).toContain("1 XREF or plant is set above the terrain");
  });

  it("warns when the airport has neither a runway nor a helipad", () => {
    const p: Project = { ...TAP_PROJECT, airport: { ...TAP_PROJECT.airport!, runways: [], pads: [] } };
    expect(planTap(p, []).warnings.join(" ")).toContain("no helipad and no runway");
  });

  it("refuses a project with no airport point, and a bad code", () => {
    const { airport: _a, ...noAirport } = TAP_PROJECT;
    expect(() => planTap(noAirport as Project, [])).toThrow(NoAirportError);
    const { position: _p, ...unplaced } = TAP_PROJECT.airport!;
    expect(() => planTap({ ...TAP_PROJECT, airport: unplaced }, [])).toThrow(NoAirportError);
    expect(() => planTap({ ...TAP_PROJECT, airport: { ...TAP_PROJECT.airport!, icao: "a/b" } }, [])).toThrow(
      InvalidHeliportIdentityError,
    );
  });
});

describe("Export TAP — writing the file", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it("needs a folder, writes one file, and replaces it only when told to", () => {
    dir = mkdtempSync(path.join(tmpdir(), "pct-tap-"));
    const plan = planTap(TAP_PROJECT, TAP_LIGHTS);
    expect(() => writeTap(null, plan, { overwrite: false })).toThrow(NoTapDirError);

    const written = writeTap(dir, plan, { overwrite: false });
    expect(written.addendum).toBeNull();
    const file = written.file;
    expect(file).toBe(path.join(dir, "PCTT01.tap"));
    expect(readFileSync(file, "utf8")).toBe(GOLDEN_TAP);

    writeFileSync(file, "edited by hand");
    expect(() => writeTap(dir!, plan, { overwrite: false })).toThrow(TapFileExistsError);
    expect(readFileSync(file, "utf8")).toBe("edited by hand");
    writeTap(dir, plan, { overwrite: true });
    expect(readFileSync(file, "utf8")).toBe(GOLDEN_TAP);
  });
});

describe("Export TAP — the addendum on disk", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  const withGliders: Project = {
    ...TAP_PROJECT,
    airport: {
      ...TAP_PROJECT.airport!,
      aerotows: [{ id: "a1", name: "23", position: { lon: -71.6123, lat: -33.65474 }, heading: 236 }],
    },
  };

  it("writes the addendum beside the .tap, and removes a stale one only on a confirmed replace", () => {
    dir = mkdtempSync(path.join(tmpdir(), "pct-tap-"));
    const both = writeTap(dir, planTap(withGliders, TAP_LIGHTS), { overwrite: false });
    expect(both.addendum).toBe(path.join(dir, "PCTT01_addendum.tap"));
    expect(readFileSync(both.addendum!, "utf8")).toContain("glider_aerotows");

    // The same airport without glider starts: the old addendum would still be merged by the converter.
    const plain = planTap(TAP_PROJECT, TAP_LIGHTS);
    let err: unknown;
    try {
      writeTap(dir, plain, { overwrite: false });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TapFileExistsError);
    expect((err as Error).message).toContain('"PCTT01.tap" and "PCTT01_addendum.tap" already exist');
    expect((err as Error).message).toContain("removes");
    expect(existsSync(both.addendum!)).toBe(true);

    writeTap(dir, plain, { overwrite: true });
    expect(existsSync(both.addendum!)).toBe(false);
    expect(existsSync(both.file)).toBe(true);
  });
});
