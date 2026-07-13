import { describe, it, expect } from "vitest";
import type {
  ResolvedAirportLight,
  ResolvedLight,
  ResolvedObject,
  ResolvedXref,
} from "../../src/core/project/types";
import { buildToc } from "../../src/core/export/tocWriter";
import { parseTm, child, findAll } from "../../src/core/tm/tmParser";

// Height-resolved sample objects — the shape the exporter consumes. Coordinates + byte conventions
// mirror the 2026-07-12 in-sim gate (KDAG desert, 584 m ASL), so this golden IS the proven byte shape:
// buildToc's output for these objects renders correctly in Aerofly FS 4.
const AIRPORT_LIGHT: ResolvedAirportLight = {
  id: "al1",
  kind: "airport_light",
  typeName: "runway_edge_light",
  position: { lon: -116.7865649, lat: 34.8546 },
  heightAsl: 584,
  orientation: 90,
  configuration: "wr",
  groupIndex: 3,
};
const POINT_LIGHT: ResolvedLight = {
  id: "pl1",
  kind: "light",
  position: { lon: -116.7878783, lat: 34.8554 },
  heightAsl: 584,
  color: [1, 0, 0],
  intensity: 10000,
  flashing: [1, 0, 3, 0],
  groupIndex: 0,
};
const WITNESS: ResolvedXref = {
  id: "x1",
  kind: "xref",
  name: "silo_00",
  position: { lon: -116.7835003, lat: 34.8546 },
  heightAsl: 584,
  direction: 0,
  scale: 1,
};

// GOLDEN — byte-exact poi.toc for a mixed POI. Sibling order is ALWAYS light → airport_light → xref
// regardless of the input order. Field order/types are the canonical layout (Fable A): airport_light
// leads with type_name and uses float64 orientation; light leads with position. Regenerate deliberately
// only if an in-sim re-gate changes the format — never let it drift silently.
const GOLDEN_LIGHTS_TOC = `<[file][][]
    <[cultivation][][]
        <[string8u][coordinate_system][lonlat]>
        <[list_light][light_list][]
            <[light][element][0]
                <[vector3_float64][position][-116.7878783 34.8554000 584.00]>
                <[vector3_float32][color][1 0 0]>
                <[float32][intensity][10000]>
                <[vector4_float32][flashing][1 0 3 0]>
                <[uint32][group_index][0]>
            >
        >
        <[list_airport_light][airport_light_list][]
            <[airport_light][element][0]
                <[string8u][type_name][runway_edge_light]>
                <[string8u][configuration][wr]>
                <[vector3_float64][position][-116.7865649 34.8546000 584.00]>
                <[float64][orientation][90]>
                <[uint32][group_index][3]>
            >
        >
        <[list_xref][xref_list][]
            <[xref][element][0]
                <[string8u][name][silo_00]>
                <[vector3_float64][position][-116.7835003 34.8546000 584.00]>
                <[float32][direction][0]>
                <[float32][scale_factor][1]>
            >
        >
    >
>
`;

describe("buildToc — v0.2 light lists", () => {
  it("emits byte-exact list_light + list_airport_light in canonical order (input order ignored)", () => {
    // pass them xref-first / airport-first to prove the emitter reorders to light → airport_light → xref
    expect(buildToc([WITNESS, AIRPORT_LIGHT, POINT_LIGHT])).toBe(GOLDEN_LIGHTS_TOC);
  });

  it("omits the light lists entirely for an xref-only POI (byte-identical to pre-v0.2)", () => {
    const toc = buildToc([WITNESS]);
    expect(toc).not.toContain("list_light");
    expect(toc).not.toContain("list_airport_light");
    expect(toc).toContain("<[list_xref][xref_list][]");
  });

  it("still emits list_xref (even empty) for a lights-only POI", () => {
    const toc = buildToc([POINT_LIGHT]);
    expect(toc).toContain("<[list_light][light_list][]");
    expect(toc).toContain("        <[list_xref][xref_list][]\n        >"); // always present, empty here
  });

  it("numbers each list's elements independently from 0", () => {
    const objs: ResolvedObject[] = [POINT_LIGHT, { ...POINT_LIGHT, id: "pl2" }, AIRPORT_LIGHT];
    const toc = buildToc(objs);
    expect(toc).toContain("<[light][element][0]");
    expect(toc).toContain("<[light][element][1]");
    expect(toc).toContain("<[airport_light][element][0]"); // its own index space restarts at 0
  });

  it("round-trips through the reader to the right element counts", () => {
    const tm = parseTm(buildToc([POINT_LIGHT, AIRPORT_LIGHT, WITNESS]));
    expect(findAll(tm, "light")).toHaveLength(1);
    expect(findAll(tm, "airport_light")).toHaveLength(1);
    expect(findAll(tm, "xref")).toHaveLength(1);
  });

  it("sanitises a grammar-breaking ] in an airport-light type_name (defence in depth)", () => {
    const toc = buildToc([{ ...AIRPORT_LIGHT, typeName: "evil]name" }]);
    expect(toc).toContain("<[string8u][type_name][evil)name]>");
    const el = findAll(parseTm(toc), "airport_light")[0];
    expect(child(el, "type_name")?.value).toBe("evil)name");
  });
});
