// Shared, framework-agnostic types for PCT's pure core.
// Geometry primitives + the scanned object catalog (M0), plus the editable Project, the
// export plan, and Settings (design §2.2–§2.4 / §3.4) — the M1 data model.

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
  // ── Optional overlay from the official IPACS `xref_table.csv` (build-but-disabled until forum #114;
  //    see docs/XREF_TABLE_CSV_DECISION.md). Present ONLY on an install-source object whose name matched
  //    a table row. All optional → the cache stays schemaVersion 1 and a scan with no table (the shipping
  //    default) is byte-identical to before. `displayName` above is the OFFICIAL label on a match. ──
  official?: true; // provenance: displayName + taxonomy are the official table's, not the heuristic
  taxonomy?: { main: string; sub: string; type: string }; // IPACS 3-level taxonomy, e.g. Aircraft/Airliner/A320
  footprint?: [number, number][]; // real footprint polygon, model-local metres (x, y) — glyphs (#86-2)
  // ── Optional user-XREF registration state (design B2). Set on objects derived from a LOOSE user `.tmb`
  //    (one dropped in scenery/xref that isn't yet resolvable from a POI — it needs a generated `.tmi` in
  //    its own subfolder). Absent on every built-in and every already-bundled object. ──
  unregistered?: true; // from a loose user `.tmb` not yet registered → surfaced for registration, not placement
  sizeUnknown?: true; // an OPAQUE (IPACS-compiled) `.tmb`: filename only, no derivable bbox/footprint
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
 *  basename minus the `al_` prefix). PCT never opens the `.tmb` (opaque IPACS binary); the "scan"
 *  is pure name derivation, so it ships zero proprietary bytes — even stronger than the `.tmi` case. */
export interface CatalogAirportLight extends UserFootprint {
  typeName: string; // ".tmb basename minus al_", e.g. "runway_edge_light" — the .toc type_name
  folder: string; // provenance: the al_<type> folder it came from, e.g. "al_runway_edge_light"
  source: "install";
  category: string; // display taxonomy path, e.g. "lights/runway"
  displayName: string; // derived pretty label, e.g. "Runway Edge Light"
}

/** A bounding box PCT could not scan and the user measured by hand (v0.9, forum #126/#129 — ApfelFlieger
 *  noticed the `airport_lights` draw as bare points on the map because they have no `.tmi` and therefore
 *  no bbox, while a Runway Approach Light Center 2 and a Center 5 differ by metres that matter when you
 *  place them). The user types width × depth × height into the card's right-click menu; it is stored in
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
 *  all 41 install files are `.ttx` textures, so the sim draws a plant from its texture alone and the
 *  "scan" is pure name derivation (`broadleaf__i00__h1750_color.ttx`). `group` + `species` are the
 *  exact strings a POI `.toc` writes; see core/catalog/plants.ts. */
