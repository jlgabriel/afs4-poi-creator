// heliportTemplate.ts — the `.tsc` / `.wad` pair that IS an Aerofly airport: what PCT writes into
// scenery/airports/<country>/ when you press "Export /airports…".
//
// The name is historical: this module once produced inert placeholder templates for a POI folder. Today
// every file it writes is one PCT installs itself, with an identity the user typed and PCT checked against
// the codes on this machine (a user `.tsc` whose `icao` collides with an installed airport silently
// replaces it). The filename stays to avoid churn.
//
// Format facts the writers depend on:
//   `coordinate_system` = `flat` · `uid` 0 is fine · `airports/<continent>/<country>/<name>/` works ·
//   `radius` is METRES (the sim shows the diameter as "Size") · `heading` is TRUE degrees (the sim
//   displays magnetic), so PCT's stored true heading goes in verbatim · the `objects` block is a
//   `list_tmsimulator_scenery_object`, the same spelling as the `.tsl`; it carries the plant anchor.
//   · the place's `autoheight` row MIRRORS the project's height mode, as in the `.tsl`: with the anchor
//   present, a place-level `autoheight=true` reaches the cultivation and turns point lights AGL.

import type { ApproachLightSystem, LonLat, PapiSide, ParkingType, ReilKind } from "../project/types";
import { tag, block, fmtLonLat, fmtNum, sanitizeValue } from "../tm/tmEmit";
import { lonToWad, latToWad, formatWad, headingToWadDirection } from "../geo/wad";
import { ANCHOR_GEOMETRY, type Anchor } from "./plantAnchor";

/** Longest `sname` PCT allows. The sim REJECTS THE WHOLE AIRPORT when the name is too long; its exact
 *  limit lies between 30 and 34, so 29 stays clear of it. */
export const SNAME_MAX = 29;

/** The identity a user types into "Create heliport…". PCT never invents any of it, but refuses a bad one
 *  (validateIdentity) and, at the write boundary, a code already present on the machine. */
export interface HeliportIdentity {
  icao: string; // 4-6 chars, lowercase [a-z0-9]
  name: string; // shown in LOCATION; <= SNAME_MAX
  country: string; // two lowercase letters — ALSO a path segment, so it is validated, not trusted
}

export type IdentityProblem =
  | "icao-format"
  | "name-empty"
  | "name-too-long"
  | "country-format";

const ICAO_RE = /^[a-z0-9]{4,6}$/;
const COUNTRY_RE = /^[a-z]{2}$/;

/** The single source of truth for "is this identity writable", used by the dialog for live feedback AND
 *  by main before it touches disk. Availability of the CODE is a separate, machine-dependent question —
 *  see main/icaoIndex.ts — because it cannot be answered from the string alone.
 *
 *  `country` gets the strictest rule of the three and it is not cosmetic: it becomes a directory name
 *  under scenery/airports/, so anything but two letters is a path-traversal question, not a typo. */
export function validateIdentity(id: HeliportIdentity): IdentityProblem | null {
  if (!ICAO_RE.test(id.icao)) return "icao-format";
  const name = sanitizeValue(id.name).trim();
  if (name.length === 0) return "name-empty";
  if (name.length > SNAME_MAX) return "name-too-long";
  if (!COUNTRY_RE.test(id.country)) return "country-format";
  return null;
}

/** The folder an installed heliport gets under `scenery/airports/<country>/`, derived from the identity
 *  the user just typed: `<code>_<name>`, the usual convention under scenery/airports/.
 *
 *  It deliberately does NOT reuse the POI's folder name: that carries a coordinate prefix meaningless in
 *  an airports tree, and it needs `project.poiName`, which a fresh project does not have (an unnamed
 *  project would yield an invalid name like `w07055s3345_`). The identity is validated before we get
 *  here, so this is always a safe name (see isSafeAirportFolderName). */
