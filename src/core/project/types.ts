// Shared, framework-agnostic types for PCT's pure core.
// Geometry primitives + the scanned object catalog (M0), plus the editable Project, the
// export plan, and Settings (design §2.2–§2.4 / §3.4) — the M1 data model.

import type { GroundTextBackground, GroundTextColor, GroundTextPointing, TaxisignElementType } from "./marks";

export type Vec3 = [number, number, number];

export interface LonLat {
  lon: number;
  lat: number;
}

/** One built-in object, scanned from a `.tmi` index. `name` is the exact xref id written
 *  verbatim into a POI `.toc`. Bounding box is model-local metres, z up. */
export interface CatalogObject {
  name: string;
  bundle: string; // storage taxonomy: the .tmi it came from, e.g. "xref_buildings"
  source: "install" | "user";
  bbMin: Vec3; // model-local metres (x, y, z); z up
  bbMax: Vec3;
  bsRadius: number; // bounding-sphere radius, metres
  size: { x: number; y: number; z: number }; // bbMax - bbMin, rounded to 0.01 m
  category: string; // display taxonomy path, e.g. "buildings/tower"
  displayName: string; // derived pretty label, e.g. "Tower00 Small Plates"
  act: boolean; // true = present in the curated category table
  // ── Optional overlay from an `xref_table.csv` object table (built but disabled; see xrefTable.ts).
  //    Present ONLY on an install-source object whose name matched a table row. All optional → the cache
  //    stays schemaVersion 1 and a scan with no table (the shipping default) is unchanged. `displayName`
  //    above is the table's label on a match. ──
  official?: true; // provenance: displayName + taxonomy are the table's, not the heuristic
  taxonomy?: { main: string; sub: string; type: string }; // 3-level taxonomy, e.g. Aircraft/Airliner/A320
  footprint?: [number, number][]; // real footprint polygon, model-local metres (x, y) — for glyphs
  // ── Optional user-XREF registration state (design B2). Set on objects derived from a LOOSE user `.tmb`
  //    (one dropped in scenery/xref that isn't yet resolvable from a POI — it needs a generated `.tmi` in
  //    its own subfolder). Absent on every built-in and every already-bundled object. ──
  unregistered?: true; // from a loose user `.tmb` not yet registered → surfaced for registration, not placement
  sizeUnknown?: true; // an OPAQUE (compiled) `.tmb`: filename only, no derivable bbox/footprint
  footprintSource?: "user"; // v0.9: bbMin/bbMax/size came from the user's own measurement, not the scan
}

/** One scanned `.tmi` bundle. */
export interface BundleInfo {
  bundle: string; // filename from tmxglscene_info, e.g. "xref_buildings"
  source: "install" | "user";
  path: string; // absolute path of the .tmi
  count: number; // entries parsed
}

/** One airport-light fixture, enumerated from the install's `airport_lights` folder (v0.2). Unlike
 *  CatalogObject there is NO `.tmi` and NO bounding box — these are point light fixtures, not
 *  footprint objects. `typeName` is the exact string8u written into a POI `.toc` (the `.tmb`
 *  basename minus the `al_` prefix). PCT never opens the `.tmb` (opaque binary); the "scan"
 *  is pure name derivation, so it ships zero proprietary bytes. */
export interface CatalogAirportLight extends UserFootprint {
  typeName: string; // ".tmb basename minus al_", e.g. "runway_edge_light" — the .toc type_name
  folder: string; // provenance: the al_<type> folder it came from, e.g. "al_runway_edge_light"
  source: "install";
  category: string; // display taxonomy path, e.g. "lights/runway"
  displayName: string; // derived pretty label, e.g. "Runway Edge Light"
}

/** A bounding box PCT could not scan and the user measured by hand (airport lights and plants have no
 *  `.tmi` and therefore no bbox, so they otherwise draw as bare points on the map). The user types width × depth × height into the card's right-click menu; it is stored in
 *  their OWN `footprints.json` (userData, outside the catalog cache, so a Rescan never wipes it) and
 *  applied over the scan at load — see core/catalog/footprints.
 *
 *  All optional, so the catalog cache stays schemaVersion 1 and a user with no overrides gets byte-identical
 *  data. `bbMin`/`bbMax` are model-local metres, z up — the same frame the scanned XREF boxes use, which is
 *  what lets one map layer draw both. ABSENT ≡ "this family has no footprint", which stays the default for
 *  every light and plant: PCT ships none of these numbers, it only reads the ones the user has. */
