import { describe, it, expect } from "vitest";
import { buildAirportLights, type AirportLightFile } from "../../src/core/catalog/airportLights";

// The real 15-folder / 23-.tmb install layout (folder, base) — the exact filenames on Juan's disk.
const REAL_FILES: AirportLightFile[] = (
  [
    ["al_center_line_light", "al_center_line_light"],
    ["al_center_line_light", "al_center_line_light_model"], // the excluded mesh helper
    ["al_helipad_beacon", "al_helipad_beacon"],
    ["al_helipad_flood_light", "al_helipad_flood_light"],
    ["al_helipad_insert_perimeter_light", "al_helipad_insert_perimeter_light"],
    ["al_helipad_large_flood_light", "al_helipad_large_flood_light"],
    ["al_helipad_perimeter_light", "al_helipad_perimeter_light"],
    ["al_papi_2_light", "al_papi_2_light"],
    ["al_papi_3_light", "al_papi_3_light"],
    ["al_runway_approach_light", "al_runway_approach_light_center_1"],
    ["al_runway_approach_light", "al_runway_approach_light_center_2"],
    ["al_runway_approach_light", "al_runway_approach_light_center_3"],
    ["al_runway_approach_light", "al_runway_approach_light_center_4"],
    ["al_runway_approach_light", "al_runway_approach_light_center_5"],
    ["al_runway_approach_light", "al_runway_approach_light_low"],
    ["al_runway_approach_light", "al_runway_approach_light_side_2"],
    ["al_runway_approach_light", "al_runway_approach_light_side_3"],
    ["al_runway_edge_light", "al_runway_edge_light"],
    ["al_runway_end_light", "al_runway_end_light"],
    ["al_runway_end_light_ident", "al_runway_end_light_ident"],
    ["al_runway_guard_light", "al_runway_guard_light"],
    ["al_taxiway_00_light", "al_taxiway_00_light"],
    ["al_taxiway_01_light", "al_taxiway_01_light"],
  ] as const
).map(([folder, base]) => ({ folder, base }));

describe("buildAirportLights — enumerate the airport-light library", () => {
  const { lights, warnings } = buildAirportLights(REAL_FILES);
  const names = lights.map((l) => l.typeName);

  it("yields 22 placeable type_names from 23 .tmb (excludes the _model helper)", () => {
    expect(lights).toHaveLength(22);
    expect(names).toContain("center_line_light");
    expect(names).not.toContain("center_line_light_model");
    expect(warnings).toEqual([]);
  });

  it("includes runway_edge_light — in the install though missing from the bible's name list", () => {
    expect(names).toContain("runway_edge_light");
  });

  it("strips the al_ prefix and keeps meaningful trailing numbers in the display name", () => {
    const c1 = lights.find((l) => l.typeName === "runway_approach_light_center_1");
    expect(c1).toBeDefined();
    expect(c1!.displayName).toBe("Runway Approach Light Center 1");
    // center_1 and center_2 must remain distinct fixtures (numbers not stripped)
    expect(lights.find((l) => l.typeName === "runway_approach_light_center_2")).toBeDefined();
  });

  it("assigns a display category per family (approach before runway)", () => {
    const cat = (n: string) => lights.find((l) => l.typeName === n)!.category;
    expect(cat("runway_edge_light")).toBe("lights/runway");
    expect(cat("center_line_light")).toBe("lights/runway");
    expect(cat("runway_approach_light_center_1")).toBe("lights/approach");
    expect(cat("helipad_beacon")).toBe("lights/helipad");
    expect(cat("papi_2_light")).toBe("lights/papi");
    expect(cat("taxiway_00_light")).toBe("lights/taxiway");
  });

  it("is sorted by typeName for stable catalog.json + goldens", () => {
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("carries provenance folder + install source, no bounding box", () => {
    const edge = lights.find((l) => l.typeName === "runway_edge_light")!;
    expect(edge.folder).toBe("al_runway_edge_light");
    expect(edge.source).toBe("install");
    expect(edge).not.toHaveProperty("bbMin"); // lights are point fixtures, not footprints
  });
});

describe("buildAirportLights — tolerance contract", () => {
  it("includes a non-al_ basename verbatim and warns (never silently lost)", () => {
    const { lights, warnings } = buildAirportLights([{ folder: "weird", base: "mystery_light" }]);
    expect(lights.map((l) => l.typeName)).toContain("mystery_light");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("mystery_light");
  });

  it("de-dupes a repeated type_name", () => {
    const files: AirportLightFile[] = [
      { folder: "al_x", base: "al_x" },
      { folder: "al_x", base: "al_x" },
    ];
    expect(buildAirportLights(files).lights).toHaveLength(1);
  });

  it("returns an empty catalog (no throw) for an install with no airport lights", () => {
    expect(buildAirportLights([])).toEqual({ lights: [], warnings: [] });
  });
});
