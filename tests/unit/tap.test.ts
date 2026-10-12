import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Project, ResolvedAirportLight, ResolvedLight } from "../../src/core/project/types";
import { InvalidHeliportIdentityError, NoAirportError, planTap } from "../../src/core/export/planExport";
import { tapFileName } from "../../src/core/export/tapWriter";
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
        <[float64][elevation][0]>
        <[vector2_float64][model_center][-71.6153000 -33.6564000]>
        <[bool][auto_height][false]>
        <[vector2_float64][offset][0 0]>
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
                        <[float64][elevation][0]>
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
                        <[float64][elevation][0]>
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
                <[float64][orientation][30]>
                <[uint32][group_index][0]>
            >
        >
        <[list_tm_airport_pd_xref][xrefs][]
            <[tm_airport_pd_xref][element][0]
                <[string8][name][airport_windsock_large1]>
                <[vector2_float64][position][-71.6183000 -33.6575000]>
                <[float64][direction][37]>
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

  it("gives each runway end the compass direction from its threshold toward the other one", () => {
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
    expect(valuesOf(planTap(ns, []).content, "direction").slice(0, 2)).toEqual(["0", "180"]);
  });

  it("mirrors the height mode in auto_height", () => {
    const auto = planTap({ ...TAP_PROJECT, heightMode: "autoheight" }, TAP_LIGHTS).content;
    expect(valuesOf(auto, "auto_height")).toEqual(["true"]);
    expect(valuesOf(planTap(TAP_PROJECT, TAP_LIGHTS).content, "auto_height")).toEqual(["false"]);
  });

  it("omits empty lists and never writes a boundary", () => {
    const bare: Project = {
      ...TAP_PROJECT,
      objects: [],
      airport: { ...TAP_PROJECT.airport!, runways: [], parkings: [] },
    };
    const text = planTap(bare, []).content;
    for (const list of ["runway_pairs", "parking_positions", "plants", "lights", "airport_lights", "xrefs", "boundaries"]) {
      expect(text).not.toContain(`[${list}]`);
    }
    expect(text).toContain("[helipads]");
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
      airport: {
        ...TAP_PROJECT.airport!,
        aerotows: [{ id: "a1", name: "05", position: { lon: -71.62, lat: -33.66 }, heading: 56 }],
      },
    };
    const w = planTap(p, TAP_LIGHTS).warnings.join(" ");
    expect(w).toContain("1 glider start is not in the TAP");
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

    const file = writeTap(dir, plan, { overwrite: false });
    expect(file).toBe(path.join(dir, "PCTT01.tap"));
    expect(readFileSync(file, "utf8")).toBe(GOLDEN_TAP);

    writeFileSync(file, "edited by hand");
    expect(() => writeTap(dir!, plan, { overwrite: false })).toThrow(TapFileExistsError);
    expect(readFileSync(file, "utf8")).toBe("edited by hand");
    writeTap(dir, plan, { overwrite: true });
    expect(readFileSync(file, "utf8")).toBe(GOLDEN_TAP);
  });
});
