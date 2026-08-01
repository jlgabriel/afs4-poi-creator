// mockBridge.ts — DEV-ONLY fake `window.pct`, so the REAL first-run wizard → editor path (Electron-only
// in production) can be exercised in the plain-browser preview harness. Activated ONLY by main.tsx when
// `import.meta.env.DEV && location.search` contains `mockpct`; it is never imported by the shipped
// renderer bundle and never runs inside Electron (where the real preload bridge already exists).
//
// Why it exists: some bugs (e.g. "catalog search rejects typing after a wizard boot") only appear on the
// wizard path with a FULL ~900-object catalog — impossible to reach in the demo-seed preview. This lets
// `preview:renderer` reproduce it. The synthetic catalog is built with the SAME core categorize/displayName
// the real scanner uses, so object field shapes match production exactly.
import type { Catalog, CatalogObject, PlacedXref, Project, Settings } from "../../core/project/types";
import { categorize, displayName } from "../../core/catalog/categorize";
import { photoKey } from "../../core/catalog/photoKey";
import { EMPTY_FOOTPRINTS, setFootprint, type FootprintOverrides } from "../../core/catalog/footprints";
import type { InstalledHeliport, InstalledPoi, PctApi } from "../../shared/pctApi";

// A spread of real-ish name stems across the catalog's categories, expanded with numeric suffixes to
// ~900 entries so the list is production-scale.
const STEMS = [
  "tower00_small_plates",
  "hangar_small_plates",
  "hangar_big_metal",
  "terminal_glass",
  "office_block",
  "factory_hall",
  "fuelstation_canopy",
  "watertower_round",
  "reservoir_tank",
  "jetway_a",
  "jetway_footway",
  "pbridge_double",
  "staticpeople_standing",
  "people_walking",
  "car_sedan",
  "taxi_yellow",
  "truck_box",
  "lkw_trailer",
  "floodlight_mast",
  "streetlight_pole",
  "barrel_steel",
  "container_40ft",
  "cardboard_stack",
  "comm_tower_lattice",
  "construction_crane",
  "church_steeple",
  "powerline_pylon",
];

/** Verbatim from xrefRegistrar.planLooseTmb — the mock's job is to look like main, and the old copy here
 *  had drifted (it dropped "name/bbox not readable"), which is exactly the kind of gap that makes a
 *  preview agree with a bug. */
const OPAQUE_REASON = "opaque (compiled) .tmb — name/bbox not readable; register it manually";

