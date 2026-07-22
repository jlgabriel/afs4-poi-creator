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
import type { InstalledPoi, PctApi } from "../../shared/pctApi";

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
    plants: [],
    airportLights: [],
    animated: [],
  };
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
    // No real disk in the preview harness → no photos; every card keeps its glyph (the fallback path).
    listThumbnails: async () => [],
    getThumbnail: async () => null,
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
    revealInFolder: noop,
  };

  (window as unknown as { pct: PctApi }).pct = api;
  // eslint-disable-next-line no-console
  console.info(`[mockBridge] installed — wizard path, ${catalog.xref.length} synthetic objects`);
}
