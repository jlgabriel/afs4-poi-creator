// tapWriter.ts — `<ICAO>.tap`, the airport AUTHORING file the TAP converter reads to produce an airport
// folder (TMB, TOC, TSC and WAD). PCT writes the `.tap` and nothing else: no `.tsc`/`.wad`/`.toc` beside it
// and no install — the converter does that part, outside PCT.
//
// ⚠️ THE `.tap` HAS ITS OWN VOCABULARY. It is not the `.tsc`/`.wad`/`.toc` with other names, and the two
// must never be cross-copied in either direction (see types.ts ReilKind). Row names, types and order
// here follow a `.tap` the converter accepts; where the two formats differ:
//   • place: `name` + `name_short` (not sname/lname), `model_center` (not position), `auto_height` (with
//     an underscore), `icao`/`country` are `stringt8c`.
//   • runway end: `threshold` only (no separate endpoint; `xtension` is the pavement beyond it), its own
//     `direction` in compass degrees, `landing` (not approach), and the `marking_*` rows the converter
//     bakes into the airport's TMB. The pair carries `width`, `material`, `brightness` and two more
//     markings.
//   • helipad / parking: compass `direction` (not heading), parking `radius` (not size) and `type`
//     (not tags).
//   • objects: plants and XREFs carry a 2-D `position` and no height; an XREF has no `scale_factor`; an
//     airport light's fixture is `name` (not type_name); plant `group`/`species` are `string8`.
//     Point and airport lights keep a 3-D position with the same height the `.toc` gets.
//
// Rows PCT has no data for are written with the converter's neutral defaults (see TAP_* below). The two
// derived rows are a runway end's `direction` (from its two thresholds) and `marking_nonumbers` (an
// unnamed end paints no numbers). Empty lists are OMITTED: the converter accepts a `.tap` without them.
// No boundary polygon is written — PCT has none.

import type { LonLat, ResolvedAirportLight, ResolvedLight } from "../project/types";
import { tag, block, fmtLonLat, fmtMeters, fmtNum, sanitizeValue } from "../tm/tmEmit";
import { initialBearing } from "../geo/geo";
import type {
  HeliportIdentity,
  HeliportPadSpec,
  HeliportParkingSpec,
  HeliportRunwaySpec,
} from "./heliportTemplate";

/** A plant as the `.tap` wants it: no height (the converter resolves it). Position already shifted. */
export interface TapPlantSpec {
  position: LonLat;
  heightRange: [number, number];
  group: string;
  species: string;
}

/** An XREF as the `.tap` wants it: 2-D position, rotation, no height, no scale. `direction` is the same
 *  rotation value the `.toc` gets (PlacedXref.direction), not a compass heading. */
export interface TapXrefSpec {
  name: string;
  position: LonLat;
  direction: number;
}

export interface TapSpec {
  identity: HeliportIdentity;
  /** The airport's own point, degrees, shifted with the scene → `model_center`. */
  position: LonLat;
  /** The project's height mode → `auto_height`. */
  autoheight: boolean;
  runways: HeliportRunwaySpec[];
  pads: HeliportPadSpec[];
  parkings: HeliportParkingSpec[];
  plants: TapPlantSpec[];
  /** Height already resolved, exactly as the `.toc` writes it. */
  lights: ResolvedLight[];
  airportLights: ResolvedAirportLight[];
  xrefs: TapXrefSpec[];
}

/** The file name: the code in CAPITALS plus `.tap` — the converter names the airport after it. */
export function tapFileName(icao: string): string {
  return `${icao.trim().toUpperCase()}.tap`;
}

/** Elevation rows (airport and each runway end). PCT has no elevation data, so 0 — the same value the
 *  `.tsc`/`.wad` writers use. */
const TAP_ELEVATION = "0";

/** Per-end rows PCT offers nothing for. The four flags match the `.wad` defaults (heliportTemplate.ts
 *  RUNWAY_END_WAD_DEFAULTS); the markings are the converter's standard set. */
