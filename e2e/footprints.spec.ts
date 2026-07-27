// footprints.spec.ts — v0.9 footprint overrides end-to-end through the BUILT app: right-click an airport
// light → Set footprint… → three metres → main writes `<userData>/footprints.json` → the card shows the
// size, and a SECOND LAUNCH still shows it.
//
// That second launch is the whole reason this test exists. Everything up to the write is unit-tested
// (core/catalog/footprints, main/footprints, renderer/map/footprintBox), but the leg unit tests cannot
// reach is the one where a measurement is silently lost: main persisting it, and the next boot reading it
// back and applying it over a freshly loaded catalog. The user typed those numbers off a model by hand —
// losing them on restart is the worst thing this feature could do.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

// A Runway Approach fixture — the family from forum #126/#129, whose members differ ONLY in size and so
// were all the same dot on the map. Its photo key (and therefore its footprint key) is the namespaced form.
const LIGHT_TYPE = "runway_approach_light_center_2";
const LIGHT_LABEL = "Runway Approach Light Center 2";
const KEY = `light.${LIGHT_TYPE}`;
// ApfelFlieger's own measurement of this fixture: 2 lights, 2.0 × 0.5 × 4.0 m (#129).
const W = "2.0";
const D = "0.5";
const H = "4.0";

const launch = (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: ROOT });

/** Seed userData → editor boot with one airport light and no footprints file. */
function seed(): string {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-footprints-"));
  const settings: Settings = {
    schemaVersion: 1,
    installDir: userData, // any non-null path → decideBootPhase() picks "editor"
    afs4UserDir: null,
    thumbnailsDir: null,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: "2026-07-27T00:00:00Z",
    installDir: userData,
    userXrefDir: null,
    bundles: [],
    xref: [],
    plants: [],
    airportLights: [
      {
        typeName: LIGHT_TYPE,
        folder: `al_${LIGHT_TYPE}`,
        source: "install",
        category: "lights/approach",
        displayName: LIGHT_LABEL,
      },
    ],
    animated: [],
  };
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  writeFileSync(path.join(userData, "catalog.json"), JSON.stringify(catalog));
  return userData;
}

/** Open the Lights section (all three start collapsed, #163) and return the fixture's card. */
async function lightCard(page: Page) {
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.locator("summary.pct-lights-summary", { hasText: "Lights" }).click();
  return page.getByRole("button", { name: LIGHT_LABEL });
}

test("a measured airport light keeps its footprint across a restart, and the file is the user's own", async () => {
  const userData = seed();
  const file = path.join(userData, "footprints.json");

  const first = await launch(userData);
  try {
    const page = await first.firstWindow();
    const card = await lightCard(page);
    // Before: no size anywhere — the state forum #126 reported.
    await expect(card).toHaveAttribute("title", LIGHT_TYPE);
    expect(existsSync(file)).toBe(false);

    await card.click({ button: "right" });
    const menu = page.locator(".pct-context-menu");
    await expect(menu.locator(".pct-context-menu-name")).toHaveText(KEY);
    await menu.getByRole("menuitem", { name: "Set footprint…" }).click();

    const dialog = page.locator('[aria-label="Edit footprint"]');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Width (X)").fill(W);
    await dialog.getByLabel("Depth (Y)").fill(D);
    await dialog.getByLabel("Height (Z)").fill(H);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    // The card carries the measurement…
    await expect(card).toHaveAttribute("title", `${LIGHT_TYPE} · 2.0 × 0.5 × 4.0 m`);
    // …and main really wrote it, under the derived key, with no path escape and no renderer-side naming.
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      schemaVersion: 1,
      entries: { [KEY]: { width: 2, depth: 0.5, height: 4 } },
    });
  } finally {
    await first.close();
  }

  // THE POINT: a second launch reads the file and applies it over the freshly loaded catalog.
  const second = await launch(userData);
  try {
    const page = await second.firstWindow();
    const card = await lightCard(page);
    await expect(card).toHaveAttribute("title", `${LIGHT_TYPE} · 2.0 × 0.5 × 4.0 m`);

    // And it can be taken back off: the menu now offers Edit, and Remove clears both card and file.
    await card.click({ button: "right" });
    await page.locator(".pct-context-menu").getByRole("menuitem", { name: "Edit footprint…" }).click();
    const dialog = page.locator('[aria-label="Edit footprint"]');
    // The dialog opens on the SAVED numbers, not on blanks.
    await expect(dialog.getByLabel("Width (X)")).toHaveValue("2");
    await dialog.getByRole("button", { name: "Remove measurement" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveAttribute("title", LIGHT_TYPE);
    expect(JSON.parse(readFileSync(file, "utf8")).entries).toEqual({});
  } finally {
    await second.close();
  }
});
