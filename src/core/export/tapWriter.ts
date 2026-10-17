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
//     airport light's fixture is `name` (not type_name) and its facing is `direction` (not
//     orientation); plant `group`/`species` are `string8`. Point and airport lights keep a 3-D position
//     with the same height the `.toc` gets.
//   • an XREF's `direction` is the COMPASS HEADING, not the `.toc` rotation: the converter applies the
//     heading → `.toc` direction conversion itself (orientation.ts), so writing the `.toc` value would
//     convert it twice.
//   • the place is always `auto_height` true, and its `elevation` is the reference height the converter
//     places XREFs at — so it must be the airport's real elevation, not 0.
//
//   • `boundaries`: the airport's BOUNDARY polygon, closed (first point repeated as the last). PCT stores
//     it open and closes it here. Followed by `custom_models`, which PCT always writes EMPTY — the list
//     holds complete models, which are not added by third parties, but the converter expects the block.
//   • `tarmacs` (closed polygons, like the boundary) and `lines` (open polylines) come right after
//     `parking_positions`. Their material and line names, and the runway's material, are the converter's
//     vocabulary (surfaces.ts). `brightness` is a `string8` here, and EMPTY for a material that takes none.
//   • `groundtexts`, `taxisigns` and `jetways` follow the lines; `carlots` is the one list written AFTER
//     `xrefs`. The jetway's and car lot's `direction` is the compass heading; the taxi sign's is NOT — it
//     takes the convention of objects (0 = east), see marks.ts taxisignTapDirection. A ground text's
//     `pointing` row is typed `string`, not `string8`; a taxi sign's `brightness` is a `float64`, not a
//     `string8` like a tarmac's.
//   • glider starts are NOT in the `.tap`: they go in a second file, `<ICAO>_addendum.tap`, which the
//     converter merges when both sit side by side in its input folder (see buildTapAddendum).
//
// Rows PCT has no data for are written with the converter's neutral defaults (see TAP_* below). The two
// derived rows are a runway end's `direction` (see endDirection) and `marking_nonumbers` (the negation of
// the end's `numbers` marking, and true for an unnamed end). Empty lists are OMITTED (the converter accepts a `.tap` without them), except
// `custom_models`.

import type {
  AirportCarlot,
  AirportGroundText,
  AirportJetway,
  AirportTaxisign,
  LonLat,
  ResolvedAirportLight,
  ResolvedLight,
  RunwayEndMarkings,
} from "../project/types";
import {
  TAXISIGN_LEVEL,
  cleanGroundTextValue,
  cleanTaxisignValue,
  groundTextTapDirection,
  taxisignTapDirection,
} from "../project/marks";
import { tag, block, fmtLonLat, fmtMeters, fmtNum, sanitizeValue } from "../tm/tmEmit";
import { initialBearing } from "../geo/geo";
import { directionToHeading } from "../geo/orientation";
import type {
  HeliportAerotowSpec,
  HeliportIdentity,
  HeliportPadSpec,
  HeliportParkingSpec,
  HeliportRunwaySpec,
  HeliportWinchSpec,
} from "./heliportTemplate";

/** A plant as the `.tap` wants it: no height (the converter resolves it). Position already shifted. */
export interface TapPlantSpec {
  position: LonLat;
  heightRange: [number, number];
  group: string;
  species: string;
}

/** An XREF as the `.tap` wants it: 2-D position, rotation, no height, no scale. `direction` is the raw
 *  `.toc` rotation (PlacedXref.direction); the writer turns it into the compass heading the `.tap` stores. */
export interface TapXrefSpec {
  name: string;
  position: LonLat;
  direction: number;
}

/** A runway as the `.tap` wants it: the shared spec plus its surface, already resolved to the strings
 *  the file holds (defaults applied, brightness formatted). */
export interface TapRunwaySpec extends HeliportRunwaySpec {
  material: string;
  brightness: string;
  sidelines: boolean;
  centerline: boolean;
  /** Per end, in the order of `ends`, defaults already applied. */
  markings: [RunwayEndMarkings, RunwayEndMarkings];
}

