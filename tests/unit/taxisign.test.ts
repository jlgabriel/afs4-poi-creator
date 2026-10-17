import { describe, it, expect } from "vitest";
import {
  addAirportGroundText,
  addAirportJetway,
  addAirportTaxisign,
  createProject,
  removeAirportMark,
  rotateAirportMark,
  updateAirportTaxisign,
} from "../../src/core/project/mutate";
import { airportPartCount, taxisignsOf } from "../../src/core/project/airport";
import {
  TAXISIGN_TOKENS,
  cleanTaxisignValue,
  editTaxisignValue,
  taxisignFaces,
  taxisignTapDirection,
  taxisignValueProblem,
} from "../../src/core/project/marks";
import { parseProject } from "../../src/core/project/schemas";
import { planTap } from "../../src/core/export/planExport";
import type { AirportTaxisignElement, LonLat, Project } from "../../src/core/project/types";

const CAMERA = { lon: -71.6153, lat: -33.6564, zoom: 15 };
const NOW = "2026-10-13T00:00:00.000Z";
const LATER = "2026-10-13T01:00:00.000Z";
const base = (): Project => createProject({ name: "t", camera: CAMERA, now: NOW });
const P: LonLat = { lon: -71.6161, lat: -33.6559 };

/** A project with an airport that Export TAP accepts, a ground text, a taxi sign and a jetway. */
function withSign(): Project {
  let p = base();
  p = addAirportGroundText(p, { lon: -71.616, lat: -33.6559 }, { id: "g1" });
  p = addAirportTaxisign(p, P, { id: "t1" });
  p = addAirportJetway(p, { lon: -71.6158, lat: -33.6559 }, { id: "j1" });
  return {
    ...p,
    airport: {
      ...p.airport!,
      icao: "pctt01",
      name: "Sign Test",
      country: "cl",
      elevation: 75,
      pads: [{ id: "h1", name: "", position: P, heading: 0, radius: 8 }],
    },
  };
}

const el = (type: AirportTaxisignElement["type"], value = ""): AirportTaxisignElement => ({ type, value });

describe("taxi sign — the vocabulary", () => {
  it("takes per type only the characters the converter lists", () => {
    expect(editTaxisignValue("runway", "23l-05r_")).toBe("23L-05R");
    expect(editTaxisignValue("location", "b2 ")).toBe("B");
    expect(editTaxisignValue("remainingrunway", "1 0")).toBe("10");
    expect(editTaxisignValue("destination", "b<right90>]")).toBe("B<RIGHT90>");
    expect(editTaxisignValue("linebreak", "x")).toBe("");
  });

  it("keeps a half-typed token while editing, and writes only whole known tokens", () => {
    expect(editTaxisignValue("destination", "B<RIG")).toBe("B<RIG");
    expect(cleanTaxisignValue("destination", "B<RIG")).toBe("B");
    // Any whole angle 0–180 is an arrow; past 180, a leading zero or a third hold mark is not.
    expect(cleanTaxisignValue("destination", "<HOLD0>A<LEFT30>")).toBe("<HOLD0>A<LEFT30>");
    expect(cleanTaxisignValue("destination", "A<RIGHT181><LEFT045><HOLD2><RIGHT180>")).toBe("A<RIGHT180>");
    expect(taxisignValueProblem("destination", "B<RIG")).not.toBeNull();
    expect(taxisignValueProblem("destination", "B<RIGHT90>")).toBeNull();
    expect(taxisignValueProblem("location", "")).not.toBeNull();
    expect(taxisignValueProblem("linebreak", "")).toBeNull();
  });

  it("offers the arrows in steps of 45° each way, and the two hold marks", () => {
    expect(TAXISIGN_TOKENS).toHaveLength(12);
    for (const t of ["<LEFT0>", "<LEFT45>", "<RIGHT180>", "<RIGHT135>", "<HOLD0>", "<HOLD1>"]) {
      expect(TAXISIGN_TOKENS).toContain(t);
    }
  });

  it("splits front and back at the first line break", () => {
    const front = [el("runway", "23-05")];
    const back = [el("destination", "<HOLD0>")];
    expect(taxisignFaces([...front, el("linebreak"), ...back])).toEqual([front, back]);
    expect(taxisignFaces(front)).toEqual([front, []]);
  });

  it("writes the direction in the convention of objects: front to the south is 270, to the NE is 45", () => {
    expect(taxisignTapDirection(180)).toBe(270);
    expect(taxisignTapDirection(0)).toBe(90);
    expect(taxisignTapDirection(90)).toBe(0);
    // Non-cardinal: a sign facing 045 (NE) is 45, one facing 120 (ESE) is 330.
    expect(taxisignTapDirection(45)).toBe(45);
    expect(taxisignTapDirection(120)).toBe(330);
  });
});

