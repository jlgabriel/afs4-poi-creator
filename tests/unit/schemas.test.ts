import { describe, it, expect } from "vitest";
import {
  clampLonLat,
  firstProjectError,
  isExportablePoiName,
  migrateProject,
  parseProject,
  parseSettings,
  safeParseProject,
  UnsupportedSchemaVersionError,
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
