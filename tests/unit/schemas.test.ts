import { describe, it, expect } from "vitest";
import {
  clampLonLat,
  CONFIGURATION_RE,
  firstProjectError,
  isExportablePoiName,
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
