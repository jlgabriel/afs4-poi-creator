import { describe, it, expect } from "vitest";
import {
  addAirportCarlot,
  addAirportGroundText,
  addAirportJetway,
  createProject,
  moveAirportMark,
  removeAirportMark,
  rotateAirportMark,
  updateAirportCarlot,
  updateAirportGroundText,
  updateAirportJetway,
} from "../../src/core/project/mutate";
import { carlotsOf, groundTextsOf, jetwaysOf } from "../../src/core/project/airport";
import { cleanGroundTextValue } from "../../src/core/project/marks";
import { parseProject } from "../../src/core/project/schemas";
import { planTap } from "../../src/core/export/planExport";
import type { LonLat, Project } from "../../src/core/project/types";

const CAMERA = { lon: -71.6153, lat: -33.6564, zoom: 15 };
const NOW = "2026-10-13T00:00:00.000Z";
const LATER = "2026-10-13T01:00:00.000Z";
const base = (): Project => createProject({ name: "t", camera: CAMERA, now: NOW });
const P: LonLat = { lon: -71.616, lat: -33.6559 };
const Q: LonLat = { lon: -71.6158, lat: -33.6559 };

/** A project with an airport that Export TAP accepts, plus one of each element. */
function withMarks(): Project {
  let p = base();
  p = addAirportGroundText(p, P, { id: "g1" });
  p = addAirportJetway(p, Q, { id: "j1" });
  p = addAirportCarlot(p, { lon: -71.6156, lat: -33.6559 }, { id: "c1" });
  return {
    ...p,
    airport: {
      ...p.airport!,
      icao: "pctt01",
      name: "Marks Test",
      country: "cl",
      elevation: 75,
      pads: [{ id: "h1", name: "", position: P, heading: 0, radius: 8 }],
    },
  };
}

describe("ground text, jetway and car lot — the model", () => {
  it("places each with its defaults, creating the airport and seeding its point", () => {
    const p = addAirportGroundText(base(), P, { id: "g1" }, LATER);
    expect(p.modifiedAt).toBe(LATER);
    expect(p.airport?.position).toEqual(P);
    expect(groundTextsOf(p.airport)).toEqual([
      {
        id: "g1",
        position: P,
        heading: 0,
        size: [1, 3],
        name: "",
        value: "A",
        textColor: "yellow",
        background: "box",
        backgroundColor: "black",
        strokeColor: "yellow",
        pointing: "none",
      },
    ]);
    const q = addAirportCarlot(addAirportJetway(p, Q, { id: "j1" }), Q, { id: "c1" });
    expect(q.airport?.position).toEqual(P); // the first placement's point stays
    expect(jetwaysOf(q.airport)).toEqual([
      {
        id: "j1",
        position: Q,
        heading: 0,
        mountingElevation: 5,
        extensionDirection: 0,
        extensionPitch: -1,
        extensionAmount: 0,
        exitDirection: 0,
        docked: false,
      },
    ]);
    expect(carlotsOf(q.airport)).toEqual([{ id: "c1", position: Q, heading: 0, rows: 2, columns: 10 }]);
  });

  it("moves, turns and removes by kind and id, and a no-op returns the same project", () => {
    const p = withMarks();
    const moved = moveAirportMark(p, "jetways", "j1", P);
    expect(jetwaysOf(moved.airport)[0]!.position).toEqual(P);
    expect(moveAirportMark(p, "jetways", "nope", P)).toBe(p);
    const turned = rotateAirportMark(p, "groundtexts", "g1", -90);
    expect(groundTextsOf(turned.airport)[0]!.heading).toBe(270);
    expect(rotateAirportMark(p, "groundtexts", "g1", 0)).toBe(p);
    const gone = removeAirportMark(p, "carlots", "c1");
    expect(carlotsOf(gone.airport)).toEqual([]);
    expect(groundTextsOf(gone.airport)).toHaveLength(1);
  });

  it("cleans a ground text's value and refuses a bad letter size", () => {
    expect(cleanGroundTextValue("a1 -b+c]<x>\n")).toBe("A1 -B+CX");
    const p = withMarks();
    const q = updateAirportGroundText(p, "g1", { value: "taxi b", textColor: "white", pointing: "left" });
    expect(groundTextsOf(q.airport)[0]).toMatchObject({ value: "TAXI B", textColor: "white", pointing: "left" });
    expect(updateAirportGroundText(p, "g1", { size: [0, 3] })).toBe(p);
    expect(updateAirportGroundText(p, "g1", { size: [1, 3] })).toBe(p);
    expect(groundTextsOf(updateAirportGroundText(p, "g1", { size: [3, 4.25] }).airport)[0]!.size).toEqual([3, 4.25]);
  });

  it("clamps a jetway's ranged numbers and refuses a non-finite one", () => {
    const p = withMarks();
    const q = updateAirportJetway(p, "j1", {
      mountingElevation: 9,
      extensionAmount: 30,
      extensionDirection: 95,
      exitDirection: -85,
      docked: true,
    });
    expect(jetwaysOf(q.airport)[0]).toMatchObject({
      mountingElevation: 6,
      extensionAmount: 24.5,
      extensionDirection: 80,
      exitDirection: -80,
      docked: true,
    });
    expect(updateAirportJetway(p, "j1", { extensionPitch: Number.NaN })).toBe(p);
  });

  it("rounds a car lot's counts into 1–100", () => {
    const p = withMarks();
    expect(carlotsOf(updateAirportCarlot(p, "c1", { rows: 3.6, columns: 0 }).airport)[0]).toMatchObject({
      rows: 4,
      columns: 1,
    });
  });

  it("round-trips through the loader, and refuses a colour the converter does not know", () => {
    const p = withMarks();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const bad = JSON.parse(JSON.stringify(p));
    bad.airport.groundtexts[0].textColor = "purple";
    expect(() => parseProject(bad)).toThrow();
  });
});