describe("taxi sign — the model", () => {
  it("places one with its defaults, creating the airport and seeding its point", () => {
    const p = addAirportTaxisign(base(), P, { id: "t1" }, LATER);
    expect(p.modifiedAt).toBe(LATER);
    expect(p.airport?.position).toEqual(P);
    expect(taxisignsOf(p.airport)).toEqual([
      {
        id: "t1",
        position: P,
        heading: 180,
        name: "",
        sizeType: 3,
        brightness: 0.5,
        elements: [{ type: "location", value: "A" }],
      },
    ]);
  });

  it("cleans components, refuses a size type outside 1–4, snaps the brightness, keeps 0.0", () => {
    const p = withSign();
    const q = updateAirportTaxisign(p, "t1", {
      elements: [el("runway", "23-05_"), el("linebreak", "junk"), el("destination", "b<right90>")],
      brightness: 0.04,
    });
    expect(taxisignsOf(q.airport)[0]).toMatchObject({
      brightness: 0,
      elements: [el("runway", "23-05"), el("linebreak"), el("destination", "B<RIGHT90>")],
    });
    expect(updateAirportTaxisign(p, "t1", { sizeType: 5 })).toBe(p);
    expect(updateAirportTaxisign(p, "t1", { brightness: Number.NaN })).toBe(p);
    expect(taxisignsOf(updateAirportTaxisign(p, "t1", { sizeType: 1 }).airport)[0]?.sizeType).toBe(1);
  });

  it("returns the same project for an edit that changes nothing", () => {
    const p = withSign();
    expect(updateAirportTaxisign(p, "t1", { elements: [el("location", "a")] })).toBe(p);
    expect(updateAirportTaxisign(p, "t1", { sizeType: 3, name: "" })).toBe(p);
  });

  it("turns and is removed like the other one-point elements", () => {
    const p = withSign();
    expect(taxisignsOf(rotateAirportMark(p, "taxisigns", "t1", 405).airport)[0]?.heading).toBe(45);
    expect(taxisignsOf(removeAirportMark(p, "taxisigns", "t1").airport)).toEqual([]);
  });

  it("round-trips through the loader, and refuses a component type the converter does not know", () => {
    const p = updateAirportTaxisign(withSign(), "t1", {
      elements: [el("runway", "23-05"), el("linebreak"), el("destination", "<HOLD0>")],
    });
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
    const bad = JSON.parse(JSON.stringify(p));
    bad.airport.taxisigns[0].elements[0].type = "arrow";
    expect(() => parseProject(bad)).toThrow();
  });
});

describe("taxi sign — Export TAP", () => {
  it("sits between the ground texts and the jetways", () => {
    const tap = planTap(withSign(), []).content;
    const at = (s: string): number => tap.indexOf(s);
    expect(at("[groundtexts]")).toBeLessThan(at("[taxisigns]"));
    expect(at("[taxisigns]")).toBeLessThan(at("[jetways]"));
  });

  it("writes every row and the components in order, the direction in the convention of objects", () => {
    // A fresh sign faces south: direction 270, as in the converter's own example.
    const p = updateAirportTaxisign(withSign(), "t1", {
      name: "DEMO_TAXISIGN",
      elements: [el("location", "B"), el("destination", "B<RIGHT90>"), el("linebreak"), el("remainingrunway", "10")],
    });
    const tap = planTap(p, []).content;
    expect(tap).toContain(
      [
        "<[tm_airport_pd_taxisign][element][0]",
        "                <[vector2_float64][position][-71.6161000 -33.6559000]>",
        "                <[float64][direction][270]>",
        "                <[string8u][name][DEMO_TAXISIGN]>",
        "                <[int32][sizetype][3]>",
        "                <[int32][level][0]>",
        "                <[float64][brightness][0.5]>",
        "                <[list_tm_airport_pd_taxisign_element][elements][]",
        "                    <[tm_airport_pd_taxisign_element][element][0]",
        "                        <[string8u][type][location]>",
        "                        <[string8u][value][B]>",
        "                    >",
        "                    <[tm_airport_pd_taxisign_element][element][1]",
        "                        <[string8u][type][destination]>",
        "                        <[string8u][value][B<RIGHT90>]>",
        "                    >",
        "                    <[tm_airport_pd_taxisign_element][element][2]",
        "                        <[string8u][type][linebreak]>",
        "                        <[string8u][value][]>",
        "                    >",
        "                    <[tm_airport_pd_taxisign_element][element][3]",
        "                        <[string8u][type][remainingrunway]>",
        "                        <[string8u][value][10]>",
        "                    >",
        "                >",
        "            >",
      ].join("\n"),
    );
  });

  it("names an unnamed sign TAXISIGN, drops an unfinished token, and warns", () => {
    const p = updateAirportTaxisign(withSign(), "t1", { elements: [el("destination", "C<LEF")] });
    const plan = planTap(p, []);
    expect(plan.content).toContain("<[string8u][name][TAXISIGN]>");
    expect(plan.content).toContain("<[string8u][value][C]>");
    expect(plan.warnings.some((w) => w.startsWith("Taxi Sign 1 has a component"))).toBe(true);
    const blank = updateAirportTaxisign(withSign(), "t1", { elements: [] });
    expect(planTap(blank, []).warnings).toContain("Taxi Sign 1 has nothing on it, so it shows a blank sign.");
  });

  it("leaves the list out when there are none, and moves with the export shift", () => {
    const p = withSign();
    expect(planTap(removeAirportMark(p, "taxisigns", "t1"), []).content).not.toContain("[taxisigns]");
    const lat = (tap: string): number =>
      Number(tap.split("[taxisigns]")[1]!.split("[position][")[1]!.split("]")[0]!.split(" ")[1]);
    const shifted: Project = { ...p, shift: { east: 0, north: 100 } };
    expect(lat(planTap(shifted, []).content)).toBeGreaterThan(lat(planTap(p, []).content));
  });
});

describe("airportPartCount", () => {
  it("counts the marks too — deleting the airport takes them with it", () => {
    // One helipad, one ground text, one taxi sign, one jetway.
    expect(airportPartCount(withSign().airport!)).toBe(4);
  });
});