export interface UserFootprint {
  bbMin?: Vec3;
  bbMax?: Vec3;
  size?: { x: number; y: number; z: number };
  footprintSource?: "user";
}

/** One plant texture, enumerated from the install's `scenery/plants` folder (v0.4). Like
 *  CatalogAirportLight there is NO `.tmi` and NO bounding box — but here there is no MESH either:
 *  the install's plant files are `.ttx` textures, so the sim draws a plant from its texture alone and
 *  the "scan" is pure name derivation (`broadleaf__i00__h1750_color.ttx`). `group` + `species` are the
 *  exact strings a POI `.toc` writes; see core/catalog/plants.ts. */
export interface CatalogPlant extends UserFootprint {
  group: string; // the .toc `group`, e.g. "conifer_forest" — verbatim from the filename
  species: string; // the .toc `species`, e.g. "00" — 2 zero-padded digits, verbatim
  naturalHeight: number; // metres, decoded from the filename's [h]#### (h1750 → 17.5; when the `h`
  // is missing the digits still read as centimetres)
  source: "install";
  category: string; // display taxonomy path, e.g. "plants/broadleaf"
  displayName: string; // derived pretty label, e.g. "Broadleaf 00"
}

/** The scanned catalog cache. Written to Electron userData at runtime; never committed. */
export interface Catalog {
  schemaVersion: 1;
  scannedAt: string; // ISO 8601
  installDir: string;
  userXrefDir: string | null;
  bundles: BundleInfo[];
  xref: CatalogObject[];
  xrefTable?: { rows: number; matched: number }; // present only when an xref_table overlay was applied
  plants: CatalogPlant[]; // v0.4 — scanned from scenery/plants/ (empty on a pre-v0.4 cache)
  airportLights: CatalogAirportLight[]; // v0.2 — scanned from airport_lights/ (empty on a pre-v0.2 cache)
  animated: []; // reserved
}

// ── The editable project model (design §2.2) ────────────────────────────────

/** How a placed object's vertical position is determined. POI xref heights are absolute
 *  metres ASL, so "terrain" modes resolve to an ASL value at export time; only "asl" is a
 *  literal already. */
export type HeightSpec =
  | { mode: "terrain" } // DEFAULT — resolve to terrain ASL at export
  | { mode: "terrain-offset"; offset: number } // terrain + N metres (rooftop items)
  | { mode: "asl"; value: number }; // absolute metres ASL, user-entered

/** Fields shared by every placed object, whatever its kind. Portable: coordinates + a HeightSpec
 *  only, no assets, no absolute paths. The `kind`-specific interfaces below extend this. */
export interface PlacedBase {
  id: string; // uuid v4
  position: LonLat;
  height: HeightSpec;
  label?: string; // optional user note
  locked?: boolean; // optional: ignore drags (dense-scene safety)
}

/** One placed built-in object in a project. `name` survives even if the opener's catalog lacks it. */
export interface PlacedXref extends PlacedBase {
  kind: "xref"; // discriminator
  name: string; // exact catalog name — the value written to the .toc
  direction: number; // degrees, clockwise positive, [0, 360) (spec: negative = CCW)
  scale: number; // uniform scale_factor, > 0, default 1
}

/** One placed airport-light fixture (v0.2). Placed BY NAME like an xref, plus a colour + orientation.
 *  Emitted into the POI `.toc` `list_airport_light`. Height is absolute metres ASL, same rule as xref. */
export interface PlacedAirportLight extends PlacedBase {
  kind: "airport_light"; // discriminator; mirrors the .toc element tag
  typeName: string; // CatalogAirportLight.typeName — the .toc type_name (no "al_")
  orientation: number; // degrees the light is illuminated toward
  configuration: string; // colour letters, 0–2 of [bgrwy]; "" = the fixture's own default colour
  groupIndex: number; // night-visibility group (0 = ±40 min around night … 3 = 24 h)
}