describe("ground text, jetway and car lot — Export TAP", () => {
  it("writes the three lists in the converter's order, the car lots after the XREFs", () => {
    const p = withMarks();
    const withXref: Project = {
      ...p,
      objects: [
        {
          id: "x1",
          kind: "xref",
          position: P,
          height: { mode: "terrain" },
          name: "airport_windsock_large1",
          direction: 0,
          scale: 1,
        },
      ],
    };
    const tap = planTap(withXref, []).content;
    const at = (s: string): number => tap.indexOf(s);
    expect(at("[groundtexts]")).toBeGreaterThan(0);
    expect(at("[groundtexts]")).toBeLessThan(at("[jetways]"));
    expect(at("[jetways]")).toBeLessThan(at("[xrefs]"));
    expect(at("[xrefs]")).toBeLessThan(at("[carlots]"));
  });

  it("writes every row of each element", () => {
    const p = withMarks();
    const turned = rotateAirportMark(rotateAirportMark(rotateAirportMark(p, "groundtexts", "g1", 90), "jetways", "j1", 180), "carlots", "c1", 180);
    const tap = planTap(turned, []).content;
    expect(tap).toContain(
      [
        "<[tm_airport_pd_groundtext][element][0]",
        "                <[vector2_float64][position][-71.6160000 -33.6559000]>",
        "                <[vector2_float64][size][1 3]>",
        "                <[float64][direction][90]>",
        "                <[string8][name][GROUNDTEXT]>",
        "                <[string8][value][A]>",
        "                <[string8][textcolor][yellow]>",
        "                <[string8][background][box]>",
        "                <[string8][backgroundcolor][black]>",
        "                <[string8][strokecolor][yellow]>",
        "                <[string][pointing][none]>",
      ].join("\n"),
    );
    expect(tap).toContain(
      [
        "<[tm_airport_pd_jetway][element][0]",
        "                <[vector2_float64][position][-71.6158000 -33.6559000]>",
        "                <[float64][mounting_elevation][5]>",
        "                <[float64][direction][180]>",
        "                <[float64][extension_direction][0]>",
        "                <[float64][extension_pitch][-1]>",
        "                <[float64][extension_amount][0]>",
        "                <[float64][exit_direction][0]>",
        "                <[bool][docked][false]>",
      ].join("\n"),
    );
    expect(tap).toContain(
      [
        "<[tm_airport_pd_carlot][element][0]",
        "                <[vector2_float64][position][-71.6156000 -33.6559000]>",
        "                <[float64][direction][180]>",
        "                <[string8][pattern][]>",
        "                <[string8][rows][2]>",
        "                <[string8][columns][10]>",
      ].join("\n"),
    );
  });

  it("leaves the lists out when there are none, and warns about a ground text with no text", () => {
    const p = withMarks();
    const none: Project = { ...p, airport: { ...p.airport!, groundtexts: [], jetways: [], carlots: [] } };
    const tap = planTap(none, []).content;
    for (const name of ["groundtexts", "jetways", "carlots"]) expect(tap).not.toContain(`[${name}]`);
    const empty = updateAirportGroundText(p, "g1", { value: "" });
    expect(planTap(empty, []).warnings).toContain("Ground Text 1 has no text, so it paints nothing.");
  });

  it("moves every element with the export shift", () => {
    const p = withMarks();
    const shifted: Project = { ...p, shift: { east: 0, north: 100 } };
    const lat = (tap: string, list: string): number =>
      Number(tap.split(`[${list}]`)[1]!.split("[position][")[1]!.split("]")[0]!.split(" ")[1]);
    const a = planTap(p, []).content;
    const b = planTap(shifted, []).content;
    for (const list of ["groundtexts", "jetways", "carlots"]) expect(lat(b, list)).toBeGreaterThan(lat(a, list));
  });
});
