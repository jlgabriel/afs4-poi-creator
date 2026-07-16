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
export interface CatalogAirportLight {
  typeName: string; // ".tmb basename minus al_", e.g. "runway_edge_light" — the .toc type_name
  folder: string; // provenance: the al_<type> folder it came from, e.g. "al_runway_edge_light"
  source: "install";
  category: string; // display taxonomy path, e.g. "lights/runway"
  displayName: string; // derived pretty label, e.g. "Runway Edge Light"
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
  plants: []; // reserved (M4+)
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

/** Any placed object, discriminated on `kind`. (Project.objects widens to this when the v0.2 lights
 *  UI lands; the format/scanner plumbing below is built and golden-tested first.) */
export type PlacedObject = PlacedXref | PlacedAirportLight | PlacedLight;

/** Global horizontal shift applied to EVERY object at export time: nudge each position `east`
 *  metres east and `north` metres north (either can be negative). Corrects a systematic offset
 *  between the map base (Esri/OSM) and FS4's own satellite tiles — the "Shift airport" input the
 *  ACT gained (forum #12). Distinct from the per-object vertical HeightSpec "offset". */
export interface PoiShift {
  east: number; // metres, + = east
  north: number; // metres, + = north
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
export type ResolvedObject = ResolvedXref | ResolvedAirportLight | ResolvedLight;

/** One file to write into the POI folder. */
export interface PoiFile {
  relPath: string; // e.g. "poi.tsl"
  content: string;
}

/** A pure, testable description of the POI package to write — no I/O. */
export interface ExportPlan {
  folderName: string; // "e01187n4838_munich_test"
  files: PoiFile[]; // poi.tsl, poi.toc, README.txt
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
