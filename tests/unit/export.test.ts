import { describe, it, expect } from "vitest";
import type { Project, ResolvedXref } from "../../src/core/project/types";
import { buildToc } from "../../src/core/export/tocWriter";
import { buildTsl } from "../../src/core/export/tslWriter";
import { planExport, POI_README_MARKER } from "../../src/core/export/planExport";
import { parseTm, child } from "../../src/core/tm/tmParser";

// Two placed objects, heights already resolved to ASL — the shape the exporter consumes.
const TOWER: ResolvedXref = {
  id: "a",
  kind: "xref",
  name: "tower00_small_plates_ds_00_08_08",
  position: { lon: 11.85, lat: 48.376 },
  heightAsl: 520,
  direction: 90,
  scale: 1,
};
const BARREL: ResolvedXref = {
  id: "b",
  kind: "xref",
  name: "barrelRedNew",
  position: { lon: 11.8501, lat: 48.3761 },
  heightAsl: 519.5,
  direction: 0,
  scale: 0.5,
};

// GOLDEN — byte-exact `poi.toc`. Regenerate deliberately if the in-sim matrix (§6.2) changes
// the cultivation format; never let it drift silently.
const GOLDEN_TOC = `<[file][][]
    <[cultivation][][]
        <[string8][coordinate_system][lonlat]>
        <[list_xref][xref_list][]
            <[xref][element][]
                <[vector3_float64][position][11.8500000 48.3760000 520.00]>
                <[float64][direction][90]>
                <[float32][scale_factor][1]>
                <[string8u][name][tower00_small_plates_ds_00_08_08]>
            >
            <[xref][element][]
                <[vector3_float64][position][11.8501000 48.3761000 519.50]>
                <[float64][direction][0]>
                <[float32][scale_factor][0.5]>
                <[string8u][name][barrelRedNew]>
            >
        >
    >
>
`;

const GOLDEN_TSL = `<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8][name][Munich test]>
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][true]>
        <[string8u][cultivation][poi]>
    >
>
`;

describe("buildToc — cultivation list_xref", () => {
  it("emits a byte-exact poi.toc for placed xrefs", () => {
    expect(buildToc([TOWER, BARREL])).toBe(GOLDEN_TOC);
  });
  it("an empty POI still produces a valid (empty) xref list", () => {
    expect(buildToc([])).toBe(
      "<[file][][]\n" +
        "    <[cultivation][][]\n" +
        "        <[string8][coordinate_system][lonlat]>\n" +
        "        <[list_xref][xref_list][]\n" +
        "        >\n" +
        "    >\n" +
        ">\n",
    );
  });
});

describe("buildTsl — place_simple wrapper", () => {
  it("references the toc via cultivation", () => {
    expect(buildTsl({ name: "Munich test", tocFileName: "poi" })).toBe(GOLDEN_TSL);
  });
  it("omits the cultivation line when there is no toc", () => {
    const tsl = buildTsl({ name: "Empty", tocFileName: null });
    expect(tsl).not.toContain("cultivation");
    expect(tsl).toContain("<[bool][autoheight][true]>");
  });
  it("sanitises brackets in the project name so the .tsl stays parseable (Fable C2)", () => {
    // Pre-fix, `Munich [WIP]` emitted <…[name][Munich [WIP]]…>, which parseTm truncates at the first
    // `]` → the file is corrupt. The sanitised form round-trips, and the tag AFTER name survives.
    const tsl = buildTsl({ name: "Munich [WIP]", tocFileName: "poi" });
    expect(tsl).toContain("<[string8][name][Munich (WIP)]>");
    const place = parseTm(tsl).children[0]; // <file> → <tmsimulator_scenery_place_simple>
    expect(child(place, "name")?.value).toBe("Munich (WIP)");
    expect(child(place, "cultivation")?.value).toBe("poi");
  });
});

describe("planExport", () => {
  const project: Project = {
    schemaVersion: 1,
    app: "pct",
    name: "Munich test",
    poiName: "munich_test",
    createdAt: "2026-07-06T00:00:00Z",
    modifiedAt: "2026-07-06T00:00:00Z",
    reference: { lon: 11.85, lat: 48.376 },
    camera: { lon: 11.85, lat: 48.376, zoom: 17 },
    objects: [],
  };

  it("names the folder from the reference coordinate + slug", () => {
    const plan = planExport(project, [TOWER, BARREL]);
    expect(plan.folderName).toBe("e01185n4838_munich_test");
  });

  it("falls back to the object centroid when no reference is set", () => {
    const plan = planExport({ ...project, reference: null }, [TOWER, BARREL]);
    // centroid lon ≈ 11.85005 → *100 → 1185.005 → 1185; lat ≈ 48.37605 → 4838
    expect(plan.folderName).toBe("e01185n4838_munich_test");
  });

  it("writes poi.tsl, poi.toc and a README carrying the PCT marker", () => {
    const plan = planExport(project, [TOWER, BARREL]);
    expect(plan.files.map((f) => f.relPath)).toEqual(["poi.tsl", "poi.toc", "README.txt"]);
    expect(plan.files[1].content).toBe(GOLDEN_TOC);
    const readme = plan.files.find((f) => f.relPath === "README.txt")!;
    expect(readme.content).toContain(POI_README_MARKER);
    expect(plan.warnings).toEqual([]);
  });

  it("warns (does not throw) on an empty POI", () => {
    const plan = planExport(project, []);
    expect(plan.warnings.length).toBe(1);
    expect(plan.files.find((f) => f.relPath === "poi.tsl")!.content).not.toContain("cultivation");
  });
});
