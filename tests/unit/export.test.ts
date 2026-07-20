import { describe, it, expect } from "vitest";
import type { Project, ResolvedXref, ResolvedPlant } from "../../src/core/project/types";
import { buildToc } from "../../src/core/export/tocWriter";
import { buildTsl } from "../../src/core/export/tslWriter";
import { planExport, POI_README_MARKER } from "../../src/core/export/planExport";
import { ANCHOR_ASSETS, ANCHOR_GEOMETRY } from "../../src/core/export/plantAnchor";
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
const PLANT: ResolvedPlant = {
  id: "p",
  kind: "plant",
  group: "conifer",
  species: "00",
  position: { lon: 11.85, lat: 48.376 },
  heightAsl: 520,
  heightRange: [17, 17],
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

// GOLDEN — the .tsl a POI WITH plants carries: the same wrapper plus the reference-POI anchor object at
// terrain height (v0.4 plant-culling fix). autoheight stays FALSE and the anchor has NO
// autoheight_override (absolute mode) — the in-sim-proven layout (gate 2026-07-17). Regenerate
// deliberately if the anchor format changes; never let it drift silently.
const GOLDEN_TSL_ANCHORED = `<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][false]>
        <[string8u][cultivation][poi]>
        <[list_tmsimulator_scenery_object][objects][]
            <[tmsimulator_scenery_object][element][0]
                <[string8u][type][object]>
                <[string8u][geometry][pct_anchor]>
                <[vector3_float64][position][11.8500000 48.3760000 520.00]>
            >
        >
    >
>
`;

// GOLDEN — the .tsl an AUTOHEIGHT POI carries (v0.5, forum #142): autoheight=TRUE and the anchor is written
// AGL — position z = -1.0 (buried, so it can't collide with anything on the surface — chrispriv #151) +
// autoheight_override=-1 (inherit the place's true), which is what makes autoheight reach the cultivation.
// Regenerated DELIBERATELY when the anchor was buried; the 2026-07-19 gate flew 0.1 and the buried value
// awaits its own gate (docs/GATE_AUTOHEIGHT_LIGHTS_ANCHOR.md). Never let this drift silently.
const GOLDEN_TSL_AUTOHEIGHT = `<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][true]>
        <[string8u][cultivation][poi]>
        <[list_tmsimulator_scenery_object][objects][]
            <[tmsimulator_scenery_object][element][0]
                <[string8u][type][object]>
                <[string8u][geometry][pct_anchor]>
                <[vector3_float64][position][11.8500000 48.3760000 -1.0]>
                <[int32][autoheight_override][-1]>
            >
        >
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

  it("emits the plant anchor object at terrain height when given an anchor (v0.4 culling fix)", () => {
    const anchor = { position: { lon: 11.85, lat: 48.376 }, heightAsl: 520 };
    expect(buildTsl({ tocFileName: "poi", anchor })).toBe(GOLDEN_TSL_ANCHORED);
  });

  it("carries no objects when there is no anchor — absent and null are identical to before v0.4", () => {
    expect(buildTsl({ tocFileName: "poi", anchor: null })).toBe(GOLDEN_TSL);
    expect(buildTsl({ tocFileName: "poi" })).toBe(GOLDEN_TSL);
  });

  it("keeps the anchor ABSOLUTE — autoheight FALSE, no autoheight_override (matches __af_abs)", () => {
    // The in-sim gate (2026-07-17) proved the anchor holds in absolute mode, so PCT keeps its baked-ASL
    // model: the place stays autoheight=false and the anchor object carries no override (it agrees with
    // the place), exactly as IPACS's official exporter emits an absolute object.
    const tsl = buildTsl({ tocFileName: "poi", anchor: { position: { lon: 11.85, lat: 48.376 }, heightAsl: 520 } });
    expect(tsl).toContain("<[bool][autoheight][false]>");
    expect(tsl).not.toContain("autoheight_override");
    expect(tsl).toContain(`<[string8u][geometry][${ANCHOR_GEOMETRY}]>`);
    const place = parseTm(tsl).children[0]; // still a well-formed place with exactly one scenery object
    expect(findAll(place, "tmsimulator_scenery_object").length).toBe(1);
  });

  it("autoheight=true → place autoheight=true + the anchor AGL (z=-1.0, override=-1), byte-exact (v0.5)", () => {
    // The override is what makes autoheight reach the cultivation (gate 2026-07-19), and heightAsl on the
    // anchor is ignored (the AGL z is a fixed literal), so it can be 0. The z itself is BURIED (chrispriv
    // #151) — the gate flew 0.1, so the buried value is pending its own (GATE_AUTOHEIGHT_LIGHTS_ANCHOR.md).
    const anchor = { position: { lon: 11.85, lat: 48.376 }, heightAsl: 0 };
    expect(buildTsl({ tocFileName: "poi", anchor, autoheight: true })).toBe(GOLDEN_TSL_AUTOHEIGHT);
  });

  it("autoheight is opt-in per call — default (absent) stays FALSE, so baked-asl output never moves", () => {
    // The regression lock: every existing caller omits `autoheight`, so it must default false and leave
    // both the plain and anchored goldens byte-identical.
    expect(buildTsl({ tocFileName: "poi" })).toBe(GOLDEN_TSL);
    const anchor = { position: { lon: 11.85, lat: 48.376 }, heightAsl: 520 };
    expect(buildTsl({ tocFileName: "poi", anchor })).toBe(GOLDEN_TSL_ANCHORED);
    expect(buildTsl({ tocFileName: "poi", anchor, autoheight: false })).toBe(GOLDEN_TSL_ANCHORED);
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

  it("a POI with plants emits the anchor object and ships the anchor assets (v0.4)", () => {
    const plan = planExport(project, [PLANT]);
    const tsl = plan.files.find((f) => f.relPath === "poi.tsl")!.content;
    expect(tsl).toContain("<[list_tmsimulator_scenery_object][objects][]");
    expect(tsl).toContain(`<[string8u][geometry][${ANCHOR_GEOMETRY}]>`);
    expect(plan.assets).toEqual([...ANCHOR_ASSETS]);
  });

  it("a POI without plants emits no anchor and ships no assets (byte-identical to before v0.4)", () => {
    const plan = planExport(project, [TOWER, BARREL]);
    expect(plan.files.find((f) => f.relPath === "poi.tsl")!.content).toBe(GOLDEN_TSL);
    expect(plan.assets).toEqual([]);
  });

  it("places the anchor at the centroid + mean ASL of the SHIFTED plants (forum #12)", () => {
    const p2: ResolvedPlant = { ...PLANT, id: "p2", position: { lon: 11.8502, lat: 48.3762 }, heightAsl: 522 };
    const shift = { east: 12, north: -8 };
    const tsl = planExport({ ...project, shift }, [PLANT, p2]).files.find((f) => f.relPath === "poi.tsl")!.content;
    const s1 = shiftEastNorth(PLANT.position, shift.east, shift.north);
    const s2 = shiftEastNorth(p2.position, shift.east, shift.north);
    const c = { lon: (s1.lon + s2.lon) / 2, lat: (s1.lat + s2.lat) / 2 };
    expect(tsl).toContain(`<[vector3_float64][position][${fmtLonLat(c.lon)} ${fmtLonLat(c.lat)} ${fmtMeters(521)}]>`);
  });

  // ── Autoheight mode (v0.5) — the caller resolves heights via resolveHeightsAgl (heightAsl = the AGL z),
  //    then planExport reads project.heightMode to emit autoheight=true + the always-present anchor. ──
  const ahProject: Project = { ...project, heightMode: "autoheight" };
  const AGL_TOWER: ResolvedXref = { ...TOWER, heightAsl: 0 }; // terrain → 0
  const AGL_BARREL: ResolvedXref = { ...BARREL, heightAsl: 25 }; // terrain-offset 25 → floats 25 m

  it("autoheight mode: place is autoheight=true, anchor is present, assets ship — even for an xref-only POI", () => {
    const plan = planExport(ahProject, [AGL_TOWER, AGL_BARREL]);
    const tsl = plan.files.find((f) => f.relPath === "poi.tsl")!.content;
    expect(tsl).toContain("<[bool][autoheight][true]>");
    expect(tsl).toContain("<[int32][autoheight_override][-1]>");
    expect(tsl).toContain(`<[string8u][geometry][${ANCHOR_GEOMETRY}]>`);
    expect(plan.assets).toEqual([...ANCHOR_ASSETS]); // the anchor ALWAYS ships in autoheight (unlike baked-asl)
  });

  it("autoheight anchor sits at the centroid of ALL objects, not just plants", () => {
    const tsl = planExport(ahProject, [AGL_TOWER, AGL_BARREL]).files.find((f) => f.relPath === "poi.tsl")!.content;
    const c = {
      lon: (TOWER.position.lon + BARREL.position.lon) / 2,
      lat: (TOWER.position.lat + BARREL.position.lat) / 2,
    };
    expect(tsl).toContain(`<[vector3_float64][position][${fmtLonLat(c.lon)} ${fmtLonLat(c.lat)} -1.0]>`);
  });

  it("autoheight .toc writes each object at its AGL z (terrain→0, offset→the offset)", () => {
    const toc = planExport(ahProject, [AGL_TOWER, AGL_BARREL]).files.find((f) => f.relPath === "poi.toc")!.content;
    expect(toc).toContain(`${fmtLonLat(TOWER.position.lon)} ${fmtLonLat(TOWER.position.lat)} 0.00]>`);
    expect(toc).toContain(`${fmtLonLat(BARREL.position.lon)} ${fmtLonLat(BARREL.position.lat)} 25.00]>`);
  });

  it("an empty autoheight POI emits no anchor and no assets (nothing to ground)", () => {
    const plan = planExport(ahProject, []);
    expect(plan.files.find((f) => f.relPath === "poi.tsl")!.content).not.toContain("tmsimulator_scenery_object");
    expect(plan.assets).toEqual([]);
  });
});