const TAP_RUNWAY_END_DEFAULTS: ReadonlyArray<readonly [string, string, string]> = [
  ["bool", "navigation", "true"],
  ["bool", "departures", "true"],
  ["bool", "non_precision", "false"],
  ["bool", "precision", "false"],
  ["bool", "marking_piano", "true"],
  ["bool", "marking_touchdown", "false"],
  ["bool", "marking_threshold", "true"],
  ["bool", "marking_aimingpoint", "false"],
];

/** Per-pair rows PCT offers nothing for: the standard asphalt runway. */
const TAP_RUNWAY_PAIR_DEFAULTS: ReadonlyArray<readonly [string, string, string]> = [
  ["string8", "material", "asphalt_runway__typestd"],
  ["string8", "brightness", "0.5"],
  ["bool", "marking_centreline", "true"],
  ["bool", "marking_sidelines", "true"],
];

const deg = (p: LonLat): string => `${fmtLonLat(p.lon)} ${fmtLonLat(p.lat)}`;
const deg3 = (p: LonLat, h: number): string => `${deg(p)} ${fmtMeters(h)}`;
const text = (s: string): string => sanitizeValue(s).trim();

/** Compass bearing, degrees [0, 360), from one end's threshold toward the other's: the direction an
 *  aircraft lands at this end. */
function endDirection(from: LonLat, to: LonLat): string {
  const s = fmtNum(initialBearing(from, to), 2);
  return s === "360" ? "0" : s; // 359.996 rounds up
}

/** An empty list is omitted, a non-empty one written as a block. */
function list(type: string, name: string, elements: string[][]): string[] {
  return elements.length === 0 ? [] : block(type, name, "", elements.flat());
}

function runwayPairs(runways: HeliportRunwaySpec[]): string[] {
  return list(
    "list_tm_airport_pd_rwy_pair",
    "runway_pairs",
    runways.map((r, i) => {
      const ends = r.ends.map((e, n) => {
        const other = r.ends[1 - n]!;
        const identifier = text(e.identifier);
        return block("tm_airport_pd_rwy", "element", String(n), [
          tag("vector2_float64", "threshold", deg(e.threshold)),
          tag("float64", "xtension", "0"),
          tag("string8", "identifier", identifier),
          tag("string8", "appltsys", e.appltsys),
          tag("string8", "reil", e.reil),
          tag("string8", "papi", e.papi),
          tag("float64", "direction", endDirection(e.threshold, other.threshold)),
          tag("float64", "elevation", TAP_ELEVATION),
          // `landing` is the project's `approach` (types.ts AirportRunwayEnd).
          tag("bool", "landing", e.approach ? "true" : "false"),
          tag("bool", "takeoff", e.takeoff ? "true" : "false"),
          ...TAP_RUNWAY_END_DEFAULTS.map(([t, f, v]) => tag(t, f, v)),
          // An end without a name gets no painted numbers.
          tag("bool", "marking_nonumbers", identifier === "" ? "true" : "false"),
          tag("bool", "marking_skidmark", "false"),
        ]);
      });
      return block("tm_airport_pd_rwy_pair", "element", String(i), [
        ...block("array_tm_airport_pd_rwy", "runway_pair", "", ends.flat()),
        tag("float64", "width", fmtNum(r.widthM)),
        ...TAP_RUNWAY_PAIR_DEFAULTS.map(([t, f, v]) => tag(t, f, v)),
      ]);
    }),
  );
}

function helipads(pads: HeliportPadSpec[]): string[] {
  return list(
    "list_tm_airport_pd_helipad",
    "helipads",
    pads.map((p, i) =>
      block("tm_airport_pd_helipad", "element", String(i), [
        tag("vector2_float64", "position", deg(p.position)),
        tag("float64", "direction", fmtNum(p.headingDeg)),
        tag("float64", "radius", fmtNum(p.radiusM)),
        // Same fallback as the `.tsc`, so both outputs of one project name the pad alike.
        tag("string8", "name", text(p.name) || "FATO/TLOF"),
      ]),
    ),
  );
}

