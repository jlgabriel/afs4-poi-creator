// tapReader.ts — Import TAP: a `<ICAO>.tap` (and its `<ICAO>_addendum.tap`, when there is one) read back
// into a NEW project. The inverse of tapWriter.ts, and as TOLERANT as it can be: a `.tap` may have been
// written by another tool or edited by hand, so
//   • elements are found by their TYPE anywhere in the file (`tm_airport_pd_tarmac`…), not by their list,
//     their order or their `element` number — a missing, repeated or wrong number changes nothing;
//   • rows inside an element are found by NAME, in any order, whatever type they are written with
//     (`string` / `string8`, `float32` / `float64`…);
//   • a missing list is an empty one, and a missing or unreadable row takes PCT's default for it — the
//     element is still imported, and a warning says what was filled in;
//   • an element that cannot be placed at all (no position, a polygon with too few points) is left out,
//     with a warning naming it;
//   • a block left open at the end of the file is closed there.
// Only a file with no recognisable airport in it at all is refused.
//
// What a `.tap` does not hold comes from PCT's defaults: XREFs and plants get the terrain height (the
// converter resolves heights itself), and an XREF's scale is 1. Lights and airport lights keep the height
// their position carries, as absolute metres ASL.
//
// Conversions are the writer's, reversed: an XREF's `direction` is the compass heading (orientation.ts),
// a taxi sign's is in the convention of objects (marks.ts), every other `direction` is the compass
// heading; polygons are stored open (a repeated closing point is dropped); `marking_nonumbers` is the
// negation of the RWY NUMBER marking; the name the writer puts in place of an empty one ("FATO/TLOF",
// "Parking", "GROUNDTEXT", "TAXISIGN") comes back empty.
import type {
  AirportCarlot,
  AirportGroundText,
  AirportJetway,
  AirportLine,
  AirportPad,
  AirportParking,
  AirportRunway,
  AirportRunwayEnd,
  AirportTarmac,
  AirportTaxisign,
  AirportTaxisignElement,
  AirportAerotow,
  AirportWinch,
  LonLat,
  PlacedObject,
  Project,
  ProjectAirport,
  RunwayEndMarkings,
} from "../project/types";
import { type TmNode, TmParseError, findAll } from "../tm/tmParser";
import {
  APPROACH_LIGHT_SYSTEMS,
  DEFAULT_PARKING_SIZE_M,
  DEFAULT_WINCH_SPACING_M,
  PAPI_SIDES,
  PARKING_TYPES,
  REIL_KINDS,
} from "../project/airport";
import {
  DEFAULT_BRIGHTNESS,
  DEFAULT_LINE_NAME,
  DEFAULT_RUNWAY_END_MARKINGS,
  DEFAULT_RUNWAY_MATERIAL,
  DEFAULT_TARMAC_MATERIAL,
  clampBrightness,
  cleanRunwayExtension,
  tarmacLevel,
} from "../project/surfaces";
import {
  DEFAULT_GROUNDTEXT_BACKGROUND,
  DEFAULT_GROUNDTEXT_BACKGROUND_COLOR,
  DEFAULT_GROUNDTEXT_POINTING,
  DEFAULT_GROUNDTEXT_SIZE,
  DEFAULT_GROUNDTEXT_STROKE_COLOR,
  DEFAULT_GROUNDTEXT_TEXT_COLOR,
  DEFAULT_JETWAY,
  DEFAULT_TAXISIGN_BRIGHTNESS,
  DEFAULT_TAXISIGN_SIZE_TYPE,
  GROUNDTEXT_BACKGROUNDS,
  GROUNDTEXT_COLORS,
  GROUNDTEXT_POINTING,
  JETWAY_EXIT_DIRECTION_RANGE,
  JETWAY_EXTENSION_AMOUNT_RANGE,
  JETWAY_EXTENSION_DIRECTION_RANGE,
  JETWAY_MOUNTING_RANGE,
  TAXISIGN_ELEMENT_TYPES,
  TAXISIGN_SIZE_TYPES,
  cleanCarlotCount,
  cleanGroundTextValue,
  cleanTaxisignValue,
  clampTaxisignBrightness,
  clampTo,
  DEFAULT_CARLOT_COLUMNS,
  DEFAULT_CARLOT_ROWS,
} from "../project/marks";
import { directionToHeading, headingToDirection } from "../geo/orientation";
import { parseProject } from "../project/schemas";
import { DEFAULT_PAD_RADIUS_M } from "../export/planExport";

