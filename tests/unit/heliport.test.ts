import { describe, it, expect } from "vitest";
import type { Project, ResolvedXref, ResolvedPlant } from "../../src/core/project/types";
import { planExport } from "../../src/core/export/planExport";
import {
  buildHeliportTsc,
  buildHeliportWad,
  HELIPORT_TSC_FILE,
  HELIPORT_WAD_FILE,
  type HeliportSpec,
} from "../../src/core/export/heliportTemplate";
import { parseTm, type TmNode } from "../../src/core/tm/tmParser";

// ── The CONTROL: the heliport that actually flew ─────────────────────────────────────────────────
// On 2026-07-31 a hand-written pct001.tsc/.wad pair was installed at KDAG and flown. These are the exact
// numbers in those files. If a change to the projection, the heading convention or the emitter moves any
// of them, it moves away from something a simulator has already accepted — so this test is the only real
// authority here, and the goldens below are downstream of it.
const FLOWN = {
  lon: -116.7947,
  lat: 34.8536,
  headingDeg: 40, // TRUE. The sim showed 028 for this, i.e. minus the local magnetic variation.
  radiusM: 10,
  wadLon: 11506.1737244444,
  wadLat: 39582.0861812934,
  wadDirection: 0.87266462599716, // radians = (90 - 40) deg
};

const SPEC: HeliportSpec = {
  position: { lon: FLOWN.lon, lat: FLOWN.lat },
  headingDeg: FLOWN.headingDeg,
  radiusM: FLOWN.radiusM,
  cultivationFileName: "poi",
  anchor: null,
  autoheight: false,
};

/** Every node with this `name`, at any depth. (tmParser's own findAll matches on TYPE, and `child` only
 *  looks one level down; the tags of interest here are nested three deep and identified by name.) */
