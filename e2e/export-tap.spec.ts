// export-tap.spec.ts — "Export TAP" through the BUILT app: the real preload bridge, the real IPC handler
// and a real folder on disk. The `.tap` text itself is golden-tested in tests/unit/tap.test.ts; this covers
// the leg unit tests can't reach — Settings → main resolves the folder → one file lands → a second export
// is refused until it says overwrite, and a cleared folder is refused with its own code.
import { test, expect, _electron as electron } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Project, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

/** An airport with a helipad and one XREF — no lights and a typed elevation, so the export needs no
 *  elevation lookup. */
const PROJECT: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "TAP e2e",
  poiName: "tap_e2e",
  createdAt: "2026-10-12T00:00:00.000Z",
  modifiedAt: "2026-10-12T00:00:00.000Z",
  reference: null,
  camera: { lon: 6.98, lat: 46.25, zoom: 15 },
  objects: [
    {
      id: "x1",
      kind: "xref",
      position: { lon: 6.9847, lat: 46.2569 },
      height: { mode: "terrain" },
      name: "tower_e2e",
      direction: 37,
      scale: 1,
    },
  ],
  airport: {
    icao: "pcte2e",
    name: "TAP E2E Field",
    country: "ch",
    position: { lon: 6.988, lat: 46.2554 },
    elevation: 512,
    pads: [{ id: "h1", name: "", position: { lon: 6.988, lat: 46.2554 }, heading: 92, radius: 10 }],
  },
};

function seed(): { userData: string; tapDir: string } {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-tap-"));
  const tapDir = path.join(userData, "airports_tap");
  mkdirSync(tapDir, { recursive: true });
  const settings: Settings = {
    schemaVersion: 1,
    installDir: userData, // any non-null path → decideBootPhase() picks "editor"
    afs4UserDir: null,
    thumbnailsDir: null,
    tapDir,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: "2026-10-12T00:00:00Z",
    installDir: userData,
    userXrefDir: null,
    bundles: [],
    xref: [],
    plants: [],
    airportLights: [],
    animated: [],
  };
  writeFileSync(path.join(userData, "settings.json"), JSON.stringify(settings));
  writeFileSync(path.join(userData, "catalog.json"), JSON.stringify(catalog));
  return { userData, tapDir };
}

test("Export TAP writes <ICAO>.tap into the TAP folder, and replaces it only when told to", async () => {
  const { userData, tapDir } = seed();
  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${userData}`], cwd: ROOT });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export TAP…" })).toBeEnabled();

    type Pct = { exportTap: (p: Project, o: { overwrite: boolean }) => Promise<unknown> };
    const exportTap = (overwrite: boolean): Promise<unknown> =>
      page.evaluate(
        ([p, o]) => (window as unknown as { pct: Pct }).pct.exportTap(p, { overwrite: o }),
        [PROJECT, overwrite] as const,
      );

    const first = (await exportTap(false)) as { ok: boolean; value: { fileName: string; path: string } };
    expect(first.ok).toBe(true);
    expect(first.value.fileName).toBe("PCTE2E.tap");
    expect(readdirSync(tapDir)).toEqual(["PCTE2E.tap"]); // ONE file, nothing beside it
    const text = readFileSync(path.join(tapDir, "PCTE2E.tap"), "utf8");
    expect(text.startsWith("<[file][][]\n    <[tm_airport_pd][][]\n")).toBe(true);
    expect(text).toContain("<[stringt8c][icao][PCTE2E]>");
    expect(text).toContain("<[string8][name][tower_e2e]>");
    expect(text).toContain("<[float64][elevation][512]>");

    writeFileSync(path.join(tapDir, "PCTE2E.tap"), "edited by hand");
    const again = (await exportTap(false)) as { ok: boolean; error: { code: string; fileName: string } };
    expect(again.ok).toBe(false);
    expect(again.error).toMatchObject({ code: "file-exists", fileName: "PCTE2E.tap" });
    expect(readFileSync(path.join(tapDir, "PCTE2E.tap"), "utf8")).toBe("edited by hand");

    const replaced = (await exportTap(true)) as { ok: boolean };
    expect(replaced.ok).toBe(true);
    expect(readFileSync(path.join(tapDir, "PCTE2E.tap"), "utf8")).toBe(text);

    await page.evaluate(() =>
      (window as unknown as { pct: { setSettings: (p: object) => Promise<unknown> } }).pct.setSettings({ tapDir: null }),
    );
    const noDir = (await exportTap(true)) as { ok: boolean; error: { code: string } };
    expect(noDir.error.code).toBe("no-tap-dir");
    expect(existsSync(path.join(tapDir, "PCTE2E.tap"))).toBe(true);
  } finally {
    await app.close();
  }
});
