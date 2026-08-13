import { describe, it, expect } from "vitest";
import {
  clampLonLat,
  CONFIGURATION_RE,
  firstProjectError,
  isExportablePoiName,
  LEGACY_PAD_ID,
  migrateProject,
  parseProject,
  parseSettings,
  safeParseProject,
  UnsupportedSchemaVersionError,
  zPlacedAirportLight,
  zPlacedLight,
} from "../../src/core/project/schemas";
import { createProject, createXref } from "../../src/core/project/mutate";
import type { Project, Settings } from "../../src/core/project/types";

const CAMERA = { lon: 11.86, lat: 48.37, zoom: 15 };

function validProject(): Project {
  return {
    ...createProject({
      name: "Munich",
      poiName: "munich_test",
      camera: CAMERA,
      now: "2026-07-07T00:00:00.000Z",
    }),
    objects: [
      createXref(
        "tower00_small_plates_ds_00_08_08",
        { lon: 11.86, lat: 48.37 },
        { id: "a", direction: 90, scale: 2, height: { mode: "asl", value: 438 } },
      ),
    ],
  };
}

const validSettings = (): Settings => ({
  schemaVersion: 1,
  installDir: null,
  afs4UserDir: null,
  thumbnailsDir: null,
  tiles: { provider: "esri" },
  elevation: { provider: "open-meteo" },
  recentProjects: [],
  lastScanAt: null,
});

// Build an otherwise-valid project whose first object carries a patch, for the rejection table.
function withFirstObject(patch: Record<string, unknown>): unknown {
  const p = validProject() as unknown as { objects: Record<string, unknown>[] };
  p.objects[0] = { ...p.objects[0], ...patch };
  return p;
}
function withoutFirstObjectKey(key: string): unknown {
  const p = validProject() as unknown as { objects: Record<string, unknown>[] };
  delete p.objects[0][key];
  return p;
}