function nodesByName(root: TmNode, name: string): TmNode[] {
  const out: TmNode[] = [];
  const walk = (n: TmNode): void => {
    if (n.name === name) out.push(n);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Values out of an emitted file, by tag name. Parsed, not string-matched: the templates carry trailing
 *  `//` comments, so "the file contains 40" would pass on a comment mentioning 40. */
function valuesOf(text: string, name: string): string[] {
  return nodesByName(parseTm(text), name).map((n) => n.value);
}

describe("heliport template — the flown control", () => {
  it("reproduces the .wad numbers of the heliport that flew at KDAG", () => {
    const wad = buildHeliportWad(SPEC);
    const [lon, lat] = valuesOf(wad, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(FLOWN.wadLon, 9);
    expect(lat).toBeCloseTo(FLOWN.wadLat, 9);
    expect(Number(valuesOf(wad, "direction")[0])).toBeCloseTo(FLOWN.wadDirection, 9);
    expect(Number(valuesOf(wad, "radius")[0])).toBe(FLOWN.radiusM);
  });

  it("writes the pad heading into the .tsc as TRUE degrees, unconverted", () => {
    // The .tsc takes the compass heading and the .wad the same rotation in radians. Getting these two
    // out of step is the failure that would put the helicopter on the pad facing the wrong way.
    expect(Number(valuesOf(buildHeliportTsc(SPEC), "heading")[0])).toBe(FLOWN.headingDeg);
  });

  it("keeps degrees in the .tsc and grid units in the .wad", () => {
    const [tscLon] = valuesOf(buildHeliportTsc(SPEC), "position")[0].split(" ").map(Number);
    expect(tscLon).toBeCloseTo(FLOWN.lon, 7);
    expect(tscLon).not.toBeCloseTo(FLOWN.wadLon, 0);
  });
});

describe("heliport template — structure", () => {
  it("names no airport: every identity field is a placeholder", () => {
    for (const text of [buildHeliportTsc(SPEC), buildHeliportWad(SPEC)]) {
      expect(valuesOf(text, "icao")).toEqual(["__ICAO__"]);
      expect(valuesOf(text, "country")).toEqual(["__COUNTRY__"]);
      expect(text).toContain("__AIRPORT_NAME__");
    }
  });

  it("is pure ASCII — the sim mangles non-ASCII in its own text files (tm.log: 'Stra?e')", () => {
    for (const text of [buildHeliportTsc(SPEC), buildHeliportWad(SPEC)]) {
      // eslint-disable-next-line no-control-regex
      expect(text).not.toMatch(/[^\x00-\x7F]/);
    }
  });

  it("points the place at the POI's own cultivation, and drops it for an empty POI", () => {
    expect(valuesOf(buildHeliportTsc(SPEC), "filename")).toEqual(["poi"]);
    const empty = buildHeliportTsc({ ...SPEC, cultivationFileName: null });
    expect(nodesByName(parseTm(empty), "cultivation_files")).toEqual([]);
  });

  it("repeats the plant anchor, because the .tsc replaces the .tsl that carried it", () => {
    const withAnchor = buildHeliportTsc({
      ...SPEC,
      anchor: { position: { lon: 11.85, lat: 48.376 }, heightAsl: 520 },
    });
    expect(valuesOf(withAnchor, "geometry")).toEqual(["pct_anchor"]);
    expect(valuesOf(buildHeliportTsc(SPEC), "geometry")).toEqual([]);
  });

  it("mirrors the project's height mode onto the cultivation reference", () => {
    expect(valuesOf(buildHeliportTsc(SPEC), "auto_height")).toEqual(["false"]);
    expect(valuesOf(buildHeliportTsc({ ...SPEC, autoheight: true }), "auto_height")).toEqual(["true"]);
  });
});

// ── planExport wiring ────────────────────────────────────────────────────────────────────────────

const HANGAR: ResolvedXref = {
  id: "hangar",
  kind: "xref",
  name: "hangar_small_plates_ds_02_15_42",
  position: { lon: -116.795, lat: 34.8536 },
  heightAsl: 585,
  direction: 50, // → heading 40 (heading = 90 - direction)
  scale: 1,
};
const PALM: ResolvedPlant = {
  id: "palm",
  kind: "plant",
  group: "palm",
  species: "11",
  position: { lon: -116.7953, lat: 34.85395 },
  heightAsl: 584,
  heightRange: [14, 14],
};

const PROJECT: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "KDAG heliport test",
  poiName: "kdag_heliport_test",
  createdAt: "2026-07-31T00:00:00.000Z",
  modifiedAt: "2026-07-31T00:00:00.000Z",
  reference: null,
  camera: { lon: -116.795, lat: 34.8536, zoom: 18 },
  objects: [],
};

const relPaths = (p: { files: { relPath: string }[] }): string[] => p.files.map((f) => f.relPath);

describe("planExport — heliport option", () => {
  it("changes nothing when the option is absent", () => {
    const plan = planExport(PROJECT, [HANGAR]);
    expect(relPaths(plan)).toEqual(["poi.tsl", "poi.toc", "README.txt"]);
    expect(plan.files.find((f) => f.relPath === "README.txt")!.content).not.toContain("Heliport");
  });

  it("adds exactly the two templates, and says so in the README", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { objectId: null, radiusM: 10 } });
    expect(relPaths(plan)).toEqual(["poi.tsl", "poi.toc", "README.txt", HELIPORT_TSC_FILE, HELIPORT_WAD_FILE]);
    expect(plan.files.find((f) => f.relPath === "README.txt")!.content).toContain(HELIPORT_TSC_FILE);
  });

  it("takes the pad's position AND heading from the chosen object", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { objectId: "hangar", radiusM: 12 } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    const [lon, lat] = valuesOf(tsc, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(HANGAR.position.lon, 7);
    expect(lat).toBeCloseTo(HANGAR.position.lat, 7);
    expect(Number(valuesOf(tsc, "heading")[0])).toBe(40); // direction 50 → heading 40
    expect(Number(valuesOf(tsc, "radius")[0])).toBe(12);
  });

  it("moves the pad WITH the scene when the project has an export shift", () => {
    // The pad reads the SHIFTED object. Reading the unshifted one would leave the helicopter parked
    // `shift` metres away from the objects it is supposed to be standing among.
    const shifted = { ...PROJECT, shift: { east: 50, north: 0 } };
    const plan = planExport(shifted, [HANGAR], { heliport: { objectId: "hangar", radiusM: 10 } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    const [lon] = valuesOf(tsc, "position")[0].split(" ").map(Number);
    expect(lon).toBeGreaterThan(HANGAR.position.lon); // 50 m east
    const toc = plan.files.find((f) => f.relPath === "poi.toc")!.content;
    const [objLon] = valuesOf(toc, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(objLon, 7); // …and by exactly as much as the object it sits on
  });

  it("falls back to the anchor with a warning when the chosen object is gone", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { objectId: "deleted", radiusM: 10 } });
    expect(plan.warnings.some((w) => w.includes("no longer in the scene"))).toBe(true);
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    expect(Number(valuesOf(tsc, "heading")[0])).toBe(0); // anchor has no facing
  });

  it("warns that autoheight was never gated, but still writes the files", () => {
    const auto = { ...PROJECT, heightMode: "autoheight" as const };
    const plan = planExport(auto, [PALM], { heliport: { objectId: null, radiusM: 10 } });
    expect(plan.warnings.some((w) => w.includes("baked-asl"))).toBe(true);
    expect(relPaths(plan)).toContain(HELIPORT_TSC_FILE);
  });
});