function buildBigCatalog(): Catalog {
  const xref: CatalogObject[] = [];
  const bundle = "xref_mock";
  // ~35 variants per stem × 27 stems ≈ 945 objects.
  for (const stem of STEMS) {
    for (let i = 0; i < 35; i++) {
      const suffix = `_ds_${String(i).padStart(2, "0")}_08_08`;
      const name = `${stem}${suffix}`;
      const { category, act } = categorize(name, bundle);
      const x = 5 + (i % 20);
      const y = 5 + ((i * 3) % 40);
      const z = 3 + (i % 25);
      xref.push({
        name,
        bundle,
        source: "install",
        bbMin: [-x / 2, -y / 2, 0],
        bbMax: [x / 2, y / 2, z],
        bsRadius: Math.hypot(x, y, z) / 2,
        size: { x, y, z },
        category,
        displayName: displayName(name),
        act,
      });
    }
  }
  // Loose user `.tmb` (design B2), in the proportion the register dialog actually has to survive: ONE
  // readable + THIRTY opaque. The COUNT is the point, not the coverage. Michael scanned ~2000 objects
  // with exactly one readable, and at roughly this length the old alert-driven flow ran off the bottom
  // of his screen (#125) — a 1+1 mock renders both lists beautifully and could never have shown that.
  // Same trap as the register bug itself: ask what the harness is incapable of reproducing.
  xref.push({
    name: "my_pylon",
    bundle: "my_pylon",
    source: "user",
    bbMin: [-1, -1, 0],
    bbMax: [1, 1, 15],
    bsRadius: Math.hypot(2, 2, 15) / 2,
    size: { x: 2, y: 2, z: 15 },
    category: "user/my_pylon",
    displayName: "My Pylon",
    act: false,
    unregistered: true,
  });
  for (let i = 0; i < 30; i++) {
    const name = `opaque_widget_${String(i).padStart(2, "0")}`;
    xref.push({
      name,
      bundle: name,
      source: "user",
      bbMin: [0, 0, 0],
      bbMax: [0, 0, 0],
      bsRadius: 0,
      size: { x: 0, y: 0, z: 0 },
      category: `user/${name}`,
      displayName: `Opaque Widget ${String(i).padStart(2, "0")}`,
      act: false,
      unregistered: true,
      sizeUnknown: true,
    });
  }
  return {
    schemaVersion: 1,
    scannedAt: "2026-07-09T00:00:00Z",
    installDir: "C:/Mock/Aerofly FS 4",
    userXrefDir: null,
    bundles: [{ bundle, source: "install", path: "C:/Mock/.../tmi", count: xref.length }],
    xref,
    // v0.8: the Plants and Lights sections were mocked as EMPTY, which meant the preview harness (and the
    // e2e that drives it) could only ever see their "Rescan to load…" state — so the photo surfaces those
    // two sections just gained would have been unverifiable outside a packaged build, which is exactly the
    // hole v0.6.2 closed for the xref gallery. A handful of real-shaped entries each is enough.
    //
    // The plants are picked deliberately: `conifer_forest` is the group whose own underscore the photo key
    // must not mangle, and `palm`/`08` is the pair the format author's proven file places (plants.ts).
    plants: [
      { group: "broadleaf", species: "00", naturalHeight: 17.5, source: "install", category: "plants/broadleaf", displayName: "Broadleaf 00" },
      { group: "broadleaf", species: "01", naturalHeight: 16.5, source: "install", category: "plants/broadleaf", displayName: "Broadleaf 01" },
      { group: "conifer_forest", species: "01", naturalHeight: 28.2, source: "install", category: "plants/conifer_forest", displayName: "Conifer Forest 01" },
      { group: "palm", species: "08", naturalHeight: 12.5, source: "install", category: "plants/palm", displayName: "Palm 08" },
      { group: "shrub", species: "11", naturalHeight: 0.8, source: "install", category: "plants/shrub", displayName: "Shrub 11" },
    ],
    airportLights: [
      { typeName: "runway_edge_light", folder: "al_runway_edge_light", source: "install", category: "lights/runway", displayName: "Runway Edge Light" },
      { typeName: "taxiway_edge_light", folder: "al_taxiway_edge_light", source: "install", category: "lights/taxiway", displayName: "Taxiway Edge Light" },
      { typeName: "papi_left", folder: "al_papi_left", source: "install", category: "lights/approach", displayName: "Papi Left" },
    ],
    animated: [],
  };
}

// v0.6.2: the browser preview has no disk, so object photos (v0.6) were entirely un-exercisable here —
// every card kept its glyph and the hover-preview's photo path couldn't be seen without a packaged
// build. These synthetic photos fix that: a few stems get a generated SVG "photo" so `preview:renderer`
// shows real <img> thumbs AND the enlarged hover, while every other card still falls back to its glyph.
// v0.8 adds two non-xref stems (a plant and a fixture) so the harness shows the namespaced keys working
// end to end, not just the xref path they were modelled on.
const PHOTO_STEMS = [
  "tower00_small_plates",
  "car_sedan",
  "staticpeople_standing",
  "plant.palm.08",
  "light.runway_edge_light",
];
function hasMockPhoto(name: string): boolean {
  return PHOTO_STEMS.some((stem) => name.startsWith(stem));
}
/** A stand-in "photo": a tall SVG (200×280, like a person/tower shot) so object-fit:contain visibly
 *  letterboxes in the square thumb and the hover box, exactly as a real portrait photo would.
 *
 *  Keyed by the photo STEM rather than a CatalogObject (v0.8): plants and lights have no CatalogObject to
 *  look up, and the mock's job is only to prove the key round-trips. */
