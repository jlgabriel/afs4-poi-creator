// devFixtures.ts — a small self-contained catalog + project for the browser preview harness
// (`npm run preview:renderer`, where window.pct is undefined). `useBootstrap` seeds these when there
// is no IPC bridge, so the map + panels are visible and interactive without a real scan. This is dev
// scaffolding, NOT shipped behaviour: it is only referenced on the no-pct branch, which never runs
// inside Electron (where getCachedCatalog / the wizard provide the real catalog). Extracted verbatim
// from the M1e-4 App.tsx harness.
import type { Catalog, CatalogAirportLight, CatalogObject, Project } from "../../core/project/types";
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
  plants: [],
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
  return p;
}