/** One placed generic parametric point light (v0.2). No catalog — fully described by its parameters.
 *  Emitted into the POI `.toc` `list_light`. Height is absolute metres ASL. */
export interface PlacedLight extends PlacedBase {
  kind: "light"; // discriminator
  color: Vec3; // RGB, each channel 0..1 (the 8 corners: 000 black … 111 white)
  intensity: number; // 0 = out … 100000 = big
  flashing: [number, number, number, number]; // [A B C D]: A cycle, B sequence, C flash-length, D unused (0)
  groupIndex: number; // night-visibility group
}

/** One placed plant (v0.4). Placed BY NAME like an xref, but the name is a `group` + `species` PAIR
 *  rather than one id. Emitted into the POI `.toc` `list_plant`.
 *
 *  Two fields the other kinds have are deliberately ABSENT, because the plant element has neither:
 *  no `direction` (a plant is a billboard — it turns to face the camera, so a heading has nothing to
 *  act on) and no `scale` (`heightRange` is the size control).
 *
 *  `height` (→ the `.toc` `altitude`) is a field of its OWN (float32, beside a 2-value lon/lat
 *  `position`) rather than the third slot of `position`. It is treated as metres ASL like every other
 *  kind, so the HeightSpec pipeline applies unchanged; were it AGL, the change would be confined to
 *  how heights resolve, not to this model. */
export interface PlacedPlant extends PlacedBase {
  kind: "plant"; // discriminator; mirrors the .toc element tag
  group: string; // CatalogPlant.group — the .toc `group`, e.g. "broadleaf"
  species: string; // CatalogPlant.species — the .toc `species`, e.g. "00"
  heightRange: [number, number]; // metres, [MIN MAX] "growth height"; [0, 0] = the texture's own height
}

/** Any placed object, discriminated on `kind`. (Project.objects widens to this when the v0.2 lights
 *  UI lands; the format/scanner plumbing below is built and golden-tested first.) */
export type PlacedObject = PlacedXref | PlacedAirportLight | PlacedLight | PlacedPlant;

/** Global horizontal shift applied to EVERY object at export time: nudge each position `east`
 *  metres east and `north` metres north (either can be negative). Corrects a systematic offset
 *  between the map base (Esri/OSM) and FS4's own satellite tiles. Distinct from the per-object
 *  vertical HeightSpec "offset". */
export interface PoiShift {
  east: number; // metres, + = east
  north: number; // metres, + = north
}

/** How a project's heights are turned into the export (a per-PROJECT property, not a fourth HeightSpec —
 *  the flag flips the z-semantics of the WHOLE cultivation, so a mixed cultivation can't exist).
 *  `absent ≡ "baked-asl"`.
 *
 *  • "baked-asl"  — the shipping default: each object's HeightSpec resolves to an absolute ASL number
 *    (Open-Meteo for terrain modes), written verbatim into the `.toc`; the place stays autoheight=false.
 *  • "autoheight" — opt-in: the place is autoheight=true and carries the `pct_anchor` reference object, so the SIM resolves the terrain and
 *    each object's z is written AGL (`terrain → 0`, `terrain-offset → offset`). Fully OFFLINE — no
 *    Open-Meteo — and immune to the Open-Meteo-vs-mesh error that leaves ASL objects floating/buried. An
 *    `asl` height has no AGL meaning here, so the export guards against it (see resolveHeightsAgl). */
export type HeightMode = "baked-asl" | "autoheight";

/** The helicopter's functional START position: the pad the sim spawns you on.
 *
 *  It is its OWN point, deliberately — not a reference to a placed object: a pad that IS an object puts
 *  the helicopter inside the mast or the hangar it borrowed its coordinates from. The user can still
 *  seed it from a selection — that is a one-shot copy of two numbers, not a link.
 *
 *  A project may carry SEVERAL (v1.4+), each with a free NAME shown in LOCATION. Before that there was
 *  exactly one, unnamed, always written as the literal "FATO/TLOF". */