function mockPhoto(stem: string): string {
  const hue = (stem.length * 47) % 360;
  const label = stem.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">` +
    `<rect width="200" height="280" fill="hsl(${hue} 45% 62%)"/>` +
    `<rect x="66" y="70" width="68" height="150" rx="10" fill="hsl(${hue} 40% 34%)"/>` +
    `<circle cx="100" cy="66" r="28" fill="hsl(${hue} 45% 82%)"/>` +
    `<text x="100" y="256" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#fff">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function mockSettings(installDir: string | null): Settings {
  return {
    schemaVersion: 1,
    installDir,
    afs4UserDir: null,
    thumbnailsDir: null,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
}

/** A synthetic crash-recovery shadow for the `?mockpct&recover` harness — a couple of placed objects
 *  near Bex/CH so the RecoveryBanner has real content to restore. */
function recoverShadow(catalog: Catalog): Project {
  const at = (lon: number, lat: number, over: Partial<PlacedXref> = {}) => ({
    id: `rec-${lon}-${lat}`,
    kind: "xref" as const,
    name: catalog.xref[0].name,
    position: { lon, lat },
    height: { mode: "terrain" as const },
    direction: 0,
    scale: 1,
    ...over,
  });
  return {
    schemaVersion: 1,
    app: "pct",
    name: "Recovered session",
    poiName: "recovered",
    createdAt: "2026-07-09T00:00:00Z",
    modifiedAt: "2026-07-09T00:00:00Z",
    reference: null,
    camera: { lon: 6.9847, lat: 46.2569, zoom: 16 },
    objects: [
      at(6.9847, 46.2569),
      at(6.985, 46.2572, { id: "rec-b", direction: 90, height: { mode: "asl", value: 500 } }),
    ],
  };
}

export function installMockBridge(): void {
  // If a real bridge already exists (e.g. someone loads a ?mockpct URL inside Electron-dev), leave it
  // alone — window.pct there is a read-only contextBridge binding and assigning over it throws.
  if ((window as unknown as { pct?: PctApi }).pct) return;

  let catalog = buildBigCatalog();
  // `?mockpct&recover` simulates a returning user whose last session crashed: a cached catalog +
  // known install dir (→ editor, not wizard) AND a shadow to recover, so the RecoveryBanner shows.
  const wantRecover = location.search.includes("recover");
  let settings = mockSettings(wantRecover ? "C:/Mock/Aerofly FS 4" : null); // null installDir → wizard
  const noop = async (): Promise<void> => {};
  let shadow: Project | null = wantRecover ? recoverShadow(catalog) : null;
  // A couple of PCT-authored POIs + one built-in, so the export dialog's installed-list + Uninstall are
  // exercisable in the preview harness. uninstallPoi mutates this; install adds to it.
  let installedPois: InstalledPoi[] = [
    { folderName: "e00367n4801_france", byPct: true },
    { folderName: "e00698n4627_suiza", byPct: true },
    { folderName: "toulouse_city", byPct: false },
  ];
  let installedHeliports: InstalledHeliport[] = [
    { folderName: "e00367n4801_france", country: "fr", icao: "fr0001" },
  ];
  // v0.7: a MUTABLE set of lowercased names that have a photo, seeded from PHOTO_STEMS. saveObjectPhoto
  // adds and deleteObjectPhoto removes, so the right-click menu's paste/remove flow is exercisable with no
  // disk (the preview has none). Respects settings.thumbnailsDir like main: none set → "no-photos-dir".
  let mockFootprints: FootprintOverrides = EMPTY_FOOTPRINTS;
  const mockPhotos = new Set<string>(
    [
      ...catalog.xref.map((o) => o.name),
      ...catalog.plants.map((p) => photoKey({ kind: "plant", group: p.group, species: p.species })),
      ...catalog.airportLights.map((l) => photoKey({ kind: "airport_light", typeName: l.typeName })),
    ]
      .filter(hasMockPhoto)
      .map((stem) => stem.toLowerCase()),
  );

  const api: PctApi = {
    detectPaths: async () => ({ installDirs: ["C:/Mock/Aerofly FS 4"], userDir: "C:/Mock/User" }),
    scan: async () => ({ ok: true, value: { catalog, warnings: [] } }),
    getCachedCatalog: async () => (wantRecover ? catalog : null), // recover → editor; else wizard
    getSettings: async () => settings,
    setSettings: async (patch) => {
      // Deep-merge the nested objects like the real writeSettings (main/settings.ts) so a partial
      // tiles/elevation patch keeps its siblings.
      settings = {
        ...settings,
        ...patch,
        tiles: { ...settings.tiles, ...(patch.tiles ?? {}) },
        elevation: { ...settings.elevation, ...(patch.elevation ?? {}) },
      };
      return settings;
    },
    chooseDirectory: async () => "C:/Mock/Aerofly FS 4",
    // Synthetic photos for a few stems (PHOTO_STEMS) so the preview exercises the object-photo path and
    // the hover-preview's enlarged image; every other card still falls back to its glyph.
    listThumbnails: async () => [...mockPhotos],
    // Keyed purely on the stem, exactly like main's index — no catalog lookup, so an xref name, a
    // `plant.…` and a `light.…` all resolve the same way.
    getThumbnail: async (name) => (mockPhotos.has(name.toLowerCase()) ? mockPhoto(name) : null),
    saveObjectPhoto: async (name) => {
      if (settings.thumbnailsDir === null) {
        return { ok: false, error: { code: "no-photos-dir", message: "No photo folder is set — choose one in Settings first." } };
      }
      mockPhotos.add(name.toLowerCase()); // no clipboard in the preview → a paste always "succeeds"
      return { ok: true, value: undefined };
    },
    deleteObjectPhoto: async (name) => {
      if (settings.thumbnailsDir === null) {
        return { ok: false, error: { code: "no-photos-dir", message: "No photo folder is set — choose one in Settings first." } };
      }
      mockPhotos.delete(name.toLowerCase());
      return { ok: true, value: undefined };
    },
    openPhotosDir: noop,
    // v0.9 footprint overrides — in-memory, so the right-click "Edit footprint…" flow and the map's
    // point→polygon switch are exercisable in the preview harness with no disk. Import/export need a
    // native file dialog, so they report "cancelled" (null) rather than pretending.
    getFootprints: async () => mockFootprints,
    setFootprint: async (key, override) => {
      mockFootprints = setFootprint(mockFootprints, key, override);
      return { ok: true, value: mockFootprints };
    },
    importFootprints: async () => ({ ok: true, value: null }),
    exportFootprints: async () => ({ ok: true, value: null }),
    planXrefRegistration: async () => ({
      ok: true,
      value: {
        registerable: catalog.xref
          .filter((o) => o.unregistered && !o.sizeUnknown)
          .map((o) => ({ base: o.name, geometries: 1, ttx: 1, missingTextures: [] })),
        skipped: catalog.xref.filter((o) => o.sizeUnknown).map((o) => ({ name: `${o.name}.tmb`, reason: OPAQUE_REASON })),
      },
    }),
    registerXref: async () => {
      const registered = catalog.xref.filter((o) => o.unregistered && !o.sizeUnknown).length;
      const skipped = catalog.xref.filter((o) => o.sizeUnknown);
      // "register" the plain-text ones: they now resolve → drop the unregistered flag.
      catalog = {
        ...catalog,
        xref: catalog.xref.map((o) => (o.unregistered && !o.sizeUnknown ? { ...o, unregistered: undefined } : o)),
      };
      // The real registerXref appends one "Skipped …" warning PER skipped file (xrefRegistrar.ts), so the
      // RESULT screen gets the same wall the plan did — which is the half of #125 that bit Michael twice.
      // `warnings: []` here meant the preview could never render that list at all.
      return {
        ok: true,
        value: {
          registered,
          scan: { catalog, warnings: [] },
          warnings: skipped.map((o) => `Skipped ${o.name}.tmb: ${OPAQUE_REASON}`),
        },
      };
    },
    openProject: async () => ({ ok: true, value: null }),
    saveProject: async () => ({ ok: true, value: { path: "C:/Mock/project.json" } }),
    saveProjectAs: async () => ({ ok: true, value: { path: "C:/Mock/project.json" } }),
    autosaveShadow: noop,
    loadShadow: async () => shadow,
    clearShadow: async () => {
      shadow = null;
    },
    resolveHeights: async (objects) => ({
      ok: true,
      value: objects.map((o) => ({ ...o, heightAsl: 100 })),
    }),
    exportPoi: async (_project, opts) => {
      const installed = opts.target === "install";
      const folderName = "e00698n4627_recovered";
      if (installed && !installedPois.some((p) => p.folderName === folderName)) {
        installedPois = [...installedPois, { folderName, byPct: true }];
      }
      const path = installed
        ? `C:/Mock/Aerofly FS 4/scenery/poi/${folderName}`
        : `C:/Mock/Exports/${folderName}`;
      return { ok: true, value: { folderName, path, installed, warnings: [] } };
    },
    uninstallPoi: async (folderName) => {
      installedPois = installedPois.filter((p) => p.folderName !== folderName);
      return { ok: true, value: undefined };
    },
    listInstalledPois: async () => installedPois,
    // Heliports. `kdag` and `lowi` stand in for the ~8k codes a real install has, so the dialog's
    // "already used on this machine" path is exercisable with no disk. Codes held by an installed
    // heliport are NOT `taken` — they come back as `ours`, which is the "replace it" path (forum #170).
    icaoStatus: async (icao) => {
      const code = icao.trim().toLowerCase();
      return {
        taken: ["kdag", "lowi"].includes(code),
        ours: installedHeliports.filter((h) => h.icao.toLowerCase() === code),
      };
    },
    installHeliport: async (_project, opts) => {
      const icao = opts.identity.icao.trim().toLowerCase();
      if (["kdag", "lowi"].includes(icao)) {
        return {
          ok: false,
          error: {
            code: "icao-taken",
            icao,
            message: `The airport code "${icao.toUpperCase()}" is already used by an airport installed on this machine. Installing over it would make that airport disappear. Pick another code.`,
          },
        };
      }
      const folderName = "e00698n4627_recovered";
      const country = opts.identity.country.trim().toLowerCase();
      installedHeliports = [
        ...installedHeliports.filter((h) => h.folderName !== folderName),
        { folderName, country, icao },
      ];
      return {
        ok: true,
        value: {
          folderName,
          path: `C:/Mock/Aerofly FS 4/scenery/airports/${country}/${folderName}`,
          installed: true,
          warnings: [],
        },
      };
    },
    listInstalledHeliports: async () => installedHeliports,
    uninstallHeliport: async (country, folderName) => {
      installedHeliports = installedHeliports.filter(
        (h) => !(h.folderName === folderName && h.country === country),
      );
      return { ok: true, value: undefined };
    },
    revealInFolder: noop,
    // No file in the preview harness — send the log to the console the previewer already has open.
    log: async (level, message) => {
      // eslint-disable-next-line no-console
      console[level === "error" ? "error" : level === "warn" ? "warn" : "info"](`[pct.log] ${message}`);
    },
    openLog: noop,
    getLogPath: async () => "",
  };

  (window as unknown as { pct: PctApi }).pct = api;
  // eslint-disable-next-line no-console
  console.info(`[mockBridge] installed — wizard path, ${catalog.xref.length} synthetic objects`);
}
