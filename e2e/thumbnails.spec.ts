// thumbnails.spec.ts — the v0.6 object-photo path end-to-end through the BUILT app, i.e. the one leg
// unit tests can't reach: a real file on disk → main's listThumbnails/getThumbnail → nativeImage resize
// → an <img> in the catalog, under the PACKAGED CSP. Two objects are seeded — one WITH a photo, one
// without — so the test proves both halves: a photo replaces the glyph, and its absence keeps it.
//
// The CSP assertion is not incidental: getThumbnail returns a `data:` URL, and if `img-src` didn't allow
// `data:` the packaged app would refuse the image with a console violation while dev (no CSP) looked fine.
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, CatalogObject, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

const launch = (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userDataDir}`], cwd: ROOT });

function watch(page: Page): { errors: Error[]; csp: string[] } {
  const errors: Error[] = [];
  const csp: string[] = [];
  page.on("pageerror", (e) => errors.push(e));
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) csp.push(m.text());
  });
  return { errors, csp };
}

// ── A minimal, correct truecolor PNG encoder, so the fixture is a real image nativeImage can decode
//    without committing a binary into a zero-assets repo. Standard CRC32 + one IDAT of filter-0 rows. ──
function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolor RGB
  const pixel = Buffer.from(rgb);
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: w }, () => pixel)]); // filter 0 + w pixels
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const PHOTO = "photo_tower";
const GLYPH = "glyph_tower";

function tower(name: string, displayName: string): CatalogObject {
  return {
    name,
    bundle: "e2e",
    source: "install",
    bbMin: [-4, -4, 0],
    bbMax: [4, 4, 26],
    bsRadius: 14,
    size: { x: 8, y: 8, z: 26 },
    category: "buildings/tower",
    displayName,
    act: true,
  };
}

/** Seed userData with a settings.json (→ editor, thumbnailsDir set) + catalog.json (two towers), and a
 *  photo folder holding one real PNG named after the PHOTO object. Returns the userData dir. */
function seed(): string {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-thumbs-"));
  const photos = path.join(userData, "photos");
  mkdirSync(photos, { recursive: true });
  writeFileSync(path.join(photos, `${PHOTO}.png`), solidPng(8, 8, [220, 40, 40]));

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
    scannedAt: "2026-07-22T00:00:00Z",
    installDir: userData,
    userXrefDir: null,
    bundles: [],
    xref: [tower(GLYPH, "Glyph Tower"), tower(PHOTO, "Photo Tower")],
    plants: [],
    airportLights: [],
    animated: [],
  };
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  writeFileSync(path.join(userData, "catalog.json"), JSON.stringify(catalog));
  return userData;
}

test("a user photo replaces the glyph for its object, and its absence keeps the glyph — under the prod CSP", async () => {
  const app = await launch(seed());
  try {
    const page = await app.firstWindow();
    const seen = watch(page);
    await expect(page.locator(".leaflet-container")).toBeVisible();

    // Objects starts collapsed now (forum #163); open the section so the seeded cards render visibly.
    await page.locator("summary.pct-section-summary").click();

    // The object WITH a photo renders an <img> whose src is the JPEG data URL main produced (proving the
    // whole main pipeline ran), and NOT the fallback glyph.
    const photoCard = page.getByRole("button", { name: "Photo Tower" });
    await expect(photoCard.locator("img.pct-thumb-photo")).toBeVisible();
    await expect(photoCard.locator("img.pct-thumb-photo")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
    await expect(photoCard.locator("svg.pct-thumb")).toHaveCount(0);

    // The object WITHOUT a photo keeps the generated category glyph (an inline SVG), no <img>.
    const glyphCard = page.getByRole("button", { name: "Glyph Tower" });
    await expect(glyphCard.locator("svg.pct-thumb")).toBeVisible();
    await expect(glyphCard.locator("img")).toHaveCount(0);

    // The data: URL must not have tripped the packaged CSP, and nothing threw.
    expect(seen.csp, seen.csp.join("\n")).toEqual([]);
    expect(seen.errors.map(String), seen.errors.join("\n")).toEqual([]);
  } finally {
    await app.close();
  }
});

// The hover-preview (forum #170/#166): resting on a card enlarges the photo AND shows the object's REAL
// catalog name — the string a photo file is named after, previously only the macOS-flaky native title.
// Driven here with a REAL mouse hover (Playwright), the one thing the browser-preview harness fakes.
test("hovering a card enlarges its photo and shows the real name; a photo-less card shows the name only", async () => {
  const app = await launch(seed());
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await page.locator("summary.pct-section-summary").click(); // Objects starts collapsed (#163)

    // A card WITH a photo → the popup carries the enlarged <img> and the raw name (PHOTO = "photo_tower",
    // not the "Photo Tower" display label the row already shows).
    await page.getByRole("button", { name: "Photo Tower" }).hover();
    const preview = page.locator(".pct-hover-preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator("img.pct-hover-preview-img")).toBeVisible();
    await expect(preview.locator(".pct-hover-preview-name")).toHaveText(PHOTO);

    // Moving off the card hides it.
    await page.getByRole("button", { name: "Rescan" }).hover();
    await expect(preview).toHaveCount(0);

    // A card WITHOUT a photo → the popup shows the real name but NO image box (name-only tooltip).
    await page.getByRole("button", { name: "Glyph Tower" }).hover();
    await expect(preview).toBeVisible();
    await expect(preview.locator(".pct-hover-preview-name")).toHaveText(GLYPH);
    await expect(preview.locator(".pct-hover-preview-imgbox")).toHaveCount(0);
  } finally {
    await app.close();
  }
});
