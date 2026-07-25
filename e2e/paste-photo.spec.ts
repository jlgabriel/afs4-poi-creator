// paste-photo.spec.ts — v0.7 "Paste photo" end-to-end through the BUILT app: right-click a catalog card →
// the menu → Paste writes the CLIPBOARD image to <thumbnailsDir>/<name>.png (main reads the clipboard, the
// renderer only NAMES the object — P0-2) → the card swaps its glyph for the photo. Then Remove deletes the
// file (behind the confirm) and the glyph returns. Real Electron bridge + a real on-disk folder, like
// thumbnails.spec.ts — the one leg unit tests can't reach: the clipboard read and the disk write.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, CatalogObject, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");
const OBJ = "tower_e2e"; // catalog name → the file is written as tower_e2e.png, by construction
// A user-registered XREF (v0.3) whose name carries a `-` — the forum #176 shape. Before the fix the photo
// guard was `[A-Za-z0-9_]+`, so Paste threw "unsafe photo name" AND a hand-named file was skipped at index
// time, which is why the user couldn't get it to show "no matter how I change the name".
const DASH_OBJ = "cabin-boat-red";

// A 1×1 PNG as a data URL — enough for clipboard.writeImage to hand the paste handler a non-empty image.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const launch = (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: ROOT });

function tower(
  name: string,
  displayName = "Tower E2E",
  source: "install" | "user" = "install",
): CatalogObject {
  return {
    name,
    bundle: "e2e",
    source,
    bbMin: [-4, -4, 0],
    bbMax: [4, 4, 26],
    bsRadius: 14,
    size: { x: 8, y: 8, z: 26 },
    category: "buildings/tower",
    displayName,
    act: true,
  };
}

/** Seed userData → editor boot, an EMPTY photo folder chosen in Settings, and two photo-less towers:
 *  a built-in one and a user-registered one whose name has a `-` (#176). */
function seed(): { userData: string; photos: string } {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-paste-"));
  const photos = path.join(userData, "photos");
  mkdirSync(photos, { recursive: true });
  const settings: Settings = {
    schemaVersion: 1,
    installDir: userData, // any non-null path → decideBootPhase() picks "editor"
    afs4UserDir: null,
    thumbnailsDir: photos,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: "2026-07-24T00:00:00Z",
    installDir: userData,
    userXrefDir: null,
    bundles: [],
    xref: [tower(OBJ), tower(DASH_OBJ, "Cabin Boat Red", "user")],
    plants: [],
    airportLights: [],
    animated: [],
  };
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  writeFileSync(path.join(userData, "catalog.json"), JSON.stringify(catalog));
  return { userData, photos };
}

test("right-click Paste writes the clipboard image as the object's photo; Remove deletes it and the glyph returns", async () => {
  const { userData, photos } = seed();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await page.locator("summary.pct-section-summary").click(); // Objects starts collapsed (#163)

    const card = page.getByRole("button", { name: "Tower E2E" });
    await expect(card.locator("svg.pct-thumb")).toBeVisible(); // starts on the glyph — no photo yet

    // Put a real image on the OS clipboard from the main process (main reads it; the renderer never sends
    // the bytes — P0-2). This is the in-sim Win+Shift+S capture, staged deterministically.
    await app.evaluate(({ clipboard, nativeImage }, url) => {
      clipboard.writeImage(nativeImage.createFromDataURL(url));
    }, PNG_1x1);

    // Right-click → menu → Paste. The menu header shows the exact name the file is saved as.
    await card.click({ button: "right" });
    const menu = page.locator(".pct-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator(".pct-context-menu-name")).toHaveText(OBJ);
    await menu.getByRole("menuitem", { name: "Paste photo from clipboard" }).click();

    // The card swaps its glyph for the pasted photo (served back as a downscaled JPEG data URL)…
    await expect(card.locator("img.pct-thumb-photo")).toBeVisible();
    await expect(card.locator("img.pct-thumb-photo")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await expect(card.locator("svg.pct-thumb")).toHaveCount(0);
    // …and the file is really on disk, named by construction.
    expect(existsSync(path.join(photos, `${OBJ}.png`))).toBe(true);

    // Remove (accept the native confirm) → the file is deleted and the card falls back to its glyph.
    page.once("dialog", (d) => void d.accept());
    await card.click({ button: "right" });
    await page.locator(".pct-context-menu").getByRole("menuitem", { name: "Remove photo" }).click();
    await expect(card.locator("svg.pct-thumb")).toBeVisible();
    await expect(card.locator("img.pct-thumb-photo")).toHaveCount(0);
    expect(readdirSync(photos)).toEqual([]);
  } finally {
    await app.close();
  }
});

test("a user-registered XREF whose name has a `-` can be pasted too (forum #176)", async () => {
  const { userData, photos } = seed();
  const app = await launch(userData);
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await page.locator("summary.pct-section-summary").click();

    const card = page.getByRole("button", { name: "Cabin Boat Red" });
    await expect(card.locator("svg.pct-thumb")).toBeVisible();

    await app.evaluate(({ clipboard, nativeImage }, url) => {
      clipboard.writeImage(nativeImage.createFromDataURL(url));
    }, PNG_1x1);

    await card.click({ button: "right" });
    const menu = page.locator(".pct-context-menu");
    await expect(menu.locator(".pct-context-menu-name")).toHaveText(DASH_OBJ);
    await menu.getByRole("menuitem", { name: "Paste photo from clipboard" }).click();

    // No "unsafe photo name" error line, the file lands under the dashed stem, and — the half that used
    // to fail silently even when the file was named by hand — indexing serves it back to the card.
    await expect(menu.locator(".pct-context-menu-error")).toHaveCount(0);
    expect(existsSync(path.join(photos, `${DASH_OBJ}.png`))).toBe(true);
    await expect(card.locator("img.pct-thumb-photo")).toBeVisible();
  } finally {
    await app.close();
  }
});
