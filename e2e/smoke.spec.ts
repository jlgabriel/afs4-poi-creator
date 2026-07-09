// smoke.spec.ts — M1e-6 Playwright/Electron smoke. Launches the BUILT app (out/, the prod renderer
// with the header CSP applied — ELECTRON_RENDERER_URL is unset), so it exercises the exact boot path
// the packaged installer ships. Two paths:
//   1. First run  → the wizard renders and advances (main + preload + renderer boot, one IPC round-trip).
//   2. Seeded cache → the editor renders the Leaflet map + catalog with NO CSP violations — the
//      automated half of the Fable B#6 check (the prod CSP must not refuse the Esri tiles).
// Each launch gets a throwaway --user-data-dir so it never sees (or pollutes) a real dev install's
// settings.json / catalog.json cache.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

const tempUserData = (tag: string): string => mkdtempSync(path.join(tmpdir(), `pct-e2e-${tag}-`));

const launch = (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: ROOT });

/** Watch a window for uncaught errors + any Content-Security-Policy violation console lines. */
function watch(page: Page): { errors: Error[]; csp: string[] } {
  const errors: Error[] = [];
  const csp: string[] = [];
  page.on("pageerror", (e) => errors.push(e));
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) csp.push(m.text());
  });
  return { errors, csp };
}

test("first run: boots the wizard and advances to the install step", async () => {
  const app = await launch(tempUserData("wizard"));
  try {
    const page = await app.firstWindow();
    const seen = watch(page);
    await expect(page.getByRole("heading", { name: /PCT.*POI Creation Tool/ })).toBeVisible();
    await page.getByRole("button", { name: "Get started" }).click();
    await expect(page.getByRole("heading", { name: "Aerofly FS 4 install folder" })).toBeVisible();
    expect(seen.errors.map(String), seen.errors.join("\n")).toEqual([]);
    expect(seen.csp, seen.csp.join("\n")).toEqual([]);
  } finally {
    await app.close();
  }
});

test("seeded cache: boots the editor with a live map and no CSP violations", async () => {
  const userData = tempUserData("editor");
  const settings: Settings = {
    schemaVersion: 1,
    installDir: userData, // any non-null path → decideBootPhase() picks "editor"
    afs4UserDir: null,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: "2026-07-08T00:00:00Z",
    installDir: userData,
    userXrefDir: null,
    bundles: [],
    xref: [
      {
        name: "tower00_small_plates_ds_00_08_08",
        bundle: "e2e",
        source: "install",
        bbMin: [-4, -4, 0],
        bbMax: [4, 4, 26],
        bsRadius: 14,
        size: { x: 8, y: 8, z: 26 },
        category: "buildings/tower",
        displayName: "E2E Tower",
        act: true,
      },
    ],
    plants: [],
    airportLights: [],
    animated: [],
  };
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  writeFileSync(path.join(userData, "catalog.json"), JSON.stringify(catalog));

  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    const seen = watch(page);
    // The Leaflet map mounts and the seeded object shows in the catalog panel.
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByText("E2E Tower")).toBeVisible();
    // Give Leaflet time to fire its tile requests, then assert the prod CSP didn't refuse them.
    await page.waitForTimeout(2500);
    expect(seen.csp, seen.csp.join("\n")).toEqual([]);
    expect(seen.errors.map(String), seen.errors.join("\n")).toEqual([]);
  } finally {
    await app.close();
  }
});
