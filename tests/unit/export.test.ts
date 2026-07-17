import { describe, it, expect } from "vitest";
import type { Project, ResolvedXref } from "../../src/core/project/types";
import { buildToc } from "../../src/core/export/tocWriter";
import { buildTsl } from "../../src/core/export/tslWriter";
import { planExport, POI_README_MARKER } from "../../src/core/export/planExport";
import { parseTm, child, findAll } from "../../src/core/tm/tmParser";
import { shiftEastNorth } from "../../src/core/geo/geo";
import { fmtLonLat, fmtMeters } from "../../src/core/tm/tmEmit";

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
        <[string8u][coordinate_system][lonlat]>
        <[list_xref][xref_list][]
            <[xref][element][0]
                <[string8u][name][tower00_small_plates_ds_00_08_08]>
                <[vector3_float64][position][11.8500000 48.3760000 520.00]>
                <[float32][direction][90]>
                <[float32][scale_factor][1]>
            >
            <[xref][element][1]
                <[string8u][name][barrelRedNew]>
                <[vector3_float64][position][11.8501000 48.3761000 519.50]>
                <[float32][direction][0]>
                <[float32][scale_factor][0.5]>
            >
        >
    >
>
`;

// Byte-identical to the format author's own working `.tsl` (2026-07-17): no `name`, autoheight FALSE.
// See tslWriter for why each of those two is load-bearing — the `autoheight` flag is what kept every
// plant 584 m underground at KDAG for five flights.
const GOLDEN_TSL = `<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][false]>
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
        "        <[string8u][coordinate_system][lonlat]>\n" +
        "        <[list_xref][xref_list][]\n" +
        "        >\n" +
        "    >\n" +
        ">\n",
    );
  });
  it("sanitises a grammar-breaking ] in an object name so the .toc stays parseable (Fable A)", () => {
    const toc = buildToc([{ ...TOWER, name: "lamp]evil" }]);
    expect(toc).toContain("<[string8u][name][lamp)evil]>"); // ] → ) ; the schema also rejects it on load
    const el = findAll(parseTm(toc), "xref")[0]; // the file still parses to ONE well-formed xref element
    expect(child(el, "name")?.value).toBe("lamp)evil");
  });
});

describe("buildTsl — place_simple wrapper", () => {
  it("references the toc via cultivation", () => {
    expect(buildTsl({ tocFileName: "poi" })).toBe(GOLDEN_TSL);
  });
  it("omits the cultivation line when there is no toc", () => {
    const tsl = buildTsl({ tocFileName: null });
    expect(tsl).not.toContain("cultivation");
  });
  it("always writes autoheight FALSE — true forces every plant to height 0", () => {
    // The v0.4 root cause, and it cost five in-sim flights. `true` made the sim ignore each plant's
    // `altitude` and pin it to 0, i.e. 584 m underground at KDAG — so ~20 format variants all failed
    // identically while tm.log stayed silent, because nothing was wrong with the file.
    // Safe for the other kinds: PCT has always written explicit absolute ASL for every object, and
    // repeated gates established autoheight never reached xref cultivation at all.
    expect(buildTsl({ tocFileName: "poi" })).toContain("<[bool][autoheight][false]>");
    expect(buildTsl({ tocFileName: null })).toContain("<[bool][autoheight][false]>");
  });
  it("carries no `name` tag — so the export has no user-typed value at all (retires Fable C2)", () => {
    // The format's author: the line "doesn't make any sense at all, I suggest deleting it without
    // replacement". Dropping it removes the only free-text value the .tsl ever had, which is what
    // the `]`-truncation guard existed for. The .toc's own sanitizeValue still covers object names.
    const tsl = buildTsl({ tocFileName: "poi" });
    expect(tsl).not.toContain("[name]");
    const place = parseTm(tsl).children[0]; // <file> → <tmsimulator_scenery_place_simple>
    expect(child(place, "name")).toBeUndefined();
    expect(child(place, "cultivation")?.value).toBe("poi"); // and the file still parses
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

  it("a zero or absent shift leaves the .toc positions untouched", () => {
    expect(planExport(project, [TOWER, BARREL]).files[1].content).toBe(GOLDEN_TOC);
    const zero = planExport({ ...project, shift: { east: 0, north: 0 } }, [TOWER, BARREL]);
    expect(zero.files[1].content).toBe(GOLDEN_TOC);
  });

  it("bakes the global shift into every object's .toc position (forum #12)", () => {
    const shift = { east: 12, north: -8 };
    const toc = planExport({ ...project, shift }, [TOWER, BARREL]).files[1].content;
    for (const o of [TOWER, BARREL]) {
      const p = shiftEastNorth(o.position, shift.east, shift.north);
      expect(toc).toContain(
        `<[vector3_float64][position][${fmtLonLat(p.lon)} ${fmtLonLat(p.lat)} ${fmtMeters(o.heightAsl)}]>`,
      );
    }
    expect(toc).not.toContain(fmtLonLat(TOWER.position.lon)); // original coord is gone
  });
});