/** A tarmac polygon: an OPEN ring of at least 3 points, shifted (the writer closes it). `brightness` is
 *  the string the file holds — empty for a material that takes none. */
export interface TapTarmacSpec {
  points: LonLat[];
  level: number;
  material: string;
  brightness: string;
}

/** A painted line: at least 2 points, shifted. */
export interface TapLineSpec {
  points: LonLat[];
  name: string;
}

/** The four one-point elements, as the project has them with the position shifted. `heading` is the
 *  project's compass heading; the writer turns it into the `.tap` `direction`. */
export type TapGroundTextSpec = Omit<AirportGroundText, "id">;
export type TapTaxisignSpec = Omit<AirportTaxisign, "id">;
export type TapJetwaySpec = Omit<AirportJetway, "id">;
export type TapCarlotSpec = Omit<AirportCarlot, "id">;

export interface TapSpec {
  identity: HeliportIdentity;
  /** The airport's own point, degrees, shifted with the scene → `model_center`. */
  position: LonLat;
  /** Metres ASL → the place's `elevation` and every runway end's. */
  elevation: number;
  /** The BOUNDARY polygon, OPEN (no repeated point; the writer closes it), at least 3 points, shifted.
   *  Null = none: the `boundaries` block is left out. */
  boundary: LonLat[] | null;
  runways: TapRunwaySpec[];
  pads: HeliportPadSpec[];
  parkings: HeliportParkingSpec[];
  tarmacs: TapTarmacSpec[];
  lines: TapLineSpec[];
  groundTexts: TapGroundTextSpec[];
  taxisigns: TapTaxisignSpec[];
  jetways: TapJetwaySpec[];
  carlots: TapCarlotSpec[];
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

/** The glider-start file beside it: `<ICAO>_addendum.tap`. */
export function tapAddendumFileName(icao: string): string {
  return `${icao.trim().toUpperCase()}_addendum.tap`;
}

/** Per-end rows PCT offers nothing for. The four flags match the `.wad` defaults (heliportTemplate.ts
 *  RUNWAY_END_WAD_DEFAULTS). */
const TAP_RUNWAY_END_DEFAULTS: ReadonlyArray<readonly [string, string, string]> = [
  ["bool", "navigation", "true"],
  ["bool", "departures", "true"],
  ["bool", "non_precision", "false"],
  ["bool", "precision", "false"],
];

const deg = (p: LonLat): string => `${fmtLonLat(p.lon)} ${fmtLonLat(p.lat)}`;
const deg3 = (p: LonLat, h: number): string => `${deg(p)} ${fmtMeters(h)}`;
const text = (s: string): string => sanitizeValue(s).trim();
const bool = (b: boolean): string => (b ? "true" : "false");

/** The runway number an identifier starts with ("05", "23L", "9"), 1–36; null for anything else
 *  (empty, "ALSF2"…). */
function runwayNumber(identifier: string): number | null {
  const m = /^(\d{1,2})(?!\d)/.exec(identifier);
  if (m === null) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 36 ? n : null;
}

/** Absolute difference of two compass bearings, degrees [0, 180]. */
function bearingGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A runway end's `direction`: compass degrees [0, 360) along the runway axis, matching its NAME — end
 *  "05" gets ~050, end "23" ~230, wherever on the map the user put that end's threshold. Of the axis's two
 *  bearings (this threshold → the other, and back) the one closer to the runway number wins. An end with
 *  no runway number in its name gets the bearing from its own threshold toward the other one. */
function endDirection(own: LonLat, other: LonLat, identifier: string): string {
  const toOther = initialBearing(own, other);
  const fromOther = initialBearing(other, own);
  const n = runwayNumber(identifier);
  const b = n !== null && bearingGap(fromOther, n * 10) < bearingGap(toOther, n * 10) ? fromOther : toOther;
  const s = fmtNum(b, 2);
  return s === "360" ? "0" : s; // 359.996 rounds up
}

/** An empty list is omitted, a non-empty one written as a block. */
function list(type: string, name: string, elements: string[][]): string[] {
  return elements.length === 0 ? [] : block(type, name, "", elements.flat());
}

function runwayPairs(runways: TapRunwaySpec[], elevation: string): string[] {
  return list(
    "list_tm_airport_pd_rwy_pair",
    "runway_pairs",
    runways.map((r, i) => {
      const ends = r.ends.map((e, n) => {
        const other = r.ends[1 - n]!;
        const identifier = text(e.identifier);
        const m = r.markings[n]!;
        return block("tm_airport_pd_rwy", "element", String(n), [
          tag("vector2_float64", "threshold", deg(e.threshold)),
          tag("float64", "xtension", "0"),
          tag("string8", "identifier", identifier),
          tag("string8", "appltsys", e.appltsys),
          tag("string8", "reil", e.reil),
          tag("string8", "papi", e.papi),
          tag("float64", "direction", endDirection(e.threshold, other.threshold, identifier)),
          tag("float64", "elevation", elevation),
          // `landing` is the project's `approach` (types.ts AirportRunwayEnd).
          tag("bool", "landing", e.approach ? "true" : "false"),
          tag("bool", "takeoff", e.takeoff ? "true" : "false"),
          ...TAP_RUNWAY_END_DEFAULTS.map(([t, f, v]) => tag(t, f, v)),
          tag("bool", "marking_piano", bool(m.piano)),
          tag("bool", "marking_touchdown", bool(m.touchdown)),
          tag("bool", "marking_threshold", bool(m.threshold)),
          tag("bool", "marking_aimingpoint", bool(m.aimingPoint)),
          // The row is the NEGATION of the checkbox, and an end without a name gets no numbers.
          tag("bool", "marking_nonumbers", bool(!m.numbers || identifier === "")),
          tag("bool", "marking_skidmark", bool(m.skidmarks)),
        ]);
      });
      return block("tm_airport_pd_rwy_pair", "element", String(i), [
        ...block("array_tm_airport_pd_rwy", "runway_pair", "", ends.flat()),
        tag("float64", "width", fmtNum(r.widthM)),
        tag("string8", "material", sanitizeValue(r.material)),
        tag("string8", "brightness", r.brightness),
        tag("bool", "marking_centreline", bool(r.centerline)),
        tag("bool", "marking_sidelines", bool(r.sidelines)),
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
        // `direction`, compass degrees (0 = N, 90 = E) — the same bearing `orientation` holds in the
        // project, written as is: the converter makes the `.toc` value itself.
        tag("float64", "direction", fmtNum(o.orientation, 3)),
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
        tag("float64", "direction", fmtNum(directionToHeading(o.direction), 3)),
      ]),
    ),
  );
}

/** A `points` row: `(lon lat)` pairs on one line, the spacing the converter's own files use. */
const pointList = (points: readonly LonLat[]): string => ` ${points.map((p) => `(${deg(p)})`).join(" ")} `;

/** A polygon CLOSED by repeating its first point, as `boundaries` and `tarmacs` hold it. */
const closed = (ring: readonly LonLat[]): LonLat[] => [...ring, ring[0]!];

/** The `boundaries` list: one element, the polygon closed. */
function boundaries(boundary: LonLat[] | null): string[] {
  if (boundary === null || boundary.length < 3) return [];
  return list("list_tm_airport_pd_boundary", "boundaries", [
    block("tm_airport_pd_boundary", "element", "0", [
      tag("list_vector2_float64", "points", pointList(closed(boundary))),
    ]),
  ]);
}

/** The `tarmacs` list: each polygon closed, then its level, material and brightness. */
function tarmacs(tarmacList: TapTarmacSpec[]): string[] {
  return list(
    "list_tm_airport_pd_tarmac",
    "tarmacs",
    tarmacList.map((t, i) =>
      block("tm_airport_pd_tarmac", "element", String(i), [
        tag("list_vector2_float64", "points", pointList(closed(t.points))),
        tag("int32", "level", String(t.level)),
        tag("string8", "material", sanitizeValue(t.material)),
        tag("string8", "brightness", t.brightness),
      ]),
    ),
  );
}

/** The `lines` list: each polyline OPEN, as drawn, then its line name. */
function lines(lineList: TapLineSpec[]): string[] {
  return list(
    "list_tm_airport_pd_line",
    "lines",
    lineList.map((l, i) =>
      block("tm_airport_pd_line", "element", String(i), [
        tag("list_vector2_float64", "points", pointList(l.points)),
        tag("string8", "name", sanitizeValue(l.name)),
      ]),
    ),
  );
}

/** The `groundtexts` list. `pointing` is a `string` row, not `string8` like the others. */
function groundTexts(list_: TapGroundTextSpec[]): string[] {
  return list(
    "list_tm_airport_pd_groundtext",
    "groundtexts",
    list_.map((g, i) =>
      block("tm_airport_pd_groundtext", "element", String(i), [
        tag("vector2_float64", "position", deg(g.position)),
        tag("vector2_float64", "size", `${fmtNum(g.size[0])} ${fmtNum(g.size[1])}`),
        tag("float64", "direction", fmtNum(groundTextTapDirection(g.heading), 3)),
        tag("string8", "name", text(g.name) || "GROUNDTEXT"),
        tag("string8", "value", cleanGroundTextValue(g.value)),
        tag("string8", "textcolor", g.textColor),
        tag("string8", "background", g.background),
        tag("string8", "backgroundcolor", g.backgroundColor),
        tag("string8", "strokecolor", g.strokeColor),
        tag("string", "pointing", g.pointing),
      ]),
    ),
  );
}

/** The `taxisigns` list. `direction` is in the convention of objects (taxisignTapDirection); `level` is
 *  always TAXISIGN_LEVEL; the components follow in order, each value cleaned to what its type takes. */
function taxisigns(list_: TapTaxisignSpec[]): string[] {
  return list(
    "list_tm_airport_pd_taxisign",
    "taxisigns",
    list_.map((t, i) =>
      block("tm_airport_pd_taxisign", "element", String(i), [
        tag("vector2_float64", "position", deg(t.position)),
        tag("float64", "direction", fmtNum(taxisignTapDirection(t.heading), 3)),
        tag("string8u", "name", text(t.name) || "TAXISIGN"),
        tag("int32", "sizetype", String(t.sizeType)),
        tag("int32", "level", String(TAXISIGN_LEVEL)),
        tag("float64", "brightness", t.brightness.toFixed(1)),
        // Written even when empty: the element's own block is never left out.
        ...block(
          "list_tm_airport_pd_taxisign_element",
          "elements",
          "",
          t.elements.flatMap((e, k) =>
            block("tm_airport_pd_taxisign_element", "element", String(k), [
              tag("string8u", "type", e.type),
              tag("string8u", "value", e.type === "linebreak" ? "" : cleanTaxisignValue(e.type, e.value)),
            ]),
          ),
        ),
      ]),
    ),
  );
}

/** The `jetways` list. `direction` is the compass heading. */
function jetways(list_: TapJetwaySpec[]): string[] {
  return list(
    "list_tm_airport_pd_jetway",
    "jetways",
    list_.map((j, i) =>
      block("tm_airport_pd_jetway", "element", String(i), [
        tag("vector2_float64", "position", deg(j.position)),
        tag("float64", "mounting_elevation", fmtNum(j.mountingElevation, 3)),
        tag("float64", "direction", fmtNum(j.heading, 3)),
        tag("float64", "extension_direction", fmtNum(j.extensionDirection, 3)),
        tag("float64", "extension_pitch", fmtNum(j.extensionPitch, 3)),
        tag("float64", "extension_amount", fmtNum(j.extensionAmount, 3)),
        tag("float64", "exit_direction", fmtNum(j.exitDirection, 3)),
        tag("bool", "docked", j.docked ? "true" : "false"),
      ]),
    ),
  );
}

/** The `carlots` list. `direction` is the compass heading; `pattern` is always empty, and `rows` and
 *  `columns` are `string8` rows. */
function carlots(list_: TapCarlotSpec[]): string[] {
  return list(
    "list_tm_airport_pd_carlot",
    "carlots",
    list_.map((c, i) =>
      block("tm_airport_pd_carlot", "element", String(i), [
        tag("vector2_float64", "position", deg(c.position)),
        tag("float64", "direction", fmtNum(c.heading, 3)),
        tag("string8", "pattern", ""),
        tag("string8", "rows", String(c.rows)),
        tag("string8", "columns", String(c.columns)),
      ]),
    ),
  );
}

/** The whole `.tap` text. Pure; the caller has already validated the identity and shifted every point. */
export function buildTap(spec: TapSpec): string {
  const name = text(spec.identity.name);
  const elevation = fmtNum(spec.elevation, 2);
  const body = [
    tag("string8", "name", name),
    tag("string8", "name_short", name),
    // The code in CAPITALS, as in the `.tsc`/`.wad`; the country stays lowercase.
    tag("stringt8c", "icao", spec.identity.icao.toUpperCase()),
    tag("stringt8c", "country", spec.identity.country),
    tag("float64", "elevation", elevation),
    tag("vector2_float64", "model_center", deg(spec.position)),
    // Always true, whatever the project's height mode: the converter's airport sits on the terrain.
    tag("bool", "auto_height", "true"),
    tag("vector2_float64", "offset", "0 0"),
    ...boundaries(spec.boundary),
    // Always written, always empty (see the header).
    ...block("list_tm_airport_pd_custom_model", "custom_models", "", []),
    ...runwayPairs(spec.runways, elevation),
    ...helipads(spec.pads),
    ...parkingPositions(spec.parkings),
    ...tarmacs(spec.tarmacs),
    ...lines(spec.lines),
    ...groundTexts(spec.groundTexts),
    ...taxisigns(spec.taxisigns),
    ...jetways(spec.jetways),
    ...plants(spec.plants),
    ...lights(spec.lights),
    ...airportLights(spec.airportLights),
    ...xrefs(spec.xrefs),
    // After the XREFs, unlike every other element list.
    ...carlots(spec.carlots),
  ];
  return block("file", "", "", block("tm_airport_pd", "", "", body)).join("\n") + "\n";
}

/** `<ICAO>_addendum.tap`: the airport's glider starts, which live in this second file and not in the
 *  `.tap` itself. Null when the airport has none — then there is no addendum to write.
 *
 *  Its vocabulary is its own, like the `.tap`'s: `name` is `stringt8c`, points are `tmvector2d` written
 *  bare (no parentheses), the winch `spacing` is `float32`, and an aerotow's `direction` is the COMPASS
 *  heading (the converter makes the `.wad` radians). The aerotow's `waypoints` row is written empty, with
 *  the `tmvector2d` type the converter's own addendum uses for it. Winches come first, then aerotows; an
 *  empty one of the two lists is left out. */
export function buildTapAddendum(
  winches: readonly HeliportWinchSpec[],
  aerotows: readonly HeliportAerotowSpec[],
): string | null {
  if (winches.length === 0 && aerotows.length === 0) return null;
  const body = [
    ...list(
      "list_tm_airport_pd_glider_winch",
      "glider_winches",
      winches.map((w, i) =>
        block("tm_airport_pd_glider_winch", "element", String(i), [
          tag("stringt8c", "name", text(w.name)),
          tag("tmvector2d", "position", deg(w.position)),
          tag("tmvector2d", "winch", deg(w.winch)),
          tag("float32", "spacing", fmtNum(w.spacingM)),
        ]),
      ),
    ),
    ...list(
      "list_tm_airport_pd_glider_aerotow",
      "glider_aerotows",
      aerotows.map((a, i) =>
        block("tm_airport_pd_glider_aerotow", "element", String(i), [
          tag("stringt8c", "name", text(a.name)),
          tag("tmvector2d", "position", deg(a.position)),
          tag("float64", "direction", fmtNum(a.headingDeg, 3)),
          tag("tmvector2d", "waypoints", ""),
        ]),
      ),
    ),
  ];
  return block("file", "", "", block("tm_airport_pd", "", "", body)).join("\n") + "\n";
}