export interface AirportPad {
  /** Stable across reorder and delete, so a map drag can name its target without an index. Same reason
   *  PlacedObject carries one; pads are minted with the same `randomId`. */
  id: string;
  /** Shown in LOCATION. Free text. EMPTY means "unnamed", and the writer then emits "FATO/TLOF" —
   *  which is what v1.2/v1.3 hard-coded, so a migrated project's files do not move. */
  name: string;
  position: LonLat; // pad centre
  heading: number; // TRUE compass degrees (the sim's `heading` field is true north)
  radius: number; // metres; the sim shows the DIAMETER as "Size" (radius 10 → "66 ft / 20 m")
}

/** The approach lighting system at ONE runway end, written verbatim into `appltsys`. These are the
 *  values FS4 accepts for `appltsys1`/`appltsys2`; the spelling must match exactly. Includes older
 *  systems (`calvert`, `odals`, `rail`, `sals`…) that FS4 still loads. */
export type ApproachLightSystem =
  | "none"
  | "std"
  | "alsf-1"
  | "alsf-2"
  | "malsf"
  | "malsr"
  | "calvert"
  | "calvert-2"
  | "odals"
  | "rail"
  | "sals";

/** Which side of the runway the PAPI sits on, and the REIL kind — both written verbatim.
 *
 *  ⚠️ The `.tsc` spells the REIL values `omni` / `uni`. Don't take vocabulary from a `.tap` (an
 *  authoring project file, not what the sim reads): it spells them `reil_omni` / `reil_uni`, which the
 *  sim quietly ignores. */
export type PapiSide = "none" | "left" | "right" | "both";
export type ReilKind = "none" | "uni" | "omni";

/** ONE END of a runway. A runway is always a pair of these — the format has no single-ended runway: the
 *  `.tsc` suffixes every field `1`/`2` and the `.wad` nests an array of exactly two.
 *
 *  ★ ONE POINT, NOT TWO. The files have both an `endpoint` (where the pavement stops) and a `threshold`
 *  (where landing distance starts), but PCT is a Level-1 tool — it writes the airport's DATA, not its
 *  asphalt, and draws no runway. So `threshold` is the leading value and is copied into `endpoint`; a
 *  displaced threshold would describe pavement nobody can see. The WRITER still treats the two rows as
 *  separate (heliportTemplate's HeliportRunwayEndSpec keeps them, and a test pins a displaced case), so
 *  the format knowledge survives even though the document cannot express it. */
export interface AirportRunwayEnd {
  /** The runway end, degrees. Written into BOTH the `threshold` and the `endpoint` rows of both files. */
  threshold: LonLat;
  /** "08", "26", "ALSF2"… May be EMPTY (e.g. a second end left unnamed). */
  identifier: string;
  appltsys: ApproachLightSystem;
  papi: PapiSide;
  reil: ReilKind;
  /** Whether this end may be used to land on / take off from. Each is its own row in the `.wad`, which
   *  is the half the navigation menu reads. */
  approach: boolean;
  takeoff: boolean;
  /** The paint at this end. Only Export TAP reads it. Absent ≡ surfaces.ts DEFAULT_RUNWAY_END_MARKINGS,
   *  so a runway saved before it existed exports the same `.tap`. */
  markings?: RunwayEndMarkings;
}

/** The markings the TAP converter paints at one runway end, each on or off. */
export interface RunwayEndMarkings {
  /** The runway number. The `.tap` row is the NEGATION, `marking_nonumbers`; an end without an
   *  identifier paints none whatever this says. */
  numbers: boolean;
  threshold: boolean;
  piano: boolean;
  skidmarks: boolean;
  touchdown: boolean;
  aimingPoint: boolean;
}

/** A runway, i.e. the PAIR of ends.
 *
 *  There is no heading here on purpose: the `.tsc`/`.wad` carry none, and the direction is whatever the two
 *  endpoints say. (A `.tap` authoring file keeps a `direction`, but that is not what the simulator reads.) */
