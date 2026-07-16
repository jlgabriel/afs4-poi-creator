// devFixtures.ts — a small self-contained catalog + project for the browser preview harness
// (`npm run preview:renderer`, where window.pct is undefined). `useBootstrap` seeds these when there
// is no IPC bridge, so the map + panels are visible and interactive without a real scan. This is dev
// scaffolding, NOT shipped behaviour: it is only referenced on the no-pct branch, which never runs
// inside Electron (where getCachedCatalog / the wizard provide the real catalog). Extracted verbatim
// from the M1e-4 App.tsx harness.
import type {
  Catalog,
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  Project,
} from "../../core/project/types";
import { buildPlants } from "../../core/catalog/plants";
import * as mutate from "../../core/project/mutate";

// A couple of real object names/dimensions from the in-sim matrix (V2/V3), boxed symmetrically about
// the origin for the demo (the true asymmetric bbMin/bbMax come from the scanner in the real app).
function demoObject(
  name: string,
  displayName: string,
  category: string,
  [x, y, z]: [number, number, number],
): CatalogObject {
  return {
    name,
    bundle: "demo",
    source: "install",
    bbMin: [-x / 2, -y / 2, 0],
    bbMax: [x / 2, y / 2, z],
    bsRadius: Math.hypot(x, y, z) / 2,
    size: { x, y, z },
    category,
    displayName,
    act: true,
  };
}

export const TOWER = "tower00_small_plates_ds_00_08_08";
export const HANGAR = "hangar_small_plates_ds_02_15_42";

function demoLight(typeName: string, displayName: string, category: string): CatalogAirportLight {
  return { typeName, folder: `al_${typeName}`, source: "install", category, displayName };
}

/** Demo plants, derived by running the REAL scanner over real install filenames rather than
 *  hand-writing CatalogPlant literals. Two reasons: the harness then exercises the same parse the app
 *  does (a filename the regex can't read shows up here, not only in-sim), and the values can't drift
 *  from the scanner's output. All 6 groups are represented, with 2 in the ones that have siblings —
 *  enough for the palette's group blocks and its "same tree, different height" cards to be visible.
 *  A 1-per-list fixture is how the last window bug hid from the harness. */
const DEMO_PLANTS: CatalogPlant[] = buildPlants(
  [
    "alley__i00__h2740_color",
    "broadleaf__i00__h1750_color",
    "broadleaf__i01__h1650_color",
    "conifer__i00__h1700_color",
    "conifer__i08__h0850_color",
    "conifer_forest__i01__h2820_color",
    "palm__i08__h2700_color",
    "shrub__i11__h0080_color",
  ].map((base) => ({ base })),
).plants;

export const PALM = DEMO_PLANTS.find((p) => p.group === "palm")!;

export const DEMO_CATALOG: Catalog = {
  schemaVersion: 1,
  scannedAt: "2026-07-07T00:00:00Z",
  installDir: "(demo)",
  userXrefDir: null,
  bundles: [],
  xref: [
    demoObject(TOWER, "Tower00 Small Plates", "buildings/tower", [8.19, 7.99, 25.9]),
    demoObject(HANGAR, "Hangar Small Plates", "airport/hangar", [15.45, 41.28, 6.83]),
  ],
  plants: DEMO_PLANTS,
  airportLights: [
    demoLight("runway_edge_light", "Runway Edge Light", "lights/runway"),
    demoLight("papi_3_light", "Papi 3 Light", "lights/papi"),
    demoLight("helipad_beacon", "Helipad Beacon", "lights/helipad"),
  ],
  animated: [],
};

export function demoProject(): Project {
  let p = mutate.createProject({
    name: "Demo (preview harness)",
    poiName: "demo",
    camera: { lon: 11.86, lat: 48.37, zoom: 18 },
  });
  p = mutate.addObject(p, mutate.createXref(TOWER, { lon: 11.86, lat: 48.37 }));
  p = mutate.addObject(p, mutate.createXref(HANGAR, { lon: 11.8604, lat: 48.3703 }, { direction: 90 }));
  p = mutate.addObject(
    p,
    mutate.createAirportLight("runway_edge_light", { lon: 11.8597, lat: 48.3698 }, { configuration: "wr" }),
  );
  p = mutate.addObject(
    p,
    mutate.createLight({ lon: 11.8594, lat: 48.3701 }, { color: [1, 0, 0], intensity: 10000 }),
  );
  p = mutate.addObject(
    p,
    mutate.createPlant(PALM.group, PALM.species, PALM.naturalHeight, { lon: 11.8607, lat: 48.3699 }),
  );
  // Two things DELIBERATELY absent from DEMO_CATALOG — the "shared project references something you
  // don't have" case, so the missing (red-dashed) state is drivable in the preview harness without a
  // real scan. The plant uses a REAL group with a species that group doesn't have: a plant's identity
  // is a pair, so its interesting failure is a half-valid one, not a wholly invented name.
  p = mutate.addObject(
    p,
    mutate.createAirportLight("pct_demo_missing_fixture", { lon: 11.8591, lat: 48.3696 }),
  );
  p = mutate.addObject(p, mutate.createPlant("palm", "00", 20, { lon: 11.861, lat: 48.3696 }));
  return p;
}
