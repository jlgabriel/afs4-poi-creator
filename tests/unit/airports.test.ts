import { describe, expect, it } from "vitest";
import { parseAirportCoordinates, searchAirports } from "../../src/core/airports/airports";
import type { Airport } from "../../src/core/airports/types";

// A tiny hand-built fixture (not the 7845-row bundle). "EG" + "EGLL" + "KMEG" (name "Regional",
// which contains "eg") let one query "eg" exercise all three ranking tiers at once.
const A: Airport[] = [
  { icao: "LFPG", name: "Charles de Gaulle", lat: 49.0097, lon: 2.5479 },
  { icao: "LFPO", name: "Paris Orly", lat: 48.7233, lon: 2.3794 },
  { icao: "KLAX", name: "Los Angeles International", lat: 33.9425, lon: -118.4081 },
  { icao: "EG", name: "Prefix Sentinel", lat: 51, lon: 0 },
  { icao: "EGLL", name: "London Heathrow", lat: 51.4706, lon: -0.4619 },
  { icao: "KMEG", name: "Regional Field", lat: 35, lon: -89 },
];

const icaos = (rows: Airport[]): string[] => rows.map((a) => a.icao);

describe("parseAirportCoordinates", () => {
  it("parses a well-formed [ICAO, name, lat, lon] tuple", () => {
    expect(parseAirportCoordinates([["LFPG", "Charles de Gaulle", 49.0097, 2.5479]])).toEqual([
      { icao: "LFPG", name: "Charles de Gaulle", lat: 49.0097, lon: 2.5479 },
    ]);
  });

  it("uses index 2 as LAT and index 3 as LON (not GeoJSON order)", () => {
    const [a] = parseAirportCoordinates([["KGXA", "Gray Butte Field", 34.566631, -117.670666]]);
    expect(a.lat).toBe(34.566631);
    expect(a.lon).toBe(-117.670666);
  });

  it("skips malformed rows but keeps the good ones", () => {
    const raw: unknown = [
      ["LFPG", "Charles de Gaulle", 49.0097, 2.5479], // ok
      ["BAD", "Short arity", 10], // too few elements
      ["", "Empty ICAO", 10, 20], // empty ICAO
      [42, "Non-string ICAO", 10, 20], // ICAO not a string
      ["NAM", 123, 10, 20], // name not a string
      ["INF", "Non-finite lat", Number.NaN, 20], // lat NaN
      ["LATR", "Lat out of range", 91, 20], // lat > 90
      ["LONR", "Lon out of range", 10, 181], // lon > 180
      "not even an array",
      ["KLAX", "Los Angeles International", 33.9425, -118.4081], // ok
    ];
    expect(icaos(parseAirportCoordinates(raw))).toEqual(["LFPG", "KLAX"]);
  });

  it("returns [] for a non-array input", () => {
    expect(parseAirportCoordinates(null)).toEqual([]);
    expect(parseAirportCoordinates({})).toEqual([]);
  });

  it("keeps only core ICAOs when a core set is given (community filter)", () => {
    const raw = [
      ["LFPG", "Charles de Gaulle", 49.0097, 2.5479],
      ["ZZZZ", "Community WIP", 0, 0],
    ];
    const core = new Set(["LFPG"]);
    expect(icaos(parseAirportCoordinates(raw, core))).toEqual(["LFPG"]);
  });
});

describe("searchAirports", () => {
  it("returns nothing for a blank query", () => {
    expect(searchAirports(A, "")).toEqual([]);
    expect(searchAirports(A, "   ")).toEqual([]);
  });

  it("ranks ICAO exact > ICAO prefix > name substring", () => {
    // "eg": exact EG, prefix EGLL, then KMEG via its name "Regional".
    expect(icaos(searchAirports(A, "eg"))).toEqual(["EG", "EGLL", "KMEG"]);
  });

  it("is case-insensitive on both ICAO and name", () => {
    expect(icaos(searchAirports(A, "lfpg"))).toEqual(["LFPG"]);
    expect(icaos(searchAirports(A, "CHARLES"))).toEqual(["LFPG"]);
  });

  it("matches an ICAO prefix across several airports", () => {
    expect(icaos(searchAirports(A, "lfp"))).toEqual(["LFPG", "LFPO"]);
  });

  it("matches a name substring", () => {
    expect(icaos(searchAirports(A, "angeles"))).toEqual(["KLAX"]);
    expect(icaos(searchAirports(A, "heathrow"))).toEqual(["EGLL"]);
  });

  it("respects the result limit (keeping the highest-ranked)", () => {
    expect(icaos(searchAirports(A, "eg", 2))).toEqual(["EG", "EGLL"]);
  });

  it("matches a name accent-insensitively (Fable A1)", () => {
    const withAccents: Airport[] = [
      { icao: "LSZH", name: "Zürich Airport", lat: 47.4647, lon: 8.5492 },
      { icao: "SCEL", name: "Comodoro Arturo Merino Benítez", lat: -33.393, lon: -70.7858 },
    ];
    // typed WITHOUT the accent still matches — before the fold these returned nothing
    expect(icaos(searchAirports(withAccents, "zurich"))).toEqual(["LSZH"]);
    expect(icaos(searchAirports(withAccents, "benitez"))).toEqual(["SCEL"]);
    // and typed WITH the accent still works
    expect(icaos(searchAirports(withAccents, "zürich"))).toEqual(["LSZH"]);
  });
});