export interface AirportRunway {
  /** Stable across reorder and delete — same contract as AirportPad.id. */
  id: string;
  /** Exactly two, in the order they are written as end 1 and end 2. */
  ends: [AirportRunwayEnd, AirportRunwayEnd];
  /** Metres, and here it really is the full width (not a radius). */
  width: number;
  /** The surface, a name from surfaces.ts RUNWAY_MATERIALS. Only Export TAP reads it. Absent ≡
   *  DEFAULT_RUNWAY_MATERIAL, so a runway saved before it existed exports the same `.tap`. */
  material?: string;
  /** 0.1–1.0 (surfaces.ts BRIGHTNESS_STEPS). Only Export TAP reads it. Absent ≡ DEFAULT_BRIGHTNESS. */
  brightness?: number;
  /** The side lines and the centre line, painted along the whole runway. Only Export TAP reads them.
   *  Absent ≡ true. */
  sidelines?: boolean;
  centerline?: boolean;
}

/** A TARMAC: a closed polygon of paved (or flattened, or grass) surface the TAP converter bakes into the
 *  airport. Any number per airport; where two overlap, the higher `level` covers the lower. Only Export
 *  TAP reads it. */
export interface AirportTarmac {
  id: string;
  /** Stored OPEN, like the boundary: at least 3 points, the first NOT repeated (the writer closes it). */
  points: LonLat[];
  /** 1 or higher, integer. */
  level: number;
  /** A name from surfaces.ts TARMAC_MATERIALS. */
  material: string;
  /** 0.1–1.0. Written empty for a material that takes none (surfaces.ts materialHasBrightness), but kept
   *  here so switching back to a paved material restores it. */
  brightness: number;
}

/** A painted LINE: an open polyline of at least 2 points, with a line name from surfaces.ts LINE_NAMES.
 *  Any number per airport. Only Export TAP reads it. */
export interface AirportLine {
  id: string;
  points: LonLat[];
  name: string;
}

/** A GROUND TEXT: letters painted on the pavement, centred on `position`. Any number per airport. Only
 *  Export TAP reads it. The colour, background and pointing values are marks.ts's vocabulary. */
export interface AirportGroundText {
  id: string;
  position: LonLat;
  /** TRUE compass degrees: the direction the tops of the letters point to. */
  heading: number;
  /** Metres PER LETTER, [width, height]. Both positive. */
  size: [number, number];
  /** Free text, the element's name in the `.tap`. Empty ≡ the writer's "GROUNDTEXT". */
  name: string;
  /** What is painted: A–Z, 0–9, space, `+`, `-` (marks.ts cleanGroundTextValue). */
  value: string;
  textColor: GroundTextColor;
  background: GroundTextBackground;
  backgroundColor: GroundTextColor;
  strokeColor: GroundTextColor;
  pointing: GroundTextPointing;
}

/** One component of a taxi sign: its type sets the colours, its value the text (marks.ts). */
export interface AirportTaxisignElement {
  type: TaxisignElementType;
  /** Per type (marks.ts editTaxisignValue); always empty for a `linebreak`. */
  value: string;
}

/** A TAXI SIGN standing at `position` (its middle). Any number per airport. Only Export TAP reads it. */
export interface AirportTaxisign {
  id: string;
  position: LonLat;
  /** TRUE compass degrees: the direction the FRONT face looks toward. The `.tap` stores it in the
   *  convention of objects (marks.ts taxisignTapDirection). */
  heading: number;
  /** Free text, the element's name in the `.tap`. Empty ≡ the writer's "TAXISIGN". */
  name: string;
  /** 1–4 (marks.ts TAXISIGN_SIZE_TYPES). */
  sizeType: number;
  /** 0.0–1.0 in steps of 0.1. */
  brightness: number;
  /** Left to right; a `linebreak` turns to the back face. */
  elements: AirportTaxisignElement[];
}

/** A JETWAY, mounted on a terminal wall at `position`. Any number per airport. Only Export TAP reads it. */
export interface AirportJetway {
  id: string;
  position: LonLat;
  /** TRUE compass degrees. */
  heading: number;
  /** Metres, 3.6–6: the height of the mounting point. */
  mountingElevation: number;
  /** Degrees relative to `heading`, counter-clockwise, −80 to +80. */
  extensionDirection: number;
  /** Degrees. */
  extensionPitch: number;
  /** Metres, 0–24.5. */
  extensionAmount: number;
  /** Degrees relative to `heading`, −80 to +80. */
  exitDirection: number;
  docked: boolean;
}