export interface TapImport {
  project: Project;
  /** What was filled in or left out, one line each, naming the element as the file numbers it. */
  warnings: string[];
}

export class TapImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TapImportError";
  }
}

// ── The lenient grammar ──────────────────────────────────────────────────────────────────────────────

/** tmParser's grammar, with two allowances: a block still open at the end of the file is closed there,
 *  and anything after the root node is ignored. Throws only when there is no node at all. */
export function parseTmLenient(text: string): { root: TmNode; closedAtEnd: number } {
  let i = 0;
  const n = text.length;
  let closedAtEnd = 0;
  const skip = (): void => {
    while (i < n) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n" || c === "﻿") i++;
      else if (c === "/" && text[i + 1] === "/") {
        while (i < n && text[i] !== "\n") i++;
      } else break;
    }
  };
  const bracket = (): string => {
    skip();
    if (text[i] !== "[") throw new TmParseError(`expected '[' at offset ${i}`, i);
    i++;
    const start = i;
    while (i < n && text[i] !== "]") i++;
    const value = text.slice(start, i);
    i++;
    return value;
  };
  const node = (): TmNode => {
    skip();
    if (text[i] !== "<") throw new TmParseError(`expected '<' at offset ${i}`, i);
    i++;
    const nd: TmNode = { type: bracket(), name: bracket(), value: bracket(), children: [] };
    for (;;) {
      skip();
      if (i >= n) {
        closedAtEnd++;
        return nd;
      }
      if (text[i] === ">") {
        i++;
        return nd;
      }
      nd.children.push(node());
    }
  };
  skip();
  return { root: node(), closedAtEnd };
}

// ── Rows, by name ────────────────────────────────────────────────────────────────────────────────────

/** Reads the rows of one element and records what it had to fill in. */
class Rows {
  private readonly missing: string[] = [];
  constructor(
    private readonly el: TmNode,
    readonly label: string,
  ) {}

  private row(name: string): TmNode | undefined {
    return this.el.children.find((c) => c.name === name && c.children.length === 0);
  }

  has(name: string): boolean {
    return this.row(name) !== undefined;
  }

  str(name: string, def: string): string {
    const r = this.row(name);
    if (r === undefined) {
      this.missing.push(name);
      return def;
    }
    return r.value.trim();
  }

  /** A string from a fixed vocabulary; anything else takes the default. */
  pick<T extends string>(name: string, allowed: readonly T[], def: T, lower = true): T {
    const r = this.row(name);
    const v = r === undefined ? undefined : lower ? r.value.trim().toLowerCase() : r.value.trim();
    if (v !== undefined && (allowed as readonly string[]).includes(v)) return v as T;
    this.missing.push(name);
    return def;
  }

  num(name: string, def: number): number {
    const r = this.row(name);
    const v = r === undefined ? NaN : Number(r.value.trim());
    if (r === undefined || r.value.trim() === "" || !Number.isFinite(v)) {
      this.missing.push(name);
      return def;
    }
    return v;
  }

  bool(name: string, def: boolean): boolean {
    const v = this.row(name)?.value.trim().toLowerCase();
    if (v === "true" || v === "1") return true;
    if (v === "false" || v === "0") return false;
    this.missing.push(name);
    return def;
  }

  /** The first numbers of a row: `lon lat`, `lon lat h`, `w h`… Null when it has fewer than `count`. */
  nums(name: string, count: number): number[] | null {
    const r = this.row(name);
    const parts = r === undefined ? [] : r.value.trim().split(/[\s,]+/).map(Number);
    if (parts.length < count || parts.slice(0, count).some((p) => !Number.isFinite(p))) return null;
    return parts.slice(0, count);
  }