describe("parseProject — accepts valid input and round-trips", () => {
  it("returns an equal project through a JSON round-trip", () => {
    const p = validProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("preserves unknown fields (forward-compat via looseObject)", () => {
    const raw = { ...validProject(), futureField: { hello: 1 } } as unknown;
    const parsed = parseProject(raw) as unknown as Record<string, unknown>;
    expect(parsed.futureField).toEqual({ hello: 1 });
  });
  it("accepts a catalog-style object name with . and - (the headroom charset, Fable A)", () => {
    expect(() => parseProject(withFirstObject({ name: "obj-name.v2_00" }))).not.toThrow();
  });
  it("accepts and round-trips an autoheight heightMode (v0.5)", () => {
    const p = { ...validProject(), heightMode: "autoheight" as const };
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("treats a project with no heightMode as valid (absent ≡ baked-asl; every pre-v0.5 file)", () => {
    expect("heightMode" in validProject()).toBe(false);
    expect(() => parseProject(validProject())).not.toThrow();
  });
  it("rejects an unknown heightMode value", () => {
    // A forum-shared file must not smuggle a mode the exporter can't compile.
    expect(() => parseProject({ ...validProject(), heightMode: "agl" })).toThrow();
  });
});

describe("parseProject — rejects malformed input (untrusted forum files)", () => {
  const cases: Array<[string, unknown]> = [
    ["lat out of range", { ...validProject(), objects: [], reference: { lon: 0, lat: 200 } }],
    ["scale <= 0", withFirstObject({ scale: 0 })],
    ["unknown height mode", withFirstObject({ height: { mode: "floating" } })],
    ["kind not xref", withFirstObject({ kind: "plant" })],
    ["missing name", withoutFirstObjectKey("name")],
    ["object name with a grammar-breaking ]", withFirstObject({ name: "lamp]evil" })],
    ["object name with a space (not a catalog id)", withFirstObject({ name: "two words" })],
    ["wrong app tag", { ...validProject(), app: "other" }],
    ["not an object", 42],
  ];
  for (const [label, input] of cases) {
    it(`throws on ${label}`, () => {
      expect(() => parseProject(input)).toThrow();
    });
  }
});

describe("schemaVersion migration", () => {
  it("v1 passes through", () => {
    expect(() => parseProject(validProject())).not.toThrow();
  });
  it("an unreadable version is refused explicitly", () => {
    const raw = { ...validProject(), schemaVersion: 2 };
    expect(() => parseProject(raw)).toThrow(UnsupportedSchemaVersionError);
    expect(() => migrateProject(raw)).toThrow(UnsupportedSchemaVersionError);
  });
  it("safeParseProject reports failure instead of throwing (version or shape)", () => {
    expect(safeParseProject({ schemaVersion: 2 }).success).toBe(false);
    expect(safeParseProject({ nonsense: true }).success).toBe(false);
    expect(safeParseProject(validProject()).success).toBe(true);
  });
});

describe("parseSettings", () => {
  it("accepts valid settings", () => {
    expect(parseSettings(validSettings())).toEqual(validSettings());
  });
  it("rejects an unknown tile provider", () => {
    expect(() => parseSettings({ ...validSettings(), tiles: { provider: "bing" } })).toThrow();
  });

  // A settings.json written before v0.6 has no `thumbnailsDir`. The zod `.default(null)` MUST fill it in
  // rather than reject: readSettings falls back to defaults on any throw, so a rejection would silently
  // wipe the user's install dir + tile provider — the same trap the window field's `.catch` guards.
  it("defaults a missing thumbnailsDir to null WITHOUT losing the rest (pre-v0.6 file)", () => {
    const preV06 = {
      schemaVersion: 1,
      installDir: "/afs4",
      afs4UserDir: "/user",
      tiles: { provider: "custom", customUrl: "https://t/{z}/{x}/{y}.png" },
      elevation: { provider: "open-meteo" },
      recentProjects: ["/a.json"],
      lastScanAt: "2026-01-01T00:00:00Z",
    };
    const got = parseSettings(preV06);
    expect(got.thumbnailsDir).toBeNull();
    expect(got.installDir).toBe("/afs4"); // the real settings survived the upgrade
    expect(got.tiles).toEqual({ provider: "custom", customUrl: "https://t/{z}/{x}/{y}.png" });
  });

  // The saved window placement (forum #125) is cosmetic, and readSettings falls back to DEFAULTS on any
  // throw — so a schema that rejected a bad rect would quietly reset the user's install dir and tile
  // provider along with it. It degrades to "no saved placement" instead, and nothing else moves.
  const win = { x: 100, y: 80, width: 1280, height: 820, maximized: false };

  it("round-trips a window placement", () => {
    expect(parseSettings({ ...validSettings(), window: win })).toMatchObject({ window: win });
  });
  it("treats settings without a window as valid (every file written before v0.3.4)", () => {
    expect(parseSettings(validSettings())).not.toHaveProperty("window");
  });
  it("drops a corrupt window rect WITHOUT losing the rest of the settings", () => {
    for (const bad of [
      { ...win, width: Number.NaN },
      { ...win, height: 0 },
      { ...win, x: "left" },
      { maximized: true },
      "somewhere",
      null,
    ]) {
      const got = parseSettings({ ...validSettings(), window: bad });
      expect(got.window).toBeUndefined();
      expect(got.installDir).toBe(validSettings().installDir); // the real settings survived
      expect(got.tiles).toEqual(validSettings().tiles);
    }
  });
});

describe("clampLonLat — keep a coordinate in the range the loader enforces (Fable C1)", () => {
  it("clamps out-of-range values to the WGS84 edges", () => {
    expect(clampLonLat({ lon: 481.3, lat: 200 })).toEqual({ lon: 180, lat: 90 });
    expect(clampLonLat({ lon: -181, lat: -91 })).toEqual({ lon: -180, lat: -90 });
  });
  it("leaves an in-range coordinate untouched", () => {
    expect(clampLonLat({ lon: 11.85, lat: 48.376 })).toEqual({ lon: 11.85, lat: 48.376 });
  });
});

describe("firstProjectError — the save-time safety net (Fable C1)", () => {
  it("returns null for a valid project", () => {
    expect(firstProjectError(validProject())).toBeNull();
  });
  it("names the offending field for an out-of-range latitude", () => {
    const bad = { ...validProject(), reference: { lon: 0, lat: 200 } };
    expect(firstProjectError(bad)).toContain("lat");
  });
  it("catches a non-finite coordinate (Infinity from a bad numeric entry)", () => {
    expect(firstProjectError(withFirstObject({ position: { lon: Infinity, lat: 0 } }))).not.toBeNull();
  });
  it("reports an unreadable schemaVersion in words", () => {
    expect(firstProjectError({ schemaVersion: 2 })).toContain("schemaVersion");
  });
  it("rejects an object name that would break the .toc grammar (Fable A)", () => {
    expect(firstProjectError(withFirstObject({ name: "lamp]evil" }))).not.toBeNull();
  });
});

describe("isExportablePoiName", () => {
  it("accepts a lowercase underscore slug", () => {
    expect(isExportablePoiName("munich_test")).toBe(true);
  });
  it("rejects empty, spaces, capitals, dashes, accents", () => {
    for (const s of ["", "Munich", "a b", "a-b", "café"]) {
      expect(isExportablePoiName(s)).toBe(false);
    }
  });
});

// ── v0.2 lights (schemas defined + tested here; wired into zProject with the lights UI slice) ──

describe("zPlacedAirportLight", () => {
  const valid = {
    id: "a",
    kind: "airport_light",
    typeName: "runway_edge_light",
    position: { lon: -116.78, lat: 34.85 },
    height: { mode: "terrain" },
    orientation: 90,
    configuration: "wr",
    groupIndex: 0,
  };
  it("accepts a valid airport light", () => {
    expect(zPlacedAirportLight.safeParse(valid).success).toBe(true);
  });
  it("accepts an empty configuration (the fixture's own default colour)", () => {
    expect(zPlacedAirportLight.safeParse({ ...valid, configuration: "" }).success).toBe(true);
  });
  it("rejects a 3-letter or non-bgrwy configuration", () => {
    expect(zPlacedAirportLight.safeParse({ ...valid, configuration: "wrg" }).success).toBe(false);
    expect(zPlacedAirportLight.safeParse({ ...valid, configuration: "xz" }).success).toBe(false);
  });
  it("rejects a grammar-breaking ] in typeName and a negative group_index", () => {
    expect(zPlacedAirportLight.safeParse({ ...valid, typeName: "evil]x" }).success).toBe(false);
    expect(zPlacedAirportLight.safeParse({ ...valid, groupIndex: -1 }).success).toBe(false);
  });
});

describe("zPlacedLight", () => {
  const valid = {
    id: "b",
    kind: "light",
    position: { lon: -116.78, lat: 34.85 },
    height: { mode: "asl", value: 584 },
    color: [1, 0, 1],
    intensity: 10000,
    flashing: [1, 0, 3, 0],
    groupIndex: 0,
  };
  it("accepts a valid point light", () => {
    expect(zPlacedLight.safeParse(valid).success).toBe(true);
  });
  it("rejects a colour channel outside 0..1", () => {
    expect(zPlacedLight.safeParse({ ...valid, color: [2, 0, 0] }).success).toBe(false);
  });
  it("rejects a negative intensity and a mis-sized flashing tuple", () => {
    expect(zPlacedLight.safeParse({ ...valid, intensity: -1 }).success).toBe(false);
    expect(zPlacedLight.safeParse({ ...valid, flashing: [1, 0, 3] }).success).toBe(false);
  });
});

describe("CONFIGURATION_RE", () => {
  it("matches 0–2 colour letters and rejects the rest", () => {
    for (const s of ["", "r", "wr", "gy", "ww"]) expect(CONFIGURATION_RE.test(s)).toBe(true);
    for (const s of ["wrg", "x", "R", "w r"]) expect(CONFIGURATION_RE.test(s)).toBe(false);
  });
});

// ── The airport block (v1.2, forum #170) ─────────────────────────────────────────────────────────
// ApfelFlieger's ask: PCT wrote only POI data, so the code, the name and the country had to be typed
// again on every lap of "create → test in FS4 → adjust → test again". His own reasoning for putting it
// in the file: the code needs checking once, the airport can be saved as often as a POI, and it can be
// passed on like one — "the same function as the TAP file of the ACT, and at the same time more flexible".
describe("zProject — the airport block", () => {
  const AIRPORT = {
    icao: "shjl",
    name: "Arica Regional Hospital",
    country: "cl",
    pad: { position: { lon: -70.3130659, lat: -18.4827329 }, heading: 90, radius: 10 },
  };

  // v1.4 (forum #221) made HELICOPTER repeatable, so the single `pad` became a `pads` list. AIRPORT above
  // is the v1.2/v1.3 shape on purpose: it is what is sitting in users' files today.
  it("lifts a v1.3 single pad into the pads list, keeping the mirror", () => {
    const p = parseProject({ ...validProject(), airport: AIRPORT });
    expect(p.airport?.pads).toHaveLength(1);
    expect(p.airport?.pads[0]).toEqual({ id: LEGACY_PAD_ID, name: "", ...AIRPORT.pad });
    // The mirror is what lets PCT <= 1.3 still open the file after we save it back.
    expect(p.airport?.pad).toEqual(p.airport?.pads[0]);
    expect(p.airport?.icao).toBe("shjl");
  });

  // The migrated id must be FIXED, not minted: migration runs on every open, so a random one would make
  // the file differ from itself on the next save.
  it("gives the migrated pad a stable id across repeated opens", () => {
    const once = parseProject({ ...validProject(), airport: AIRPORT });
    const twice = parseProject({ ...validProject(), airport: AIRPORT });
    expect(once.airport?.pads[0]?.id).toBe(twice.airport?.pads[0]?.id);
    // …and re-opening what we just wrote is a no-op, not a second migration.
    const again = parseProject({ ...validProject(), airport: once.airport });
    expect(again.airport).toEqual(once.airport);
  });

  it("round-trips a project already in the v1.4 shape", () => {
    const pads = [
      { id: "pad-1", name: "FATO/TLOF", position: { lon: -70.58, lat: -33.38 }, heading: 70, radius: 5 },
      { id: "pad-2", name: "Helipad_W1", position: { lon: -70.59, lat: -33.39 }, heading: 250, radius: 5 },
    ];
    const airport = { icao: "sclc", name: "Vitacura", country: "cl", iata: "CLC", pads, pad: pads[0] };
    const p = parseProject({ ...validProject(), airport });
    expect(p.airport).toEqual(airport);
  });

  it("accepts an airport with no pads at all", () => {
    // His "(1) DATA" example is exactly that: identity plus a database entry, no helipad.
    const p = parseProject({
      ...validProject(),
      airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [] },
    });
    expect(p.airport?.pads).toEqual([]);
  });

  // ── Parking positions (v1.4, forum #232) ───────────────────────────────────────────────────────
  const STAND = {
    id: "prk-1",
    name: "Parking_W",
    position: { lon: -70.5842423, lat: -33.3806032 },
    heading: 165,
    size: 7.5,
    type: "parked_ga",
  };
  const withStands = (parkings: unknown[]): unknown => ({
    ...validProject(),
    airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [], parkings },
  });

  it("round-trips parking positions", () => {
    const p = parseProject(withStands([STAND]));
    expect(p.airport?.parkings).toEqual([STAND]);
  });

  it("stays ABSENT when the project has none — no empty array written into old files", () => {
    const p = parseProject({
      ...validProject(),
      airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [] },
    });
    expect(p.airport?.parkings).toBeUndefined();
    expect("parkings" in p.airport!).toBe(false);
  });

  // ── Runways (v1.4, forum #217 submenu (4)) ─────────────────────────────────────────────────────
  const RWY_END = {
    endpoint: { lon: -70.58515, lat: -33.38115 },
    threshold: { lon: -70.58515, lat: -33.38115 },
    identifier: "08",
    appltsys: "none",
    papi: "none",
    reil: "none",
    approach: true,
    takeoff: true,
  };
  const RUNWAY = { id: "rwy-1", ends: [RWY_END, { ...RWY_END, identifier: "26" }], width: 40 };
  const withRunways = (runways: unknown[]): unknown => ({
    ...validProject(),
    airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [], runways },
  });

  it("round-trips a runway, and stays absent when there are none", () => {
    expect(parseProject(withRunways([RUNWAY])).airport?.runways).toEqual([RUNWAY]);
    const none = parseProject({
      ...validProject(),
      airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [] },
    });
    expect("runways" in none.airport!).toBe(false);
  });

  it("REFUSES a runway that is not a PAIR — the format has no other shape", () => {
    expect(() => parseProject(withRunways([{ ...RUNWAY, ends: [RWY_END] }]))).toThrow();
    expect(() => parseProject(withRunways([{ ...RUNWAY, ends: [RWY_END, RWY_END, RWY_END] }]))).toThrow();
    expect(() => parseProject(withRunways([{ ...RUNWAY, width: 0 }]))).toThrow();
  });

  it("REFUSES a lighting value the sim does not know", () => {
    // Same reasoning as the parking tag, with a sharper edge: `reil_omni` is what IPACS's OWN .tap files
    // say — but a .tap is the authoring format, and that spelling is in none of the sim's binary. Writing
    // it into a .tsc gives a runway end whose REIL quietly does not exist.
    for (const bad of [
      { ...RWY_END, reil: "reil_omni" },
      { ...RWY_END, appltsys: "ALSF-2" },
      { ...RWY_END, papi: "center" },
    ]) {
      expect(() => parseProject(withRunways([{ ...RUNWAY, ends: [bad, RWY_END] }]))).toThrow();
    }
    // …while every value the binary does carry is accepted, FS2 legacy systems included.
    for (const good of ["std", "alsf-1", "alsf-2", "malsf", "malsr", "calvert", "calvert-2", "odals", "rail", "sals"]) {
      const ends = [{ ...RWY_END, appltsys: good }, RWY_END];
      expect(parseProject(withRunways([{ ...RUNWAY, ends }])).airport?.runways?.[0]?.ends[0]?.appltsys).toBe(good);
    }
  });

  // ── Glider starts (v1.4, forum #237/#238) ──────────────────────────────────────────────────────
  const AEROTOW = { id: "ato-1", name: "26", position: { lon: -70.5783, lat: -33.38 }, heading: 260 };
  const WINCH = {
    id: "wnc-1",
    name: "26",
    position: { lon: -70.57713, lat: -33.3801 },
    winch: { lon: -70.58609, lat: -33.3811 },
    spacing: 25,
  };

  it("round-trips the glider starts, and leaves them absent when there are none", () => {
    const p = parseProject({
      ...validProject(),
      airport: {
        icao: "sclc",
        name: "Vitacura",
        country: "cl",
        pads: [],
        aerotows: [AEROTOW],
        winches: [WINCH],
      },
    });
    expect(p.airport?.aerotows).toEqual([AEROTOW]);
    expect(p.airport?.winches).toEqual([WINCH]);
    const none = parseProject({
      ...validProject(),
      airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [] },
    });
    expect("aerotows" in none.airport!).toBe(false);
    expect("winches" in none.airport!).toBe(false);
  });

  it("REFUSES a winch with no second point or a non-positive spacing", () => {
    const withWinches = (winches: unknown[]): unknown => ({
      ...validProject(),
      airport: { icao: "sclc", name: "Vitacura", country: "cl", pads: [], winches },
    });
    const { winch: _dropped, ...noWinch } = WINCH;
    // The pair IS the element: without the far point there is no direction and no rope length.
    expect(() => parseProject(withWinches([noWinch]))).toThrow();
    expect(() => parseProject(withWinches([{ ...WINCH, spacing: 0 }]))).toThrow();
  });

  it("REJECTS a parking tag the sim would never match", () => {
    // ★ The one place a typo here can still be caught. `parking_ga` is not a strawman: it is the spelling
    // ApfelFlieger himself used in the prose of #232, while all of his files — and all of IPACS's — say
    // `parked_ga`. In the sim the wrong value makes a stand that silently does nothing: no error anywhere.
    expect(() => parseProject(withStands([{ ...STAND, type: "parking_ga" }]))).toThrow();
    expect(() => parseProject(withStands([{ ...STAND, type: "" }]))).toThrow();
    // …and the same refusals the pad radius gets, for the same reason.
    expect(() => parseProject(withStands([{ ...STAND, size: 0 }]))).toThrow();
    expect(() => parseProject(withStands([{ ...STAND, id: "" }]))).toThrow();
  });

  it("stays optional — a POI-only project is unchanged", () => {
    // schemaVersion stays 1 precisely because of this: a project that never opened the heliport dialog
    // has no such key and must keep round-tripping byte-identical.
    const p = parseProject(validProject());
    expect(p.airport).toBeUndefined();
    expect("airport" in p).toBe(false);
  });

  it("still OPENS a project whose identity is half-typed", () => {
    // Permissive on load, constrained at the editor. If a code of "SH" made the file unopenable, the
    // dialog that would let you finish typing it would be unreachable — you would be locked out of your
    // own project by a draft. validateIdentity is what stands between these values and the disk.
    const p = parseProject({ ...validProject(), airport: { ...AIRPORT, icao: "SH", country: "" } });
    expect(p.airport?.icao).toBe("SH");
  });

  it("rejects a pad the map could not draw", () => {
    for (const pad of [
      { position: { lon: 999, lat: 0 }, heading: 0, radius: 10 }, // off the globe
      { position: { lon: 0, lat: 0 }, heading: Number.NaN, radius: 10 },
      { position: { lon: 0, lat: 0 }, heading: 0, radius: 0 }, // a zero-radius pad is not a pad
      { position: { lon: 0, lat: 0 }, heading: 0, radius: -5 },
    ]) {
      expect(safeParseProject({ ...validProject(), airport: { ...AIRPORT, pad } }).success).toBe(false);
    }
  });
});