/** A CAR LOT: rows of parking spaces filled with cars at random. Any number per airport. Only Export TAP
 *  reads it. */
export interface AirportCarlot {
  id: string;
  position: LonLat;
  /** TRUE compass degrees. */
  heading: number;
  /** Integers ≥ 1 (marks.ts CARLOT_COUNT_RANGE): rows, and spaces per row. */
  rows: number;
  columns: number;
}

/** A glider AEROTOW start: where the glider stands to be pulled into the air by the tow plane.
 *
 *  ★ THIS ONE LIVES ONLY IN THE `.wad` — unlike a pad or a stand there is nothing to write into the
 *  `.tsc`, and lon/lat/heading all go through the projection. Independent of whether the airport has a
 *  runway at all; usually it sits on one, or on its extension when the runway is too short.
 *
 *  The NAME conventionally matches the runway it belongs to ("26"), but that is the user's job — PCT
 *  does not derive it from a nearby runway.
 *
 *  The file also carries a `waypoints` list; PCT writes it empty and offers nothing for it. */
export interface AirportAerotow {
  id: string;
  /** Shown in LOCATION; free text, conventionally the runway's identifier. */
  name: string;
  /** Where the GLIDER stands, degrees. */
  position: LonLat;
  /** TRUE compass degrees — the pull direction. Converted to radians for the `.wad`, like every other
   *  heading in the model. */
  heading: number;
}

/** A glider WINCH LAUNCH start. Also `.wad`-only.
 *
 *  ★ NO HEADING: length and direction result from the two positions, GLIDER and WINCH. So this element
 *  is defined by a PAIR of points, and the rope is the line between them. Storing a heading as well
 *  would let the two disagree. */
export interface AirportWinch {
  id: string;
  /** Shown in LOCATION. Conventionally named like a runway, optionally with an extra letter. */
  name: string;
  /** Where the GLIDER stands, degrees. */
  position: LonLat;
  /** Where the WINCH stands, degrees. The far end of the rope. */
  winch: LonLat;
  /** How far apart two gliders launched side by side stand, metres — roughly the wingspan. A winch with
   *  two ropes starts two gliders at once; FS4 represents that with this one number. */
  spacing: number;
}

/** What a parking position is FOR, written verbatim into the `tags` row of both files.
 *
 *  ★ THESE THREE LITERALS ARE THE VOCABULARY, and they are spelled `parked_`, not `parking_`.
 *
 *  ⚠️ Getting one wrong FAILS SILENTLY — the sim reports no error. The airport names the tag and the
 *  aircraft declares what it can use, so the sim only compares two strings that both came from data.
 *
 *  `parked_ga`/`parked_jet` let a COLD & DARK–capable aircraft or helicopter be started in a chosen
 *  state; `pushback` lets the pushback truck be coupled at start. Helicopters may use any of them. */
export type ParkingType = "parked_ga" | "parked_jet" | "pushback";

/** One parking position: where an aircraft (or helicopter) is parked and can start a flight from.
 *
 *  Its own point, exactly like AirportPad and for the same reason — a stand that borrowed an XREF's
 *  coordinates parks the aircraft inside the building. Repeatable. */
export interface AirportParking {
  /** Stable across reorder and delete — same contract as AirportPad.id. */
  id: string;
  /** Shown in LOCATION, free text ("Parking_W", "FuelStation"). EMPTY means unnamed and the writer emits
   *  "Parking", so the sim never shows a blank row. */
  name: string;
  position: LonLat; // stand centre
  heading: number; // TRUE compass degrees, like a pad's
  /** Metres, and it is a RADIUS: the sim shows the diameter, so 7.5 reads as "15 m". Typical values:
   *  7.5 for GA, 40 for a jet. */
  size: number;
  type: ParkingType;
}

