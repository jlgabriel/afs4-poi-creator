import { describe, it, expect } from "vitest";
import type {
  AirportPad,
  AirportParking,
  Project,
  ResolvedXref,
  ResolvedPlant,
} from "../../src/core/project/types";
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
  pads: [
    {
      name: "",
      position: { lon: FLOWN.lon, lat: FLOWN.lat },
      headingDeg: FLOWN.headingDeg,
      radiusM: FLOWN.radiusM,
    },
  ],
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

// v1.4, forum #219/#221: HELICOPTER became a repeatable element with a free name, and the airport's own
// point was split off from the pad's. SCLC ships three pads — FATO/TLOF, Helipad_W1, Helipad_W2.
describe("heliport template — several pads (v1.4)", () => {
  const THREE: HeliportSpec = {
    ...SPEC,
    position: { lon: -70.582247, lat: -33.380724 },
    pads: [
      { name: "", position: { lon: -70.5865018835, lat: -33.3813575871 }, headingDeg: -110, radiusM: 5 },
      { name: "Helipad_W1", position: { lon: -70.5866098424, lat: -33.3811688908 }, headingDeg: 70, radiusM: 5 },
      { name: "Helipad_W2", position: { lon: -70.5869062265, lat: -33.3812517605 }, headingDeg: 70, radiusM: 5 },
    ],
  };

  it("writes one helipad element per pad, in order, in BOTH files", () => {
    for (const text of [buildHeliportTsc(THREE), buildHeliportWad(THREE)]) {
      const names = nodesByName(parseTm(text), "name").map((n) => n.value);
      // The airport's own name is a `name` tag too in the .wad, so the pads are the tail of the list.
      expect(names.slice(-3)).toEqual(["FATO/TLOF", "Helipad_W1", "Helipad_W2"]);
      expect(valuesOf(text, "radius")).toEqual(["5", "5", "5"]);
    }
  });

  it("renders an unnamed pad as FATO/TLOF — the literal v1.2/v1.3 hard-coded", () => {
    // The bytes of an existing one-pad project must not move just because pads can now be named.
    expect(nodesByName(parseTm(buildHeliportTsc(SPEC)), "name").map((n) => n.value)).toEqual(["FATO/TLOF"]);
  });

  it("converts each pad's heading independently, negative ones included", () => {
    // ApfelFlieger's own SCLC carries heading -110, which our norm360 turns into 200° = 3.4906585 rad.
    // Verified against his file: -110 → 3.49065850398866 and 70 → 0.349065850398866.
    //
    // Nine decimals, not his fourteen: formatWad prints ten and the tenth rounds. That is not a loss
    // worth chasing — 1e-10 rad across a 10 m pad is 1e-9 m.
    const dirs = valuesOf(buildHeliportWad(THREE), "direction").map(Number);
    expect(dirs[0]).toBeCloseTo(3.49065850398866, 9);
    expect(dirs[1]).toBeCloseTo(0.349065850398866, 9);
    expect(dirs[2]).toBeCloseTo(0.349065850398866, 9);
    // The negative heading is not merely "close" — it must be the OPPOSITE of the other two, which is
    // the thing a sign bug would break while still landing near the right magnitude.
    expect(dirs[0]! - dirs[1]!).toBeCloseTo(Math.PI, 9);
  });

  it("puts the AIRPORT's point in the place and the .wad, not the first pad's", () => {
    // The whole point of the #15 split: his #220/#221 files carry -70.582247 -33.380724 even though the
    // field has three pads elsewhere. Reading a pad here would silently move the airport.
    const [tscLon, tscLat] = valuesOf(buildHeliportTsc(THREE), "position")[0].split(" ").map(Number);
    expect(tscLon).toBeCloseTo(-70.582247, 9);
    expect(tscLat).toBeCloseTo(-33.380724, 9);
    // …and the .wad's own position is that same point, projected — his exact printed values.
    const [wadLon, wadLat] = valuesOf(buildHeliportWad(THREE), "position")[0].split(" ").map(Number);
    expect(wadLon).toBeCloseTo(19918.89405724, 7);
    expect(wadLat).toBeCloseTo(26282.05536889, 7);
  });

  it("writes the IATA code, and leaves the row empty when there is none", () => {
    expect(valuesOf(buildHeliportWad({ ...THREE, iata: "clc" }), "iata")).toEqual(["CLC"]);
    expect(valuesOf(buildHeliportWad(THREE), "iata")).toEqual([""]);
  });

  it("accepts an airport with no pads at all", () => {
    // His "(1) DATA" example: identity plus a database entry, an empty `helipads` list and nothing else.
    const none = { ...THREE, pads: [] };
    for (const text of [buildHeliportTsc(none), buildHeliportWad(none)]) {
      expect(nodesByName(parseTm(text), "helipads")).toHaveLength(1); // the list is still there…
      expect(valuesOf(text, "radius")).toEqual([]); // …and empty
    }
  });
});