  /** A point, degrees. Null (and nothing recorded: the caller decides) when absent or out of range. */
  lonLat(name: string): LonLat | null {
    const v = this.nums(name, 2);
    if (v === null) return null;
    const [lon, lat] = v as [number, number];
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    return { lon, lat };
  }

  /** A `points` row: `(lon lat) (lon lat) …`, or bare pairs when there are no parentheses. */
  points(name: string): LonLat[] {
    const r = this.row(name);
    if (r === undefined) return [];
    const groups = [...r.value.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!);
    const pairs: number[][] = [];
    if (groups.length > 0) {
      for (const g of groups) pairs.push(g.trim().split(/[\s,]+/).map(Number));
    } else {
      const flat = r.value.trim().split(/[\s,]+/).map(Number);
      for (let k = 0; k + 1 < flat.length; k += 2) pairs.push([flat[k]!, flat[k + 1]!]);
    }
    return pairs
      .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .filter((p) => Math.abs(p[0]!) <= 180 && Math.abs(p[1]!) <= 90)
      .map((p) => ({ lon: p[0]!, lat: p[1]! }));
  }

  /** One warning for everything filled in, or none. */
  report(warnings: string[]): void {
    if (this.missing.length > 0) {
      warnings.push(`${this.label}: ${[...new Set(this.missing)].join(", ")} missing or unreadable — PCT's default used.`);
    }
  }
}

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

/** A polygon stored open: a closing point that repeats the first is dropped. */
function open(points: LonLat[]): LonLat[] {
  if (points.length < 2) return points;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return Math.abs(a.lon - b.lon) < 1e-9 && Math.abs(a.lat - b.lat) < 1e-9 ? points.slice(0, -1) : points;
}

/** The name the writer puts in place of an empty one comes back empty. */
const unfill = (name: string, filler: string): string => (name === filler ? "" : name);

const centroidOf = (points: readonly LonLat[]): LonLat => ({
  lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
});

// ── The import ───────────────────────────────────────────────────────────────────────────────────────

