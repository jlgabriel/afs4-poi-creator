// no-install.spec.ts — PCT without Aerofly FS 4, through the BUILT app: the wizard's way out, the real
// scan with no install, the reopen that must not ask again, and an export that reaches the disk.
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");

const launch = (userData: string): Promise<ElectronApplication> =>
  electron.launch({ args: [MAIN, `--user-data-dir=${userData}`], cwd: ROOT });

/** An airport holding an object the empty catalog does not know. */
const PROJECT: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "No install",
  poiName: "no_install",
  createdAt: "2026-11-07T00:00:00.000Z",
  modifiedAt: "2026-11-07T00:00:00.000Z",
  reference: null,
  camera: { lon: 6.98, lat: 46.25, zoom: 15 },
  objects: [
    {
      id: "x1",
      kind: "xref",
      position: { lon: 6.9847, lat: 46.2569 },
      height: { mode: "terrain" },
      name: "someone_elses_tower",
      direction: 37,
      scale: 1,
    },
  ],
  airport: {
    icao: "pctn01",
    name: "No Install Field",
    country: "ch",
    position: { lon: 6.988, lat: 46.2554 },
    elevation: 512,
    pads: [{ id: "h1", name: "", position: { lon: 6.988, lat: 46.2554 }, heading: 92, radius: 10 }],
  },
};

test("continues without an install, stays that way on reopen, and still exports a .tap", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-noinstall-"));
  const tapDir = path.join(userData, "airports_tap");
  mkdirSync(tapDir, { recursive: true });

  const first = await launch(userData);
  try {
    const page = await first.firstWindow();
    await page.getByRole("button", { name: "Continue without Aerofly FS 4" }).click();
    await expect(page.getByRole("heading", { name: "Ready, without Aerofly FS 4" })).toBeVisible();
    await page.getByRole("button", { name: "Open editor" }).click();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.getByText("Plants (0)")).toBeVisible();
  } finally {
    await first.close();
  }

  const settingsFile = path.join(userData, "settings.json");
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  expect(settings.installDir).toBeNull();
  writeFileSync(settingsFile, JSON.stringify({ ...settings, tapDir }));

  const second = await launch(userData);
  try {
    const page = await second.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible(); // no wizard this time
    type Pct = { exportTap: (p: Project, o: { overwrite: boolean }) => Promise<{ ok: boolean }> };
    const res = await page.evaluate(
      (p) => (window as unknown as { pct: Pct }).pct.exportTap(p, { overwrite: false }),
      PROJECT,
    );
    expect(res.ok).toBe(true);
    const tap = path.join(tapDir, "PCTN01.tap");
    expect(existsSync(tap)).toBe(true);
    expect(readFileSync(tap, "utf8")).toContain("<[string8][name][someone_elses_tower]>");
  } finally {
    await second.close();
  }
});