/** The AIRPORT half of a project: everything "Create heliport…" needs that the POI half does not carry.
 *
 *  Stored in project.json so a "create → test in FS4 → adjust → test again" loop doesn't mean
 *  re-typing the code, the name and the country each round, and so the airport can be saved and
 *  shared like the POI.
 *
 *  Optional, and absent on every project that has never opened the heliport dialog, so schemaVersion
 *  stays 1 and a POI-only project round-trips byte-identical. An older PCT opening a project WITH one
 *  ignores the field and exports the same POI — a lossless degradation, since nothing here affects the
 *  `.tsl`/`.toc`. */
export interface ProjectAirport {
  icao: string; // 4-6 chars; lowercase on disk, shown uppercase in the UI
  name: string; // shown in LOCATION; <= SNAME_MAX or the sim drops the whole airport
  country: string; // two lowercase letters — ALSO a path segment under scenery/airports/
  // `iata` was a field here from v1.4 until it was removed: its `.wad` row is not a member of
  // `tmworld_airport_detailed`, so it never reached the sim. A project.json saved with one still opens —
  // zAirport is a looseObject — and keeps the key untouched; nothing reads it.
  /** The AIRPORT's own point (v1.4+) — independent of any pad; an airport with several pads still has
   *  one position of its own.
   *
   *  ABSENT ≡ the first pad's position, which is exactly how v1.2/v1.3 behaved — so a migrated project
   *  keeps writing the same coordinates until someone moves this point on purpose. */
  position?: LonLat;
  /** The airport's elevation, metres ASL. ABSENT ≡ the terrain under `position`, looked up at export.
   *  Only Export TAP reads it (the place's `elevation` and every runway end's): the TAP converter places
   *  XREFs at this height. The `.tsc`/`.wad` writers do not use it. */
  elevation?: number;
  /** Every helipad, in document order. May be EMPTY: an airport with no pads at all (identity plus a
   *  database entry) is complete. */
  pads: AirportPad[];
  /** Every runway, in document order. Absent ≡ none, same rule as `parkings` below and for the same
   *  reason: no runways ⇒ no block ⇒ an older project exports the same bytes. */
  runways?: AirportRunway[];
  /** Glider AEROTOW and WINCH LAUNCH starts, `.wad`-only. Same absent-means-none rule. */
  aerotows?: AirportAerotow[];
  winches?: AirportWinch[];
  /** The airport's BOUNDARY: a closed polygon around the whole field, stored OPEN — at least 3 points,
   *  the first NOT repeated at the end (the TAP writer closes it). Storing it open means the shared
   *  first/last point is one point, so moving it can never pull the ring apart. One per airport.
   *  Only Export TAP reads it; the `.tsc`/`.wad` writers do not. Absent ≡ none. */
  boundary?: LonLat[];
  /** TARMAC polygons and painted LINEs, in document order. Only Export TAP reads them. Absent ≡ none. */
  tarmacs?: AirportTarmac[];
  lines?: AirportLine[];
  /** GROUND TEXTs, TAXI SIGNs, JETWAYs and CAR LOTs, in document order. Only Export TAP reads them.
   *  Absent ≡ none. */
  groundtexts?: AirportGroundText[];
  taxisigns?: AirportTaxisign[];
  jetways?: AirportJetway[];
  carlots?: AirportCarlot[];
  /** Every parking position, in document order. Absent ≡ none, which is what every project
   *  written before v1.4 has — and the writers emit no `parking_positions` block at all in that case, so
   *  those projects keep exporting the same bytes.
   *
   *  Unlike `pads` there is no compatibility mirror and none is needed: PCT <= 1.3 parses the airport
   *  block with a LOOSE schema (verified against the v1.3.2 tag), so it carries this key through a
   *  load/save round-trip untouched instead of dropping it. */
  parkings?: AirportParking[];
  /** ⚠️ COMPATIBILITY MIRROR of `pads[0]` — written, never read by this version.
   *
   *  `zProject.parse` THROWS, and `zAirport` before v1.4 required `pad`, so a project that carries only
   *  `pads` does not merely lose its airport in PCT <= 1.3 — it fails to OPEN AT ALL. Projects get
   *  shared, so the common case has to keep working. Mirroring the first pad costs one line and buys
   *  that: one pad → older PCT opens it and sees exactly what it saw before.
   *
   *  Absent when `pads` is empty — an older PCT cannot represent a pad-less airport anyway, and inventing
   *  a fake pad to keep it loading would put a helipad in the sim that the user never placed. */
  pad?: AirportPad;
}