export function heliportFolderName(id: HeliportIdentity): string {
  const slug = sanitizeValue(id.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return slug === "" ? id.icao : `${id.icao}_${slug}`;
}

/** True if `name` is a safe folder to create or delete inside `scenery/airports/<country>/`. Deliberately
 *  simpler than the POI rule (which also pins the coordinate prefix): no dots at all, so no `..`, and no
 *  separators — while still accepting a folder written by an earlier build, whose name was the POI slug. */
export function isSafeAirportFolderName(name: string): boolean {
  return /^[a-z0-9_]{1,80}$/.test(name);
}

/** English, user-facing, one line — the dialog shows it and main returns it. */
export function identityProblemText(p: IdentityProblem): string {
  switch (p) {
    case "icao-format":
      return "The airport code must be 4 to 6 letters or digits.";
    case "name-empty":
      return "Enter a name for the heliport.";
    case "name-too-long":
      return `The name must be ${SNAME_MAX} characters or fewer — Aerofly drops the whole airport above its limit.`;
    case "country-format":
      return "The country code must be exactly two letters (us, de, cl…).";
  }
}

/** Everything the two files need, all of it already resolved by planExport (positions SHIFTED, height
 *  resolved) so this module is pure formatting. */
/** One helipad as the two writers want it. Positions are already shifted with the scene. */
export interface HeliportPadSpec {
  /** Shown in LOCATION. EMPTY → "FATO/TLOF", the literal older versions always wrote, so a project
   *  that predates named pads keeps producing the same bytes. */
  name: string;
  /** Pad centre, degrees. */
  position: LonLat;
  /** TRUE compass degrees. Written verbatim: the sim's `heading` field is true. */
  headingDeg: number;
  /** Pad radius in METRES (the sim shows the diameter as "Size"). */
  radiusM: number;
}

/** One runway end as the two writers want it. Both points already shifted with the scene. */
export interface HeliportRunwayEndSpec {
  /** Where the pavement stops. The FILE keeps this separate from the threshold (a displaced threshold
   *  differs), but the PROJECT model carries one point and planExport copies it into both (types.ts
   *  AirportRunwayEnd). Kept apart here so the writer describes the format truthfully, and so the
   *  displaced case stays testable. */
  endpoint: LonLat;
  threshold: LonLat;
  identifier: string;
  appltsys: ApproachLightSystem;
  papi: PapiSide;
  reil: ReilKind;
  approach: boolean;
  takeoff: boolean;
}

/** A runway: the pair, plus the width they share. */
export interface HeliportRunwaySpec {
  ends: [HeliportRunwayEndSpec, HeliportRunwayEndSpec];
  widthM: number;
}

/** A glider AEROTOW start, `.wad`-only. Position already shifted with the scene. */
export interface HeliportAerotowSpec {
  name: string;
  position: LonLat;
  /** TRUE compass degrees; converted to radians here, like every other heading. */
  headingDeg: number;
}

/** A glider WINCH LAUNCH start, `.wad`-only. TWO points and no heading — the direction and
 *  the rope length are whatever the pair says. */
export interface HeliportWinchSpec {
  name: string;
  /** Where the glider stands. */
  position: LonLat;
  /** Where the winch stands, at the far end of the rope. */
  winch: LonLat;
  /** Metres between two side-by-side gliders. */
  spacingM: number;
}

/** One parking position as the two writers want it. Position already shifted with the scene, like a pad's.
 *
 *  `type` is the `tags` literal, passed through untouched — see types.ts ParkingType for why the spelling
 *  is `parked_` and why a wrong one is undetectable in-sim. */
export interface HeliportParkingSpec {
  /** Shown in LOCATION. EMPTY → "Parking" (see DEFAULT_PARKING_NAME). */
  name: string;
  position: LonLat;
  /** TRUE compass degrees, written verbatim into the `.tsc` — negative values are valid there. */
  headingDeg: number;
  /** Stand radius in metres (the sim shows the diameter). */
  sizeM: number;
  type: ParkingType;
}

export interface HeliportSpec {
  /** The AIRPORT's own point, degrees — the place's `position` and the `.wad`'s projected one.
   *
   *  ⚠️ NOT a pad. Older projects had no separate airport point; planExport falls back to the first pad
   *  when the project has not set one, so nothing moves for those. */
  position: LonLat;
  /** Every helipad. May be EMPTY — an airport with no pads is valid, and the sim accepts an empty
   *  `helipads` list. */
  pads: HeliportPadSpec[];
  /** Every runway. Absent ≡ empty; the block is written either way. */
  runways?: HeliportRunwaySpec[];
  /** Glider starts. Both exist only in the `.wad` — `buildHeliportTsc` ignores them by design. */
  aerotows?: HeliportAerotowSpec[];
  winches?: HeliportWinchSpec[];
  /** Every parking position. Absent ≡ empty; the block is written either way — every airport file PCT
   *  writes carries the full row set, defaults included. */
  parkings?: HeliportParkingSpec[];
  // No `iata`: the `.wad` row it would fill is not a member of `tmworld_airport_detailed`.
  /** The POI's cultivation basename ("poi"), or null for an empty POI — then no cultivation is referenced. */
  cultivationFileName: string | null;
  /** The plant anchor, when the POI carries one — it must be repeated here, because the `.tsc` REPLACES
   *  the `poi.tsl` as the entry point and the anchor lives in the .tsl. Null → no objects block. */
  anchor: Anchor | null;
  /** The project's height mode, mirrored onto the cultivation reference. */
  autoheight: boolean;
  /** The airport PCT is about to install. Required: PCT only writes airports it installs itself. */
  identity: HeliportIdentity;
}

/** The three identity values as they go into the files.
 *
 *  ★ THE CODE GOES IN CAPITALS, the disk stays lowercase: the icao/identifier rows in BOTH files must be
 *  upper-case for FS 4 to display the airport correctly, while file and folder names stay lowercase, as
 *  does `country`. The sim matches codes case-insensitively (icaoIndex relies on that), so case affects
 *  display only. */
function identityValues(spec: HeliportSpec): { icao: string; name: string; country: string } {
  const id = spec.identity;
  return { icao: id.icao.toUpperCase(), name: sanitizeValue(id.name).trim(), country: id.country };
}

/** The `// Informations:` banner, sitting just INSIDE the place block (nothing may precede the root
 *  `<[file]`, see NO_HEADER). Standalone `//` lines and blank lines inside a block are valid in the sim's
 *  text format. A block banner rather than trailing per-tag comments, for two reasons:
 *
 *    • TABS. Use spaces, never TAB characters, in these files — nothing here emits one.
 *    • WIDTH. A long line whose first 40 characters are the value is unreadable in a text editor. */
function informationsBanner(): string[] {
  return [
    "",
    "//  Informations:",
    `//  [sname]:    the name shown in LOCATION. MAX ${SNAME_MAX} CHARACTERS - longer and the sim`,
    "//              drops the whole airport",
    "//  [lname]:    long name; keep it the same unless you have a reason",
    `//  [icao]:     4-6 characters, IN CAPITALS here - FS 4 displays the airport by this row. It`,
    "//              MUST NOT already exist on the machine that installs this - a repeat silently",
    "//              REPLACES that airport. The file and folder names stay lowercase",
    "//  [country]:  two letters, lowercase (the 2-digit internet country code is recommended)",
    "//  [position]: lon lat in degrees - written by PCT",
    "//  [filename]: the POI's own poi.toc, right beside this file",
    "//  [radius]:   maximum rotor radius in metres - the sim shows the DIAMETER as \"Size\"",
    "//  [heading]:  TRUE heading in degrees, the sim displays magnetic, so expect this minus",
    "//              the local variation",
    "",
    "//  Every other row below is a DEFAULT that Aerofly expects to find and PCT does not ask you",
    "//  about. Leave them as they are unless you know the format.",
    "",
  ];
}

/** What an unnamed pad is called in the files: the aviation term for the two circles a helipad is made
 *  of — Final Approach and Take-Off area, Touchdown and Lift-Off area. Older versions hard-coded this
 *  string for their single pad; keeping it as the empty-name fallback makes such a project export
 *  byte-for-byte what it exported before. */
const DEFAULT_PAD_NAME = "FATO/TLOF";

function padName(p: HeliportPadSpec): string {
  const n = sanitizeValue(p.name).trim();
  return n === "" ? DEFAULT_PAD_NAME : n;
}

/** What an unnamed STAND is called. Unlike the pad's "FATO/TLOF" this preserves no legacy bytes — it
 *  exists because the row is what LOCATION displays, and an empty one puts a blank entry in the sim's
 *  menu. */
const DEFAULT_PARKING_NAME = "Parking";

function parkingName(p: HeliportParkingSpec): string {
  const n = sanitizeValue(p.name).trim();
  return n === "" ? DEFAULT_PARKING_NAME : n;
}

/** Defaults for the four PAPI rows PCT does not (yet) expose: 3° glide slope, 6 m spacing, no custom
 *  position. Written rather than omitted on purpose — the rows are optional, but an explicit default is
 *  visible in the file instead of implied. */
const PAPI_GLIDE_SLOPE_DEG = 3;
const PAPI_SPACING_M = 6;

/** The `.tsc`'s `runways` list, EMPTY OR NOT (every airport file carries the full row set).
 *
 *  One element per PAIR, with every field suffixed `1`/`2` — that is the shape, not a convenience: the
 *  format has no single-ended runway. */
function runwayTscBlock(runways: HeliportRunwaySpec[]): string[] {
  const deg = (p: LonLat): string => `${fmtLonLat(p.lon)} ${fmtLonLat(p.lat)}`;
  const elements = runways.flatMap((r, i) => {
    const [a, b] = r.ends;
    // Both ends get the same four rows; nothing per-end feeds them yet, hence the index-only map.
    // Grouped by FIELD (papi1_x, papi2_x, then the next field) — the conventional order; the sim's
    // parser is name-keyed and does not care.
    const papiRows = [
      ["bool", "has_custom_position", "false"],
      ["vector2_float64", "custom_position", "0 0"],
      ["float64", "glide_slope", fmtNum(PAPI_GLIDE_SLOPE_DEG)],
      ["float64", "spacing", fmtNum(PAPI_SPACING_M)],
    ].flatMap(([type, field, value]) => [
      tag(type!, `papi1_${field}`, value!),
      tag(type!, `papi2_${field}`, value!),
    ]);
    return block("tmsimulator_runway", "element", String(i), [
      tag("vector2_float64", "endpoint1", deg(a.endpoint)),
      tag("vector2_float64", "endpoint2", deg(b.endpoint)),
      tag("vector2_float64", "threshold1", deg(a.threshold)),
      tag("vector2_float64", "threshold2", deg(b.threshold)),
      tag("float64", "width", fmtNum(r.widthM)),
      tag("string8u", "name1", sanitizeValue(a.identifier).trim()),
      tag("string8u", "name2", sanitizeValue(b.identifier).trim()),
      tag("string8u", "appltsys1", a.appltsys),
      tag("string8u", "appltsys2", b.appltsys),
      tag("string8u", "papi1", a.papi),
      tag("string8u", "papi2", b.papi),
      ...papiRows,
      tag("string8u", "reil1", a.reil),
      tag("string8u", "reil2", b.reil),
    ]);
  });
  return block("list_tmsimulator_runway", "runways", "", elements);
}

/** The four runway-end flags a `.wad` carries after `takeoff`, on every end. PCT offers nothing for
 *  them yet, so they are fixed defaults. */
const RUNWAY_END_WAD_DEFAULTS: ReadonlyArray<readonly [string, string]> = [
  ["navigation", "true"],
  ["departures", "true"],
  ["non_precision", "false"],
  ["precision", "false"],
];

/** The `.wad`'s `runway_pairs`, empty or not.
 *
 *  A level deeper than the `.tsc`'s: the pair holds an ARRAY of exactly two ends, and the shared `width`
 *  sits beside it rather than inside. This is the half the navigation menu reads — `approach` and
 *  `takeoff` live only here, and `elevation` is currently unused by FS4. */
function runwayWadBlock(runways: HeliportRunwaySpec[]): string[] {
  const wad = (p: LonLat): string => `${formatWad(lonToWad(p.lon))} ${formatWad(latToWad(p.lat))}`;
  const elements = runways.flatMap((r, i) => {
    const ends = r.ends.flatMap((e, n) =>
      block("tmworld_airport_detailed_rwy", "element", String(n), [
        tag("vector2_float64", "endpoint", wad(e.endpoint)),
        tag("vector2_float64", "threshold", wad(e.threshold)),
        tag("string8u", "identifier", sanitizeValue(e.identifier).trim()),
        tag("string8u", "appltsys", e.appltsys),
        tag("float64", "elevation", "0"),
        // The row is `landing`, not `approach`. The PROJECT keeps calling it `approach` — renaming a
        // project.json key would strand every file already saved — so only the row name differs.
        tag("bool", "landing", e.approach ? "true" : "false"),
        tag("bool", "takeoff", e.takeoff ? "true" : "false"),
        // DEFAULT rows, see RUNWAY_END_WAD_DEFAULTS.
        ...RUNWAY_END_WAD_DEFAULTS.map(([field, value]) => tag("bool", field, value)),
      ]),
    );
    return block("tmworld_airport_detailed_rwy_pair", "element", String(i), [
      ...block("array_tmworld_airport_detailed_rwy", "runway_pair", "", ends),
      tag("float64", "width", fmtNum(r.widthM)),
    ]);
  });
  return block("list_tmworld_airport_detailed_rwy_pair", "runway_pairs", "", elements);
}

/** The two glider-start lists, `.wad`-only, empty or not.
 *
 *  ★ The WINCH is the only element PCT writes that has no heading of its own: `position` is the glider and
 *  `winch` is the far end of the rope; rope length and direction follow from the two positions.
 *  The AEROTOW does carry one, and it goes through the same radian conversion as a pad's.
 *
 *  The aerotow's `waypoints` row is written as an empty list (its default). PCT offers nothing for it,
 *  but the row is written anyway, like every other default row. */
function gliderBlocks(aerotows: HeliportAerotowSpec[], winches: HeliportWinchSpec[]): string[] {
  const wad = (p: LonLat): string => `${formatWad(lonToWad(p.lon))} ${formatWad(latToWad(p.lat))}`;
  const out: string[] = [];
  {
    const elements = winches.flatMap((w, i) =>
      block("tmworld_airport_detailed_glider_winch", "element", String(i), [
        tag("string8", "name", sanitizeValue(w.name).trim()),
        tag("vector2_float64", "position", wad(w.position)),
        tag("vector2_float64", "winch", wad(w.winch)),
        tag("float64", "spacing", fmtNum(w.spacingM)),
      ]),
    );
    out.push(
      ...block("list_tmworld_airport_detailed_glider_winch", "glider_winches", "", elements),
    );
  }
  {
    const elements = aerotows.flatMap((a, i) =>
      block("tmworld_airport_detailed_glider_aerotow", "element", String(i), [
        tag("string8", "name", sanitizeValue(a.name).trim()),
        tag("vector2_float64", "position", wad(a.position)),
        tag("float64", "direction", formatWad(headingToWadDirection(a.headingDeg))),
        // An empty LIST as a single line.
        tag("list_vector2_float64", "waypoints", ""),
      ]),
    );
    out.push(
      ...block("list_tmworld_airport_detailed_glider_aerotow", "glider_aerotows", "", elements),
    );
  }
  return out;
}

/** The `parking_positions` list, EMPTY OR NOT (every airport file carries the full row set).
 *
 *  The two files differ only in the element type and in the two converted fields, so they share this: the
 *  `.tsc` keeps degrees and a `heading` in degrees, the `.wad` gets the projected grid and a `direction` in
 *  radians. Field ORDER (position, heading/direction, size, name, tags) is the conventional one; the sim's
 *  parser is name-keyed and does not care. */
function parkingBlock(parkings: HeliportParkingSpec[], wad: boolean): string[] {
  const elementType = wad ? "tmworld_airport_detailed_parking_position" : "tmsimulator_parking_position";
  const listType = wad
    ? "list_tmworld_airport_detailed_parking_position"
    : "list_tmsimulator_parking_position";
  const elements = parkings.flatMap((p, i) =>
    block(elementType, "element", String(i), [
      tag(
        "vector2_float64",
        "position",
        wad
          ? `${formatWad(lonToWad(p.position.lon))} ${formatWad(latToWad(p.position.lat))}`
          : `${fmtLonLat(p.position.lon)} ${fmtLonLat(p.position.lat)}`,
      ),
      wad
        ? tag("float64", "direction", formatWad(headingToWadDirection(p.headingDeg)))
        : tag("float64", "heading", fmtNum(p.headingDeg)),
      tag("float64", "size", fmtNum(p.sizeM)),
      tag("string8", "name", parkingName(p)),
      // `string8u`, not `string8` — the same string type as `icao` and `coordinate_system`.
      tag("string8u", "tags", p.type),
    ]),
  );
  return block(listType, "parking_positions", "", elements);
}

/** `<icao>.tsc` — the place: identity, the functional pads, and the pointer to the POI's own `poi.toc`. */
export function buildHeliportTsc(spec: HeliportSpec): string {
  const pos = `${fmtLonLat(spec.position.lon)} ${fmtLonLat(spec.position.lat)}`;
  const v = identityValues(spec);
  // `icao` AFTER the two names, the conventional row order. The sim's parser is name-keyed, so order is
  // cosmetic; every field is described in the banner above.
  const body: string[] = [
    ...informationsBanner(),
    tag("string8", "sname", v.name),
    tag("string8", "lname", v.name),
    tag("string8u", "icao", v.icao),
    tag("string8u", "country", v.country),
    tag("string8u", "coordinate_system", "flat"),
    tag("vector2_float64", "position", pos),
    // ── The DEFAULT rows ────────────────────────────────────────────────────────────────────────────
    // PCT writes every row, even those it offers no field for, using the format's default values.
    tag("float64", "height", "0"),
    tag("vector2_float64", "tower_position", "0 0"),
    // Mirrors the project's height mode, never a fixed `true`: with the anchor present, `true` reaches the
    // cultivation and a baked-ASL project's point lights are then read AGL (they float). Same rule as the
    // `.tsl` (tslWriter.ts).
    tag("bool", "autoheight", spec.autoheight ? "true" : "false"),
    tag("string8u", "autoheight_method", ""),
    tag("string8u", "geometry", ""),
  ];

  const pads = spec.pads.flatMap((p, i) =>
    block("tmsimulator_helipad", "element", String(i), [
      tag("string8", "name", padName(p)),
      // DEFAULT rows. `type_name` is a pad TYPE we do not offer and `height` is the pad's own
      // elevation, which PCT leaves to the terrain — both empty/zero.
      tag("string8u", "type_name", ""),
      tag("vector2_float64", "position", `${fmtLonLat(p.position.lon)} ${fmtLonLat(p.position.lat)}`),
      tag("float64", "radius", fmtNum(p.radiusM)),
      tag("float64", "heading", fmtNum(p.headingDeg)),
      tag("float64", "height", "0"),
    ]),
  );
  // Exactly one `objects` list: the anchor when the POI carries one, otherwise empty.
  body.push(...block("list_tmsimulator_scenery_object", "objects", "", spec.anchor ? anchorObject(spec.anchor) : []));
  body.push(...block("list_tmsimulator_scenery_object_animated", "objects_animated", "", []));

  // Runways BEFORE helipads, then: start_positions, parking, cultivation.
  body.push(...runwayTscBlock(spec.runways ?? []));
  body.push(...block("list_tmsimulator_helipad", "helipads", "", pads));
  body.push(...block("list_tmsimulator_startposition", "start_positions", "", []));
  body.push(...parkingBlock(spec.parkings ?? [], false));

  // The LIST is always written; the ELEMENT only when the POI has a `.toc` to point at. An empty POI gets
  // the `cultivation_files` DEFAULT — an empty list — rather than an element naming a file that is not
  // there, which is the one thing worse than no line at all.
  const cultivation =
    spec.cultivationFileName === null
      ? []
      : block("tmsimulator_scenery_cultivation", "element", "0", [
          tag("string8", "filename", spec.cultivationFileName),
          tag("bool", "auto_height", spec.autoheight ? "true" : "false"),
          tag("bool", "use_height_offset", "true"),
        ]);
  body.push(...block("list_tmsimulator_scenery_cultivation", "cultivation_files", "", cultivation));

  const place = block("tmsimulator_scenery_place", "", "", body);
  return tidy([...NO_HEADER, ...block("file", "", "", place)]);
}

/** Join the lines and strip trailing spaces. `block` indents EVERY line it is given, including the empty
 *  ones framing the banner — which would otherwise ship as eight spaces of invisible whitespace. Applied
 *  only here, never in `block` itself: the `.tsl`/`.toc` byte-goldens depend on that helper unchanged. */
function tidy(lines: string[]): string {
  return lines.join("\n").replace(/[ \t]+$/gm, "") + "\n";
}

/** The `.wad`'s own banner. Same reasoning as the `.tsc`'s (spaces, not TABs; a block rather than
 *  trailing comments) — and the two files are read side by side, so they should read alike. The one
 *  thing worth saying twice is the position: it is the field a reader will assume is degrees. */
const WAD_BANNER: string[] = [
  "",
  "//  Informations:",
  "//  [identifier]: the SAME code as the .tsc's [icao], IN CAPITALS - or the database entry",
  "//                and the place do not meet. The file name stays lowercase",
  "//  [position]:   FS4 grid units (0-65536), NOT degrees - written by PCT",
  "//  [radius]:     metres, as in the .tsc",
  "//  [direction]:  RADIANS here, not degrees - written by PCT",
  "",
];

/** `<icao>.wad` — the entry in FS4's world airport database: what puts the heliport on the map, in
 *  the flight planner and in "nearest". Its coordinates are NOT degrees; they are the projected 0–65536
 *  grid (core/geo/wad.ts), which is the tedious part PCT is here to do. */
export function buildHeliportWad(spec: HeliportSpec): string {
  const pos = `${formatWad(lonToWad(spec.position.lon))} ${formatWad(latToWad(spec.position.lat))}`;
  const pads = spec.pads.flatMap((p, i) =>
    block("tmworld_airport_detailed_helipad", "element", String(i), [
      tag("string8", "name", padName(p)),
      tag("string8u", "type_name", ""),
      tag(
        "vector2_float64",
        "position",
        `${formatWad(lonToWad(p.position.lon))} ${formatWad(latToWad(p.position.lat))}`,
      ),
      tag("float64", "radius", fmtNum(p.radiusM)),
      // The .wad stores the same rotation as the .toc, in RADIANS — hence the trip through headingToDirection.
      tag("float64", "direction", formatWad(headingToWadDirection(p.headingDeg))),
      tag("float64", "height", "0"),
    ]),
  );
  const v = identityValues(spec);
  // ★ The code row is `identifier`, not `icao`. `uid`, `icao`, `iata`, `name`, `country`, `tags`,
  // `priority`, `connections` and `time_zone` are NOT members of `tmworld_airport_detailed` (they belong
  // to the airport base list) and must not be written here. The name and country still reach the sim:
  // they live in the `.tsc`.
  const body = [
    ...WAD_BANNER,
    tag("stringt8c", "identifier", v.icao),
    tag("float32", "elevation", "0"),
    tag("vector2_float64", "position", pos),
    // The grid centre: the default when no tower is placed.
    tag("vector2_float64", "tower_position", "32768 32768"),
    ...runwayWadBlock(spec.runways ?? []),
    ...block("list_tmworld_airport_detailed_helipad", "helipads", "", pads),
    // Winches then aerotows then parking — the conventional `.wad` order.
    ...gliderBlocks(spec.aerotows ?? [], spec.winches ?? []),
    ...parkingBlock(spec.parkings ?? [], true),
  ];
  const airport = block("tmworld_airport_detailed", "", "", body);
  return tidy([...NO_HEADER, ...block("file", "", "", airport)]);
}

/** The anchor object, repeated from the `.tsl` because the `.tsc` replaces it as the entry point. Written
 *  with an ABSOLUTE height. */
function anchorObject(anchor: Anchor): string[] {
  const children = [
    tag("string8", "type", "object"),
    tag("string8", "geometry", ANCHOR_GEOMETRY),
    tag(
      "tmvector3d",
      "position",
      `${fmtLonLat(anchor.position.lon)} ${fmtLonLat(anchor.position.lat)} ${anchor.heightAsl.toFixed(2)}`,
    ),
  ];
  return block("tmsimulator_scenery_object", "element", "0", children);
}

/** ★ NOTHING may precede the root `<[file]` tag — not even `//` comments. The sim rejects the WHOLE
 *  file, and the airport half-appears (its `.wad` loaded, but there is no place) and cannot be flown.
 *  Comments INSIDE the root, and trailing `//` comments on a tag line, are fine.
 *
 *  So the human instructions live in README.txt and these files start on `<[file][][]`. (PCT's own
 *  tmParser tolerates a leading banner — that is not permission: the sim's parser does not.) */
const NO_HEADER: string[] = [];

/** Marker in an installed heliport's README.txt. Same trick as POI_README_MARKER: it is what makes a
 *  folder under scenery/airports/ safe to offer for Uninstall — PCT removes only what PCT wrote. */
export const HELIPORT_README_MARKER = "Installed by PCT (POI Creation Tool) - heliport";

/** README.txt for an INSTALLED heliport. */
export function heliportInstalledReadme(id: HeliportIdentity, projectName: string): string {
  return [
    `${sanitizeValue(projectName).trim()} - heliport ${id.icao.toUpperCase()}`,
    HELIPORT_README_MARKER,
    "",
    "Restart Aerofly after installing - airports are read once, at startup.",
    "",
    `Then open LOCATION and search for "${sanitizeValue(id.name).trim()}" - by NAME. The search does`,
    "not match the airport code, and for a code you invented the row it finds may render blank. The",
    "airport is real all the same - it shows correctly on the map, where you built it, and it flies.",
    "",
    "This folder holds the airport itself; the objects come from the poi.toc beside it, which is",
    "the same cultivation the POI export writes.",
    "",
    "About the airport code: if two airports on one machine share a code, ONE of them wins and the",
    `other vanishes without a message. "${id.icao.toUpperCase()}" was checked against every`,
    "airport installed on this machine at the moment this was written. That check cannot speak for",
    "anyone else's machine - if you pass this folder on, the code has to be free there too.",
    "",
    "To remove it: PCT's Export /airports dialog lists what it wrote, with an Uninstall button,",
    "or just delete this folder. Nothing outside it was touched.",
    "",
  ].join("\n");
}
