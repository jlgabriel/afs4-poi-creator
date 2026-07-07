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
}

/** One scanned `.tmi` bundle. */
export interface BundleInfo {
  bundle: string; // filename from tmxglscene_info, e.g. "xref_buildings"
  source: "install" | "user";
  path: string; // absolute path of the .tmi
  count: number; // entries parsed
}

/** The scanned catalog cache. Written to Electron userData at runtime; never committed. */
export interface Catalog {
  schemaVersion: 1;
  scannedAt: string; // ISO 8601
  installDir: string;
  userXrefDir: string | null;
  bundles: BundleInfo[];
  xref: CatalogObject[];
  plants: []; // reserved (M4+)
  airportLights: []; // reserved
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

/** One placed built-in object in a project. Portable: names + coordinates + transforms only,
 *  no assets, no absolute paths. `name` survives even if the opener's catalog lacks it. */
export interface PlacedXref {
  id: string; // uuid v4
  kind: "xref"; // discriminator; "plant" | "light" | … arrive M4+
  name: string; // exact catalog name — the value written to the .toc
  position: LonLat;
  height: HeightSpec;
  direction: number; // degrees, clockwise positive, [0, 360) (spec: negative = CCW)
  scale: number; // uniform scale_factor, > 0, default 1
  label?: string; // optional user note
  locked?: boolean; // optional: ignore drags (dense-scene safety)
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
  objects: PlacedXref[];
}

// ── Export (design §3.4) ────────────────────────────────────────────────────

/** A PlacedXref with its height already resolved to absolute metres ASL. */
export interface ResolvedXref extends Omit<PlacedXref, "height"> {
  heightAsl: number;
}

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

export interface Settings {
  schemaVersion: 1;
  installDir: string | null; // AFS4 install (read: scenery/xref)
  afs4UserDir: string | null; // AFS4 user folder (write: scenery/poi)
  tiles: {
    provider: "esri" | "custom";
    customUrl?: string; // XYZ template, user-supplied
    customAttribution?: string;
  };
  elevation: { provider: "open-meteo" | "none" };
  recentProjects: string[]; // absolute paths, max 10
  lastScanAt: string | null;
}
