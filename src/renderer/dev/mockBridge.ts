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

  const catalog = buildBigCatalog();
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