export function readTap(
  tapText: string,
  addendumText: string | null,
  opts: { now?: string; newId?: () => string } = {},
): TapImport {
  const now = opts.now ?? new Date().toISOString();
  const newId = opts.newId ?? ((): string => globalThis.crypto.randomUUID());
  const warnings: string[] = [];

  let parsed: { root: TmNode; closedAtEnd: number };
  try {
    parsed = parseTmLenient(tapText);
  } catch (err) {
    throw new TapImportError(`This is not a TAP file: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (parsed.closedAtEnd > 0) warnings.push("The file ended before every block was closed; it was read up to its end.");
  // The place: the `tm_airport_pd` node, wherever it sits. Without one, the root still counts when it
  // holds airport rows or elements directly (a file whose wrapper was lost).
  const place = findAll(parsed.root, "tm_airport_pd")[0] ?? parsed.root;
  const looksLikeAirport = (nd: TmNode): boolean =>
    nd.children.some((c) => c.name === "icao" || /^(list_)?tm_airport_pd/.test(c.type));
  if (place.type !== "tm_airport_pd" && !looksLikeAirport(place)) {
    throw new TapImportError("This is not a TAP file: it has no airport (tm_airport_pd) in it.");
  }

  // The place itself.
  const p = new Rows(place, "Airport");
  const name = p.has("name") ? p.str("name", "") : p.str("name_short", "");
  const icao = p.str("icao", "").toLowerCase();
  const country = p.str("country", "").toLowerCase();
  const elevation = p.has("elevation") ? p.num("elevation", 0) : undefined;
  const position = p.lonLat("model_center") ?? undefined;
  p.report(warnings);

  const all = (type: string): TmNode[] => findAll(parsed.root, type);
  const each = <T>(type: string, label: string, read: (r: Rows, el: TmNode) => T | null): T[] => {
    const out: T[] = [];
    all(type).forEach((el, k) => {
      const r = new Rows(el, `${label} ${k + 1}`);
      const v = read(r, el);
      if (v === null) return;
      r.report(warnings);
      out.push(v);
    });
    return out;
  };
  const noPosition = (label: string): null => {
    warnings.push(`${label} has no readable position, so it is left out.`);
    return null;
  };

  // Boundary: the first one (an airport has one).
  const boundaries = all("tm_airport_pd_boundary");
  let boundary: LonLat[] | undefined;
  if (boundaries.length > 0) {
    const pts = open(new Rows(boundaries[0]!, "Boundary").points("points"));
    if (pts.length >= 3) boundary = pts;
    else warnings.push("The boundary has fewer than three points, so it is left out.");
    if (boundaries.length > 1) warnings.push(`The file has ${boundaries.length} boundaries; only the first is imported.`);
  }

  const runways = each<AirportRunway>("tm_airport_pd_rwy_pair", "Runway", (r, el) => {
    const endNodes = findAll(el, "tm_airport_pd_rwy");
    if (endNodes.length < 2) {
      warnings.push(`${r.label} has ${endNodes.length} end${endNodes.length === 1 ? "" : "s"} instead of two, so it is left out.`);
      return null;
    }
    if (endNodes.length > 2) warnings.push(`${r.label} has ${endNodes.length} ends; the first two are imported.`);
    const ends: AirportRunwayEnd[] = [];
    for (const [k, node] of endNodes.slice(0, 2).entries()) {
      const e = new Rows(node, `${r.label} end ${k + 1}`);
      const threshold = e.lonLat("threshold");
      if (threshold === null) {
        warnings.push(`${e.label} has no readable threshold, so the runway is left out.`);
        return null;
      }
      const d = DEFAULT_RUNWAY_END_MARKINGS;
      const markings: RunwayEndMarkings = {
        numbers: !e.bool("marking_nonumbers", !d.numbers),
        threshold: e.bool("marking_threshold", d.threshold),
        piano: e.bool("marking_piano", d.piano),
        skidmarks: e.bool("marking_skidmark", d.skidmarks),
        touchdown: e.bool("marking_touchdown", d.touchdown),
        aimingPoint: e.bool("marking_aimingpoint", d.aimingPoint),
      };
      const xtension = e.num("xtension", 0);
      const extension = cleanRunwayExtension(xtension);
      if (extension !== xtension) {
        warnings.push(`${e.label}: extended runway ${xtension} m is not 0–99999 whole metres; ${extension} m is used.`);
      }
      ends.push({
        threshold,
        identifier: e.str("identifier", "").toUpperCase(),
        appltsys: e.pick("appltsys", APPROACH_LIGHT_SYSTEMS, "none"),
        papi: e.pick("papi", PAPI_SIDES, "none"),
        reil: e.pick("reil", REIL_KINDS, "none"),
        approach: e.bool("landing", true),
        takeoff: e.bool("takeoff", true),
        markings,
        // Absent ≡ 0 (types.ts), so a runway without one imports exactly as before.
        ...(extension > 0 ? { extension } : {}),
      });
      e.report(warnings);
    }
    const width = r.num("width", 30);
    const material = r.str("material", DEFAULT_RUNWAY_MATERIAL) || DEFAULT_RUNWAY_MATERIAL;
    const b = r.str("brightness", "");
    return {
      id: newId(),
      ends: [ends[0]!, ends[1]!],
      width: width > 0 ? width : 30,
      material,
      brightness: b === "" || !Number.isFinite(Number(b)) ? DEFAULT_BRIGHTNESS : clampBrightness(Number(b)),
      sidelines: r.bool("marking_sidelines", true),
      centerline: r.bool("marking_centreline", true),
    };
  });

  const pads = each<AirportPad>("tm_airport_pd_helipad", "Helipad", (r) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    const radius = r.num("radius", DEFAULT_PAD_RADIUS_M);
    return {
      id: newId(),
      name: unfill(r.str("name", ""), "FATO/TLOF"),
      position: at,
      heading: norm360(r.num("direction", 0)),
      radius: radius > 0 ? radius : DEFAULT_PAD_RADIUS_M,
    };
  });

  const parkings = each<AirportParking>("tm_airport_pd_parking_position", "Parking", (r) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    const type = r.pick("type", PARKING_TYPES, "parked_ga");
    const size = r.num("radius", DEFAULT_PARKING_SIZE_M[type]);
    return {
      id: newId(),
      name: unfill(r.str("name", ""), "Parking"),
      position: at,
      heading: norm360(r.num("direction", 0)),
      size: size > 0 ? size : DEFAULT_PARKING_SIZE_M[type],
      type,
    };
  });

  const tarmacs = each<AirportTarmac>("tm_airport_pd_tarmac", "Tarmac", (r) => {
    const points = open(r.points("points"));
    if (points.length < 3) {
      warnings.push(`${r.label} has fewer than three points, so it is left out.`);
      return null;
    }
    const material = r.str("material", DEFAULT_TARMAC_MATERIAL) || DEFAULT_TARMAC_MATERIAL;
    const b = r.has("brightness") ? r.str("brightness", "") : "";
    return {
      id: newId(),
      points,
      level: tarmacLevel(material, Math.round(r.num("level", 1))),
      material,
      brightness: b === "" || !Number.isFinite(Number(b)) ? DEFAULT_BRIGHTNESS : clampBrightness(Number(b)),
    };
  });

  const lines = each<AirportLine>("tm_airport_pd_line", "Line", (r) => {
    const points = r.points("points");
    if (points.length < 2) {
      warnings.push(`${r.label} has fewer than two points, so it is left out.`);
      return null;
    }
    return { id: newId(), points, name: r.str("name", DEFAULT_LINE_NAME) || DEFAULT_LINE_NAME };
  });

  const groundtexts = each<AirportGroundText>("tm_airport_pd_groundtext", "Ground text", (r) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    const size = r.nums("size", 2);
    if (size === null) r.str("size", "");
    const [w, h] = size !== null && size[0]! > 0 && size[1]! > 0 ? size : DEFAULT_GROUNDTEXT_SIZE;
    return {
      id: newId(),
      position: at,
      heading: norm360(r.num("direction", 0)),
      size: [w!, h!],
      name: unfill(r.str("name", ""), "GROUNDTEXT"),
      value: cleanGroundTextValue(r.str("value", "")),
      textColor: r.pick("textcolor", GROUNDTEXT_COLORS, DEFAULT_GROUNDTEXT_TEXT_COLOR),
      background: r.pick("background", GROUNDTEXT_BACKGROUNDS, DEFAULT_GROUNDTEXT_BACKGROUND),
      backgroundColor: r.pick("backgroundcolor", GROUNDTEXT_COLORS, DEFAULT_GROUNDTEXT_BACKGROUND_COLOR),
      strokeColor: r.pick("strokecolor", GROUNDTEXT_COLORS, DEFAULT_GROUNDTEXT_STROKE_COLOR),
      pointing: r.pick("pointing", GROUNDTEXT_POINTING, DEFAULT_GROUNDTEXT_POINTING),
    };
  });

  const taxisigns = each<AirportTaxisign>("tm_airport_pd_taxisign", "Taxi sign", (r, el) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    const elements: AirportTaxisignElement[] = [];
    for (const c of findAll(el, "tm_airport_pd_taxisign_element")) {
      const e = new Rows(c, `${r.label} component`);
      const type = e.pick("type", TAXISIGN_ELEMENT_TYPES, "location");
      const raw = e.has("value") ? e.str("value", "") : "";
      elements.push({ type, value: type === "linebreak" ? "" : cleanTaxisignValue(type, raw) });
      e.report(warnings);
    }
    const sizeType = Math.round(r.num("sizetype", DEFAULT_TAXISIGN_SIZE_TYPE));
    return {
      id: newId(),
      position: at,
      // The convention of objects (0 = east): the inverse of marks.ts taxisignTapDirection.
      heading: norm360(directionToHeading(r.num("direction", headingToDirection(180)))),
      name: unfill(r.str("name", ""), "TAXISIGN"),
      sizeType: (TAXISIGN_SIZE_TYPES as readonly number[]).includes(sizeType) ? sizeType : DEFAULT_TAXISIGN_SIZE_TYPE,
      brightness: clampTaxisignBrightness(r.num("brightness", DEFAULT_TAXISIGN_BRIGHTNESS)) ?? DEFAULT_TAXISIGN_BRIGHTNESS,
      elements,
    };
  });

  const jetways = each<AirportJetway>("tm_airport_pd_jetway", "Jetway", (r) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    const ranged = (row: string, range: readonly [number, number], def: number): number =>
      clampTo(r.num(row, def), range) ?? def;
    return {
      id: newId(),
      position: at,
      heading: norm360(r.num("direction", 0)),
      mountingElevation: ranged("mounting_elevation", JETWAY_MOUNTING_RANGE, DEFAULT_JETWAY.mountingElevation),
      extensionDirection: ranged("extension_direction", JETWAY_EXTENSION_DIRECTION_RANGE, DEFAULT_JETWAY.extensionDirection),
      extensionPitch: r.num("extension_pitch", DEFAULT_JETWAY.extensionPitch),
      extensionAmount: ranged("extension_amount", JETWAY_EXTENSION_AMOUNT_RANGE, DEFAULT_JETWAY.extensionAmount),
      exitDirection: ranged("exit_direction", JETWAY_EXIT_DIRECTION_RANGE, DEFAULT_JETWAY.exitDirection),
      docked: r.bool("docked", DEFAULT_JETWAY.docked),
    };
  });

  const carlots = each<AirportCarlot>("tm_airport_pd_carlot", "Car lot", (r) => {
    const at = r.lonLat("position");
    if (at === null) return noPosition(r.label);
    return {
      id: newId(),
      position: at,
      heading: norm360(r.num("direction", 0)),
      rows: cleanCarlotCount(r.num("rows", DEFAULT_CARLOT_ROWS)) ?? DEFAULT_CARLOT_ROWS,
      columns: cleanCarlotCount(r.num("columns", DEFAULT_CARLOT_COLUMNS)) ?? DEFAULT_CARLOT_COLUMNS,
    };
  });

  // The objects: plants, lights, airport lights, XREFs.
  const objects: PlacedObject[] = [
    ...each<PlacedObject>("tm_airport_pd_plant", "Plant", (r) => {
      const at = r.lonLat("position");
      if (at === null) return noPosition(r.label);
      const range = r.nums("height_range", 2);
      if (range === null) r.str("height_range", "");
      return {
        id: newId(),
        kind: "plant",
        position: at,
        height: { mode: "terrain" },
        group: r.str("group", ""),
        species: r.str("species", ""),
        heightRange: range === null ? [0, 0] : [Math.max(0, range[0]!), Math.max(0, range[1]!)],
      };
    }),
    ...each<PlacedObject>("tm_airport_pd_light", "Light", (r) => {
      const v = r.nums("position", 3);
      const at = r.lonLat("position");
      if (at === null || v === null) return noPosition(r.label);
      const color = r.nums("color", 3);
      if (color === null) r.str("color", "");
      const flash = r.nums("flashing", 4);
      if (flash === null) r.str("flashing", "");
      return {
        id: newId(),
        kind: "light",
        position: at,
        height: { mode: "asl", value: v[2]! },
        color: (color ?? [1, 1, 1]).map((c) => Math.min(1, Math.max(0, c))) as [number, number, number],
        intensity: Math.max(0, r.num("intensity", 100)),
        flashing: (flash ?? [0, 0, 0, 0]) as [number, number, number, number],
        groupIndex: Math.round(r.num("group_index", 0)),
      };
    }),
    ...each<PlacedObject>("tm_airport_pd_airportlight", "Airport light", (r) => {
      const v = r.nums("position", 3);
      const at = r.lonLat("position");
      if (at === null || v === null) return noPosition(r.label);
      const typeName = r.str("name", "");
      if (typeName === "") {
        warnings.push(`${r.label} has no fixture name, so it is left out.`);
        return null;
      }
      return {
        id: newId(),
        kind: "airport_light",
        position: at,
        height: { mode: "asl", value: v[2]! },
        typeName,
        configuration: r.has("configuration") ? r.str("configuration", "") : "",
        orientation: norm360(r.num("direction", 0)),
        groupIndex: Math.round(r.num("group_index", 0)),
      };
    }),
    ...each<PlacedObject>("tm_airport_pd_xref", "XREF", (r) => {
      const at = r.lonLat("position");
      if (at === null) return noPosition(r.label);
      const name = r.str("name", "");
      if (name === "") {
        warnings.push(`${r.label} has no object name, so it is left out.`);
        return null;
      }
      return {
        id: newId(),
        kind: "xref",
        name,
        position: at,
        height: { mode: "terrain" },
        // The `.tap` holds the compass heading; the project holds the `.toc` rotation (orientation.ts).
        direction: headingToDirection(r.num("direction", 0)),
        scale: 1,
      };
    }),
  ];

  // The addendum: glider starts.
  let winches: AirportWinch[] = [];
  let aerotows: AirportAerotow[] = [];
  if (addendumText !== null) {
    let add: TmNode | null = null;
    try {
      add = parseTmLenient(addendumText).root;
    } catch {
      warnings.push("The addendum file could not be read, so the glider starts are left out.");
    }
    if (add !== null) {
      const eachAdd = <T>(type: string, label: string, read: (r: Rows) => T | null): T[] =>
        findAll(add, type).flatMap((el, k) => {
          const r = new Rows(el, `${label} ${k + 1}`);
          const v = read(r);
          if (v === null) return [];
          r.report(warnings);
          return [v];
        });
      winches = eachAdd<AirportWinch>("tm_airport_pd_glider_winch", "Winch launch", (r) => {
        const at = r.lonLat("position");
        const winch = r.lonLat("winch");
        if (at === null || winch === null) return noPosition(r.label);
        const spacing = r.num("spacing", DEFAULT_WINCH_SPACING_M);
        return { id: newId(), name: r.str("name", ""), position: at, winch, spacing: spacing > 0 ? spacing : DEFAULT_WINCH_SPACING_M };
      });
      aerotows = eachAdd<AirportAerotow>("tm_airport_pd_glider_aerotow", "Aerotow", (r) => {
        const at = r.lonLat("position");
        if (at === null) return noPosition(r.label);
        return { id: newId(), name: r.str("name", ""), position: at, heading: norm360(r.num("direction", 0)) };
      });
    }
  }

  // Where the airport is, and where the map opens: its own point, else the middle of what it has.
  const anyPoint: LonLat[] = [
    ...(boundary ?? []),
    ...runways.flatMap((r) => r.ends.map((e) => e.threshold)),
    ...pads.map((x) => x.position),
    ...parkings.map((x) => x.position),
    ...objects.map((o) => o.position),
  ];
  const center = position ?? (anyPoint.length > 0 ? centroidOf(anyPoint) : undefined);
  if (center === undefined) throw new TapImportError("The TAP file has nothing with a position in it.");
  if (position === undefined) warnings.push("The airport has no model_center; its point is put in the middle of its parts.");

  const airport: ProjectAirport = { icao, name, country, pads, position: center };
  if (elevation !== undefined) airport.elevation = elevation;
  if (boundary !== undefined) airport.boundary = boundary;
  if (runways.length > 0) airport.runways = runways;
  if (parkings.length > 0) airport.parkings = parkings;
  if (tarmacs.length > 0) airport.tarmacs = tarmacs;
  if (lines.length > 0) airport.lines = lines;
  if (groundtexts.length > 0) airport.groundtexts = groundtexts;
  if (taxisigns.length > 0) airport.taxisigns = taxisigns;
  if (jetways.length > 0) airport.jetways = jetways;
  if (carlots.length > 0) airport.carlots = carlots;
  if (aerotows.length > 0) airport.aerotows = aerotows;
  if (winches.length > 0) airport.winches = winches;

  const project: Project = {
    schemaVersion: 1,
    app: "pct",
    name: name || icao.toUpperCase(),
    poiName: "",
    createdAt: now,
    modifiedAt: now,
    reference: null,
    camera: { lon: center.lon, lat: center.lat, zoom: 16 },
    objects,
    airport,
  };
  // The loader's own check: an import never produces a project PCT could not open again.
  return { project: parseProject(project), warnings };
}