/** The editable working file (`project.json`). */
export interface Project {
  schemaVersion: 1;
  app: "pct";
  name: string; // human title, e.g. "Munich apron test"
  poiName: string; // folder slug: [a-z0-9_]+, non-empty at export
  createdAt: string; // ISO 8601
  modifiedAt: string; // ISO 8601
  reference: LonLat | null; // POI anchor → folder coords; null = auto (centroid at export)
  camera: { lon: number; lat: number; zoom: number }; // last map view
  objects: PlacedObject[]; // xref + v0.2 airport_light / light, discriminated on `kind`
  shift?: PoiShift; // optional global export shift; absent = none
  heightMode?: HeightMode; // how heights export (see HeightMode); absent ≡ "baked-asl"
  airport?: ProjectAirport; // v1.2 — the heliport identity + pad, remembered (see ProjectAirport)
}

// ── Export (design §3.4) ────────────────────────────────────────────────────

/** A placed object with its height already resolved to absolute metres ASL (the shape the exporter
 *  consumes). One per kind so the union stays discriminated on `kind` for the emitter. */
export interface ResolvedXref extends Omit<PlacedXref, "height"> {
  heightAsl: number;
}
export interface ResolvedAirportLight extends Omit<PlacedAirportLight, "height"> {
  heightAsl: number;
}
export interface ResolvedLight extends Omit<PlacedLight, "height"> {
  heightAsl: number;
}
export interface ResolvedPlant extends Omit<PlacedPlant, "height"> {
  heightAsl: number; // → the `.toc` `altitude` (treated as ASL — see PlacedPlant)
}
export type ResolvedObject = ResolvedXref | ResolvedAirportLight | ResolvedLight | ResolvedPlant;

/** One file to write into the POI folder. */
export interface PoiFile {
  relPath: string; // e.g. "poi.tsl"
  content: string;
}

/** A pure, testable description of the POI package to write — no I/O. */
export interface ExportPlan {
  folderName: string; // "e01187n4838_munich_test"
  files: PoiFile[]; // poi.tsl, poi.toc, README.txt
  assets: string[]; // bundled binary asset basenames to copy verbatim into the folder (v0.4 plant anchor mesh+texture); [] for xref/light-only POIs — the installer resolves each name in the app's assets dir
  warnings: string[];
}

// ── App settings (design §2.3) ──────────────────────────────────────────────

/** Where the window was when it was last closed, so it reopens there. Always the NORMAL
 *  bounds — the maximized rectangle is not worth storing, `maximized` restores that separately and the
 *  normal size is what un-maximizing must give back. Optional: absent until the first clean close. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface Settings {
  schemaVersion: 1;
  installDir: string | null; // AFS4 install (read: scenery/xref)
  afs4UserDir: string | null; // AFS4 user folder (write: scenery/poi)
  // Optional folder of USER-supplied object photos (v0.6). A file named `<xref name>.<jpg|jpeg|png|webp>`
  // in here replaces that object's generated category glyph in the catalog + placed list. The photos are
  // the user's OWN sim screenshots, read from their disk, never bundled or exported — the zero-IPACS-assets
  // line is untouched (same status as the scanned catalog cache). null = not set → every row keeps its glyph.
  thumbnailsDir: string | null;
  // Where "Export TAP" writes `<ICAO>.tap` — usually the TAP converter's input folder. Opt-in, chosen in
  // Settings or in the Export TAP dialog; null = not set yet.
  tapDir: string | null;
  tiles: {
    provider: "esri" | "osm" | "custom"; // esri satellite (default) · OSM streets · custom XYZ URL
    customUrl?: string; // XYZ template, user-supplied
    customAttribution?: string;
  };
  elevation: { provider: "open-meteo" | "none" };
  recentProjects: string[]; // absolute paths, max 10
  lastScanAt: string | null;
  window?: WindowBounds; // last placement — restored on launch (see main/windowBounds.ts)
}
