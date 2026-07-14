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

const E2E_OBJECT = "tower00_small_plates_ds_00_08_08";

/** userData seeded with a settings.json + catalog.json, so decideBootPhase() lands on the editor. */
function seedEditor(tag: string): string {
  const userData = tempUserData(tag);
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
        name: E2E_OBJECT,
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
  return userData;
}

test("seeded cache: boots the editor with a live map and no CSP violations", async () => {
  const app = await launch(seedEditor("editor"));
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

// Fable I7, closed here instead of by a manual check nobody remembers to repeat. The Inspector's Copy
// button calls navigator.clipboard.writeText, while main denies EVERY permission request app-wide
// (index.ts setPermissionRequestHandler → cb(false)). Electron can route clipboard-sanitized-write
// through that handler, in which case Copy silently does nothing — a button that lies. The clipboard is
// read back from the MAIN process (Electron's own clipboard module), so this asserts the real thing and
// never needs a clipboard-READ permission in the renderer.
test("the Inspector's Copy button really reaches the clipboard (deny-all permissions notwithstanding)", async () => {
  const app = await launch(seedEditor("clipboard"));
  try {
    const page = await app.firstWindow();
    const seen = watch(page);

    // A sentinel first: if the assertion below passes, we know it was Copy that changed the clipboard.
    await app.evaluate(({ clipboard }) => clipboard.writeText("PCT_E2E_SENTINEL"));

    // Arm the catalog card, drop the object on the map (placeAt selects it) → the Inspector shows it.
    await page.getByRole("button", { name: "E2E Tower" }).click();
    await page.locator(".pct-map").click({ position: { x: 200, y: 200 } });
    await expect(page.locator(".pct-inspector .pct-field-title")).toHaveText("E2E Tower");

    // The button's accessible name is its CONTENT ("Copy"); the title is only a fallback.
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(E2E_OBJECT);

    expect(seen.errors.map(String), seen.errors.join("\n")).toEqual([]);
  } finally {
    await app.close();
  }
});