// ── Parking positions (v1.4, forum #232) ─────────────────────────────────────────────────────────
//
// THE CONTROL here is ApfelFlieger's own sclc_apt_hpd_prk pair: the three stands he published with the
// submenu, with the values his `.tsc` and `.wad` print side by side. Same role as FLOWN above — if a
// change moves any of these, it moves away from a file the author of the format wrote by hand.
const HIS_PARKINGS = [
  {
    name: "Parking_W",
    lon: -70.5842423116,
    lat: -33.3806032182,
    headingDeg: -195,
    sizeM: 7.5,
    wadLon: 19918.53082185,
    wadLat: 26282.0820377,
    wadDirection: 4.97418836818384,
  },
  {
    name: "FuelStation",
    lon: -70.580823299765,
    lat: -33.379805648495,
    headingDeg: -100,
    sizeM: 7.5,
    wadLon: 19919.15323396,
    wadLat: 26282.25814144,
    wadDirection: 3.31612557878923,
  },
  {
    name: "Parking_E",
    lon: -70.574176907502,
    lat: -33.378642836087,
    headingDeg: -200,
    sizeM: 7.5,
    wadLon: 19920.36317275,
    wadLat: 26282.51488792,
    wadDirection: 5.06145483078356,
  },
] as const;

describe("heliport template — parking positions (v1.4)", () => {
  const STANDS: HeliportSpec = {
    ...SPEC,
    position: { lon: -70.582247, lat: -33.380724 },
    parkings: HIS_PARKINGS.map((p) => ({
      name: p.name,
      position: { lon: p.lon, lat: p.lat },
      headingDeg: p.headingDeg,
      sizeM: p.sizeM,
      type: "parked_ga" as const,
    })),
  };

  it("writes NOTHING when there are no stands — the reason this needed no flight", () => {
    // Every project that predates v1.4 exports the files it always did, byte for byte. His own DATA
    // example carries the empty `parking_positions` list marked DEFAULT; that belongs with the rest of
    // the #217 compliance rows, which move bytes in files that have already flown.
    for (const text of [buildHeliportTsc(SPEC), buildHeliportWad(SPEC)]) {
      expect(nodesByName(parseTm(text), "parking_positions")).toEqual([]);
      expect(text).not.toContain("parking");
    }
  });

  it("reproduces his three stands in the .tsc — degrees, his headings, his names", () => {
    const tsc = buildHeliportTsc(STANDS);
    const list = nodesByName(parseTm(tsc), "parking_positions");
    expect(list).toHaveLength(1);
    expect(list[0]!.children).toHaveLength(3);
    // The airport's own position is a `position` tag too, so the stands are the tail.
    const positions = valuesOf(tsc, "position").slice(-3);
    // The pad has a `heading` too (SPEC's 40), and it is written first — stands are the tail.
    const headings = valuesOf(tsc, "heading").slice(-3);
    HIS_PARKINGS.forEach((p, i) => {
      const [lon, lat] = positions[i]!.split(" ").map(Number);
      // SEVEN decimals, where his file prints ten: fmtLonLat is fixed at 7 for every coordinate PCT
      // writes anywhere (~1 cm here), and widening it for stands alone would move the bytes of every
      // `.toc` and `.tsl` already in the wild. A centimetre on a 7.5 m stand is not the constraint.
      expect(lon).toBeCloseTo(p.lon, 6);
      expect(lat).toBeCloseTo(p.lat, 6);
      // Written VERBATIM, negative and all: the .tsc's heading is degrees and the sim reads it as true.
      expect(Number(headings[i])).toBe(p.headingDeg);
    });
    expect(valuesOf(tsc, "size")).toEqual(["7.5", "7.5", "7.5"]);
    expect(valuesOf(tsc, "name").slice(-3)).toEqual(["Parking_W", "FuelStation", "Parking_E"]);
  });

  it("reproduces his projected positions and radian directions in the .wad", () => {
    const wad = buildHeliportWad(STANDS);
    const positions = valuesOf(wad, "position").slice(-3);
    // The pad carries a `direction` too, and it comes first — the stands are the tail here as well.
    const directions = valuesOf(wad, "direction").slice(-3).map(Number);
    HIS_PARKINGS.forEach((p, i) => {
      const [lon, lat] = positions[i]!.split(" ").map(Number);
      expect(lon).toBeCloseTo(p.wadLon, 7);
      expect(lat).toBeCloseTo(p.wadLat, 7);
      expect(directions[i]).toBeCloseTo(p.wadDirection, 9);
    });
    // -195 and -200 are five degrees apart; a sign or wrap bug lands near the right magnitude and would
    // survive the closeTo above, so pin the RELATION too.
    expect(directions[2]! - directions[0]!).toBeCloseTo((5 * Math.PI) / 180, 9);
  });

  it("writes the type into `tags` as a string8u, spelled `parked_`, never `parking_`", () => {
    // ★ The row is hashed by the sim (types.ts ParkingType): a wrong literal produces a stand that does
    // nothing, with no error anywhere. His prose in #232 says `parking_ga`; all five of his FILES say
    // `parked_ga`. This test is what stops the prose from winning later.
    for (const text of [buildHeliportTsc(STANDS), buildHeliportWad(STANDS)]) {
      const tags = nodesByName(parseTm(text), "tags");
      expect(tags.map((n) => n.value)).toEqual(["parked_ga", "parked_ga", "parked_ga"]);
      expect(tags.map((n) => n.type)).toEqual(["string8u", "string8u", "string8u"]);
    }
    const mixed = buildHeliportTsc({
      ...STANDS,
      parkings: [
        { ...STANDS.parkings![0]!, type: "parked_jet" },
        { ...STANDS.parkings![1]!, type: "pushback" },
      ],
    });
    expect(valuesOf(mixed, "tags")).toEqual(["parked_jet", "pushback"]);
  });

  it("renders an unnamed stand as `Parking`, so LOCATION never shows a blank row", () => {
    const anon = buildHeliportTsc({ ...STANDS, parkings: [{ ...STANDS.parkings![0]!, name: "" }] });
    expect(valuesOf(anon, "name").slice(-1)).toEqual(["Parking"]);
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

/** A pad of its own, deliberately NOT on top of either placed object (forum #168). */
const PAD: AirportPad = {
  id: "pad-1",
  name: "",
  position: { lon: -116.7962, lat: 34.8541 },
  heading: 40,
  radius: 10,
};

const relPaths = (p: { files: { relPath: string }[] }): string[] => p.files.map((f) => f.relPath);

describe("planExport — heliport option", () => {
  it("changes nothing when the option is absent", () => {
    const plan = planExport(PROJECT, [HANGAR]);
    expect(relPaths(plan)).toEqual(["poi.tsl", "poi.toc", "README.txt"]);
    expect(plan.files.find((f) => f.relPath === "README.txt")!.content).not.toContain("Heliport");
  });

  it("adds exactly the two templates, and says so in the README", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { pads: [] } });
    expect(relPaths(plan)).toEqual(["poi.tsl", "poi.toc", "README.txt", HELIPORT_TSC_FILE, HELIPORT_WAD_FILE]);
    expect(plan.files.find((f) => f.relPath === "README.txt")!.content).toContain(HELIPORT_TSC_FILE);
  });

  it("writes the project's own pad — position, TRUE heading and radius", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { pads: [PAD] } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    const [lon, lat] = valuesOf(tsc, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(PAD.position.lon, 7);
    expect(lat).toBeCloseTo(PAD.position.lat, 7);
    expect(Number(valuesOf(tsc, "heading")[0])).toBe(PAD.heading);
    expect(Number(valuesOf(tsc, "radius")[0])).toBe(PAD.radius);
  });

  // ★ forum #168: "the functional starting position for Helicopter should be independent of XREF objects
  // because this will lead to collisions too quickly". v1.1 copied a placed object's coordinates, so the
  // helicopter spawned inside whatever the pad had been aimed at. The pad must be able to sit where no
  // object is — and deleting every object must not move it.
  it("is independent of the placed objects", () => {
    const withPad = planExport(PROJECT, [HANGAR], { heliport: { pads: [PAD] } });
    const empty = planExport(PROJECT, [], { heliport: { pads: [PAD] } });
    const padOf = (p: typeof withPad): string =>
      valuesOf(p.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content, "position")[0];
    expect(padOf(empty)).toBe(padOf(withPad));
    // …and it is nowhere near the one object in the scene.
    const [lon] = padOf(withPad).split(" ").map(Number);
    expect(Math.abs(lon - HANGAR.position.lon)).toBeGreaterThan(0.0001);
  });

  it("moves the pad WITH the scene when the project has an export shift", () => {
    // Reading the pad unshifted would leave the helicopter parked `shift` metres away from the objects
    // it is supposed to be standing among.
    const shifted = { ...PROJECT, shift: { east: 50, north: 0 } };
    const at: AirportPad = { id: "pad-1", name: "", position: HANGAR.position, heading: 40, radius: 10 };
    const plan = planExport(shifted, [HANGAR], { heliport: { pads: [at] } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    const [lon] = valuesOf(tsc, "position")[0].split(" ").map(Number);
    expect(lon).toBeGreaterThan(HANGAR.position.lon); // 50 m east
    const toc = plan.files.find((f) => f.relPath === "poi.toc")!.content;
    const [objLon] = valuesOf(toc, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(objLon, 7); // …and by exactly as much as the object beside it
  });

  it("falls back to the POI anchor, facing true north, when there is no pad", () => {
    const plan = planExport(PROJECT, [HANGAR], { heliport: { pads: [], radiusM: 15 } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    expect(Number(valuesOf(tsc, "heading")[0])).toBe(0);
    expect(Number(valuesOf(tsc, "radius")[0])).toBe(15);
    const [lon] = valuesOf(tsc, "position")[0].split(" ").map(Number);
    expect(lon).toBeCloseTo(HANGAR.position.lon, 7); // the centroid of a one-object scene
  });

  it("moves the STANDS with the scene too, and writes no block without them", () => {
    // Same trap as the pad: a stand read unshifted parks the aircraft `shift` metres from the apron it
    // belongs to. And the no-stands case must stay silent, which is what keeps old exports byte-identical.
    const shifted = { ...PROJECT, shift: { east: 50, north: 0 } };
    const stand: AirportParking = {
      id: "prk-1",
      name: "Parking_W",
      position: HANGAR.position,
      heading: 165,
      size: 7.5,
      type: "parked_ga",
    };
    const plan = planExport(shifted, [HANGAR], { heliport: { pads: [PAD], parkings: [stand] } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    const [standLon] = valuesOf(tsc, "position").slice(-1)[0]!.split(" ").map(Number);
    const toc = plan.files.find((f) => f.relPath === "poi.toc")!.content;
    const [objLon] = valuesOf(toc, "position")[0].split(" ").map(Number);
    expect(standLon).toBeCloseTo(objLon, 7);
    expect(valuesOf(tsc, "tags")).toEqual(["parked_ga"]);

    const none = planExport(PROJECT, [HANGAR], { heliport: { pads: [PAD] } });
    for (const f of [HELIPORT_TSC_FILE, HELIPORT_WAD_FILE]) {
      expect(none.files.find((x) => x.relPath === f)!.content).not.toContain("parking");
    }
  });

  it("warns that autoheight was never gated, but still writes the files", () => {
    const auto = { ...PROJECT, heightMode: "autoheight" as const };
    const plan = planExport(auto, [PALM], { heliport: { pads: [] } });
    expect(plan.warnings.some((w) => w.includes("baked-asl"))).toBe(true);
    expect(relPaths(plan)).toContain(HELIPORT_TSC_FILE);
  });
});

// ── The comment banner ApfelFlieger asked for (forum #167) ───────────────────────────────────────
describe("heliport template — the Informations banner", () => {
  const tsc = buildHeliportTsc(SPEC);
  const wad = buildHeliportWad(SPEC);

  it("puts nothing before the root <[file] tag", () => {
    // The one thing that is not a preference: a .tsc whose first line is not `<[file]` is refused
    // WHOLE, with only `ERROR: (error loading …)` in tm.log (measured 2026-07-31).
    expect(tsc.startsWith("<[file][][]\n")).toBe(true);
    expect(wad.startsWith("<[file][][]\n")).toBe(true);
  });

  it("uses spaces, never a TAB", () => {
    // Jan (IPACS), relayed by ApfelFlieger: "TAB characters could lead to interference".
    expect(tsc).not.toContain("\t");
    expect(wad).not.toContain("\t");
  });

  it("describes every field once, above the values", () => {
    expect(tsc).toContain("//  Informations:");
    for (const field of ["[icao]", "[sname]", "[lname]", "[country]", "[position]", "[radius]", "[heading]"]) {
      expect(tsc).toContain(`//  ${field}:`);
    }
    // The banner is INSIDE the place block, so the root tag still comes first.
    expect(tsc.indexOf("<[tmsimulator_scenery_place]")).toBeLessThan(tsc.indexOf("//  Informations:"));
  });

  it("puts icao first among the values", () => {
    // "I put the line <[string8u][icao][....]> up, because that is more logical for me and actually
    // also my standard." — ApfelFlieger, #167.
    expect(tsc.indexOf("<[string8u][icao]")).toBeLessThan(tsc.indexOf("<[string8][sname]"));
  });

  it("still parses to the same values it always did", () => {
    // The banner must be commentary, not content: comments and blank lines are skipped by the reader,
    // so every tag survives the reshuffle unchanged.
    expect(valuesOf(tsc, "icao")).toEqual(["__ICAO__"]);
    expect(Number(valuesOf(tsc, "heading")[0])).toBe(FLOWN.headingDeg);
    expect(Number(valuesOf(tsc, "radius")[0])).toBe(FLOWN.radiusM);
    expect(valuesOf(tsc, "coordinate_system")).toEqual(["flat"]);
  });
});