function parkingPositions(parkings: HeliportParkingSpec[]): string[] {
  return list(
    "list_tm_airport_pd_parking_position",
    "parking_positions",
    parkings.map((p, i) =>
      block("tm_airport_pd_parking_position", "element", String(i), [
        tag("vector2_float64", "position", deg(p.position)),
        tag("float64", "direction", fmtNum(p.headingDeg)),
        tag("float64", "radius", fmtNum(p.sizeM)),
        tag("string8", "name", text(p.name) || "Parking"),
        tag("string8", "type", p.type),
      ]),
    ),
  );
}

function plants(plantList: TapPlantSpec[]): string[] {
  return list(
    "list_tm_airport_pd_plant",
    "plants",
    plantList.map((p, i) =>
      block("tm_airport_pd_plant", "element", String(i), [
        tag("vector2_float64", "position", deg(p.position)),
        tag("vector2_float32", "height_range", p.heightRange.map((h) => fmtMeters(h)).join(" ")),
        tag("string8", "group", sanitizeValue(p.group)),
        tag("string8", "species", sanitizeValue(p.species)),
      ]),
    ),
  );
}

function lights(lightList: ResolvedLight[]): string[] {
  return list(
    "list_tm_airport_pd_light",
    "lights",
    lightList.map((o, i) =>
      block("tm_airport_pd_light", "element", String(i), [
        tag("vector3_float64", "position", deg3(o.position, o.heightAsl)),
        tag("vector3_float32", "color", o.color.map((c) => fmtNum(c, 6)).join(" ")),
        tag("float32", "intensity", fmtNum(o.intensity, 6)),
        tag("vector4_float32", "flashing", o.flashing.map((f) => fmtNum(f, 6)).join(" ")),
        tag("uint32", "group_index", String(o.groupIndex)),
      ]),
    ),
  );
}

function airportLights(lightList: ResolvedAirportLight[]): string[] {
  return list(
    "list_tm_airport_pd_airportlight",
    "airport_lights",
    lightList.map((o, i) =>
      block("tm_airport_pd_airportlight", "element", String(i), [
        tag("string8u", "name", sanitizeValue(o.typeName)),
        tag("string8u", "configuration", sanitizeValue(o.configuration)),
        tag("vector3_float64", "position", deg3(o.position, o.heightAsl)),
        tag("float64", "orientation", fmtNum(o.orientation, 3)),
        tag("uint32", "group_index", String(o.groupIndex)),
      ]),
    ),
  );
}

function xrefs(xrefList: TapXrefSpec[]): string[] {
  return list(
    "list_tm_airport_pd_xref",
    "xrefs",
    xrefList.map((o, i) =>
      block("tm_airport_pd_xref", "element", String(i), [
        tag("string8", "name", sanitizeValue(o.name)),
        tag("vector2_float64", "position", deg(o.position)),
        tag("float64", "direction", fmtNum(o.direction, 3)),
      ]),
    ),
  );
}

/** The whole `.tap` text. Pure; the caller has already validated the identity and shifted every point. */
export function buildTap(spec: TapSpec): string {
  const name = text(spec.identity.name);
  const body = [
    tag("string8", "name", name),
    tag("string8", "name_short", name),
    // The code in CAPITALS, as in the `.tsc`/`.wad`; the country stays lowercase.
    tag("stringt8c", "icao", spec.identity.icao.toUpperCase()),
    tag("stringt8c", "country", spec.identity.country),
    tag("float64", "elevation", TAP_ELEVATION),
    tag("vector2_float64", "model_center", deg(spec.position)),
    tag("bool", "auto_height", spec.autoheight ? "true" : "false"),
    tag("vector2_float64", "offset", "0 0"),
    ...runwayPairs(spec.runways),
    ...helipads(spec.pads),
    ...parkingPositions(spec.parkings),
    ...plants(spec.plants),
    ...lights(spec.lights),
    ...airportLights(spec.airportLights),
    ...xrefs(spec.xrefs),
  ];
  return block("file", "", "", block("tm_airport_pd", "", "", body)).join("\n") + "\n";
}