export interface CatalogPlant extends UserFootprint {
  group: string; // the .toc `group`, e.g. "conifer_forest" — verbatim from the filename
  species: string; // the .toc `species`, e.g. "00" — 2 zero-padded digits, verbatim
  naturalHeight: number; // metres, decoded from the filename's h#### (h1750 → 17.5)
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
 *  metres ASL (design R1, verified by matrix V2), so "terrain" modes resolve to an ASL
 *  value at export time; only "asl" is a literal already. */
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
 *  Emitted into the POI `.toc` `list_airport_light`. Height is absolute metres ASL, same rule as xref
 *  (in-sim gate confirmed 2026-07-12: a height-614 probe floated +30 m over 584 m terrain). */
export interface PlacedAirportLight extends PlacedBase {
  kind: "airport_light"; // discriminator; mirrors the .toc element tag
  typeName: string; // CatalogAirportLight.typeName — the .toc type_name (no "al_")
  orientation: number; // degrees the light is illuminated toward
  configuration: string; // colour letters, 0–2 of [bgrwy]; "" = the fixture's own default colour
  groupIndex: number; // night-visibility group (0 = ±40 min around night … 3 = 24 h)
}

/** One placed generic parametric point light (v0.2). No catalog — fully described by its parameters.
 *  Emitted into the POI `.toc` `list_light`. Height is absolute metres ASL (same in-sim gate). */
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
 *  Two fields the other kinds have are deliberately ABSENT, because the bible's plant element has
 *  neither: no `direction` (a plant is a billboard — it turns to face the camera, so a heading has
 *  nothing to act on) and no `scale` (`heightRange` is the size control).
 *
 *  ⚠️ `height` (→ the `.toc` `altitude`) is the one UNRESOLVED semantic in v0.4. Every other kind's
 *  height is metres ASL, but a plant is the only element whose altitude is a field of its OWN
 *  (float32, beside a 2-value lon/lat `position`) instead of the third slot of `position`, and the
 *  bible annotates ASL on the xref/light positions while saying nothing here. So ASL is the working
 *  assumption (consistency + it makes the existing HeightSpec pipeline fit unchanged), NOT a finding.
 *  The in-sim gate decides; if it lands AGL the change is confined to how heights resolve, not to
 *  this model. Do not repeat it as fact until the gate says so. */
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
 *  between the map base (Esri/OSM) and FS4's own satellite tiles — the "Shift airport" input the
 *  ACT gained (forum #12). Distinct from the per-object vertical HeightSpec "offset". */
export interface PoiShift {
  east: number; // metres, + = east
  north: number; // metres, + = north
}

/** How a project's heights are turned into the export (a per-PROJECT property, not a fourth HeightSpec —
 *  the flag flips the z-semantics of the WHOLE cultivation, so a mixed POI can't exist; design §2 of the
 *  autoheight plan). `absent ≡ "baked-asl"`.
 *
 *  • "baked-asl"  — the shipping default: each object's HeightSpec resolves to an absolute ASL number
 *    (Open-Meteo for terrain modes), written verbatim into the `.toc`; the place stays autoheight=false.
 *  • "autoheight" — opt-in (forum #142 chrispriv / #143 ApfelFlieger; in-sim gate 2026-07-19): the place
 *    is autoheight=true and carries the `pct_anchor` reference object, so the SIM resolves the terrain and
 *    each object's z is written AGL (`terrain → 0`, `terrain-offset → offset`). Fully OFFLINE — no
 *    Open-Meteo — and immune to the Open-Meteo-vs-mesh error that leaves ASL objects floating/buried. An
 *    `asl` height has no AGL meaning here, so the export guards against it (see resolveHeightsAgl). */
export type HeightMode = "baked-asl" | "autoheight";

/** The helicopter's functional START position: the pad the sim spawns you on.
 *
 *  It is its OWN point, deliberately — not a reference to a placed object. v1.1 derived the pad from
 *  whichever object was selected, and ApfelFlieger's objection (forum #168) is decisive: "the functional
 *  starting position for Helicopter should be independent of XREF objects because this will lead to
 *  collisions too quickly". A pad that IS an object puts the helicopter inside the mast or the hangar
 *  it borrowed its coordinates from. The user can still seed it from a selection — that is a one-shot
 *  copy of two numbers, not a link.
 *
 *  ★ v1.4: a project may carry SEVERAL. ApfelFlieger's submenu split (forum #221) makes HELICOPTER a
 *  repeatable element — his own SCLC ships three — and gives each pad a free NAME, shown in LOCATION.
 *  Until then there was exactly one, unnamed, always written as the literal "FATO/TLOF". */
export interface AirportPad {
  /** Stable across reorder and delete, so a map drag can name its target without an index. Same reason
   *  PlacedObject carries one; pads are minted with the same `randomId`. */
  id: string;
  /** Shown in LOCATION (forum #221). Free text. EMPTY means "unnamed", and the writer then emits
   *  "FATO/TLOF" — which is what v1.2/v1.3 hard-coded, so a migrated project's files do not move. */
  name: string;
  position: LonLat; // pad centre
  heading: number; // TRUE compass degrees (the sim's `heading` field is true — gate 2026-07-31)
  radius: number; // metres; the sim shows the DIAMETER as "Size" (radius 10 → "66 ft / 20 m")
}

/** What a parking position is FOR, written verbatim into the `tags` row of both files.
 *
 *  ★ THESE THREE LITERALS ARE THE VOCABULARY, and they are spelled `parked_`, not `parking_`.
 *  ApfelFlieger's post announcing the submenu (forum #232) writes them as `[parking_ga]` / `[parking_jet]`
 *  in prose, but every FILE he has sent — his original SCLC, the three flight-test variants, the ACT's own
 *  output and the new #232 pair — writes `parked_ga`, and his own margin note in the original spells the
 *  set out: "[parked_ga] = 7.5 M / [parked_jet] = 40 M / [pushback] = PUSH BACK". The files win.
 *
 *  ⚠️ Getting one wrong FAILS SILENTLY. The row is a `string8u`, and the sim's binary carries no
 *  `parked_ga` literal (it does carry `parking_positions`), so these are almost certainly hashed at load —
 *  the same shape as an XREF name that does not resolve. There is no error to read in tm.log.
 *
 *  What the user gets out of each (forum #232): `parked_ga`/`parked_jet` let a COLD & DARK–capable
 *  aircraft or helicopter be started in a chosen state; `pushback` lets the pushback truck be coupled at
 *  start. Helicopters may use any of them — that is why the submenu stopped being called "Aircraft"
 *  (forum #227). */
export type ParkingType = "parked_ga" | "parked_jet" | "pushback";

/** One parking position: where an aircraft (or helicopter) is parked and can start a flight from.
 *
 *  Its own point, exactly like AirportPad and for the same reason (forum #168) — a stand that borrowed an
 *  XREF's coordinates parks the aircraft inside the building. Repeatable: "any number of parking positions
 *  can be created" (forum #232; his own SCLC ships three). */
export interface AirportParking {
  /** Stable across reorder and delete — same contract as AirportPad.id. */
  id: string;
  /** Shown in LOCATION, free text ("Parking_W", "FuelStation"). EMPTY means unnamed and the writer emits
   *  "Parking", so the sim never shows a blank row. */
  name: string;
  position: LonLat; // stand centre
  heading: number; // TRUE compass degrees, like a pad's
  /** Metres, and it is a RADIUS: the sim shows the diameter, so 7.5 reads as "15 m". His margin note ties
   *  the number to the type — 7.5 for GA, 40 for a jet. */
  size: number;
  type: ParkingType;
}

/** The AIRPORT half of a project: everything "Create heliport…" needs that the POI half does not carry.
 *
 *  Stored in project.json (forum #170, ApfelFlieger): before this, PCT wrote only POI data, so every
 *  round of "create → test in FS4 → adjust → test again" meant re-typing the code, the name and the
 *  country. He built SHJK — Arica Regional Hospital by hand five times over (SHJH, SHJI, SHJJ, SHJK,
 *  SHJL) to raise one rooftop pad. His own summary of why this belongs in the file: the code needs
 *  checking once rather than every time, the airport can be saved as often as a POI, and it can be
 *  passed on like a POI. "A JSON file expanded in this way has the same function as the TAP file of
 *  the ACT — and is at the same time more flexible."
 *
 *  Optional, and absent on every project that has never opened the heliport dialog, so schemaVersion
 *  stays 1 and a POI-only project round-trips byte-identical. An older PCT opening a project WITH one
 *  ignores the field and exports the same POI — a lossless degradation, since nothing here affects the
 *  `.tsl`/`.toc`. */
export interface ProjectAirport {
  icao: string; // 4-6 chars; lowercase on disk, shown uppercase in the UI (forum #170 EDIT 2)
  name: string; // shown in LOCATION; <= SNAME_MAX or the sim drops the whole airport
  country: string; // two lowercase letters — ALSO a path segment under scenery/airports/
  /** IATA code, v1.4 (forum #220): "if airports have a IATA code, it is also displayed in FS 4". Its
   *  own row in the `.wad` and empty in every file PCT has written so far, hence optional. */
  iata?: string;
  /** The AIRPORT's own point, v1.4 — independent of any pad.
   *
   *  ApfelFlieger asked for the split in #15 and then SHIPPED it: his older hand-built `.wad` carried
   *  the FIRST HELIPAD's projected position (verified exact — it was an unexplained oddity in our notes
   *  for days), while the #220/#221 files carry the airport's own `-70.582247 -33.380724` even though
   *  that project has three pads. So the coupling was an artefact of his manual method, not a rule.
   *
   *  ABSENT ≡ the first pad's position, which is exactly how v1.2/v1.3 behaved — so a migrated project
   *  keeps writing the same coordinates until someone moves this point on purpose. */
  position?: LonLat;
  /** Every helipad, in document order. May be EMPTY: his "(1) DATA" example is a complete airport with
   *  no pads at all — identity plus a database entry. */
  pads: AirportPad[];
  /** Every parking position, in document order (forum #232). Absent ≡ none, which is what every project
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
   *  shared (that is the whole point of the block: "it can be passed on like a POI"), and Michael tests
   *  every release, so the common case has to keep working. Mirroring the first pad costs one line and
   *  buys that: one pad → older PCT opens it and sees exactly what it saw before.
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
  shift?: PoiShift; // optional global export shift (forum #12); absent = none
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
  heightAsl: number; // → the `.toc` `altitude` (ASL pending the gate — see PlacedPlant)
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

/** Where the window was when it was last closed, so it reopens there (forum #125). Always the NORMAL
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
