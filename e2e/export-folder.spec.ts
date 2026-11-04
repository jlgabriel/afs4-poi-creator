// export-folder.spec.ts — "A folder I choose…" through the BUILT app: the real preload bridge and IPC
// handler, a real folder on disk, and only the OS folder picker and file manager stubbed. Covers what main
// must remember between calls, which unit tests can't reach: the folder of a refused export for the
// confirmed retry, and where the last export landed for Reveal.
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog, Project, Settings } from "../src/core/project/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = path.join(ROOT, "out", "main", "index.js");
const FOLDER = "e00698n4626_folder_e2e";

const project = (lon: number, label: string): Project => ({
  schemaVersion: 1,
  app: "pct",
  name: "Folder e2e",
  poiName: "folder_e2e",
  createdAt: "2026-11-04T00:00:00.000Z",
  modifiedAt: "2026-11-04T00:00:00.000Z",
  reference: null,
  camera: { lon, lat: 46.25, zoom: 15 },
  objects: [
    {
      id: "x1",
      kind: "xref",
      position: { lon, lat: 46.2569 },
      height: { mode: "terrain" },
      name: "tower_e2e",
      direction: 37,
      scale: 1,
      label,
    },
  ],
});

function seed(): { userData: string; chosen: string; poi: string } {
  const userData = mkdtempSync(path.join(tmpdir(), "pct-e2e-folder-"));
  const afs4UserDir = path.join(userData, "afs4user");
  const poi = path.join(afs4UserDir, "scenery", "poi");
  const chosen = path.join(userData, "chosen");
  mkdirSync(poi, { recursive: true });
  mkdirSync(chosen);
  const settings: Settings = {
    schemaVersion: 1,
    installDir: userData, // any non-null path → decideBootPhase() picks "editor"
    afs4UserDir,
    thumbnailsDir: null,
    tapDir: null,
    tiles: { provider: "esri" },
    elevation: { provider: "open-meteo" },
    recentProjects: [],
    lastScanAt: null,
  };
  const catalog: Catalog = {
    schemaVersion: 1,
    scannedAt: "2026-11-04T00:00:00Z",
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
  return { userData, chosen, poi };
}

type Exported = {
  ok: boolean;
  value: { folderName: string; path: string; warnings: string[] } | null;
  error?: { code: string };
};
type Pct = {
  exportPoi: (p: Project, o: unknown) => Promise<Exported>;
  revealInFolder: (folderName: string) => Promise<void>;
};
type Stubs = { picks: number; answers: string[]; reveals: string[] };
const stubs = (): Stubs => (globalThis as unknown as { __stubs: Stubs }).__stubs;

function driver(app: ElectronApplication, page: Page) {
  return {
    stub: () =>
      app.evaluate(({ dialog, shell }) => {
        const s: Stubs = { picks: 0, answers: [], reveals: [] };
        (globalThis as unknown as { __stubs: Stubs }).__stubs = s;
        dialog.showOpenDialog = (async () => {
          s.picks++;
          const a = s.answers.shift();
          return a === undefined ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: [a] };
        }) as typeof dialog.showOpenDialog;
        shell.showItemInFolder = (p: string) => void s.reveals.push(p);
      }),
    answer: (folder: string) =>
      app.evaluate((_, f) => void (globalThis as unknown as { __stubs: Stubs }).__stubs.answers.push(f), folder),
    state: () => app.evaluate(() => (globalThis as unknown as { __stubs: Stubs }).__stubs),
    run: (p: Project, target: "install" | "choose-folder", overwrite: boolean): Promise<Exported> =>
      page.evaluate(
        ([pr, t, o]) =>
          (window as unknown as { pct: Pct }).pct.exportPoi(pr, { target: t, overwrite: o, baseElevation: 100 }),
        [p, target, overwrite] as const,
      ),
    reveal: (name: string) =>
      page.evaluate((n) => (window as unknown as { pct: Pct }).pct.revealInFolder(n), name),
  };
}

const labelIn = (dir: string): string =>
  (JSON.parse(readFileSync(path.join(dir, "__folder_e2e.json"), "utf8")) as Project).objects[0]!.label!;

test("export to a folder: Reveal finds it, a confirmed replace asks once, a POI never nests", async () => {
  const { userData, chosen, poi } = seed();
  const app = await electron.launch({ args: [MAIN, `--user-data-dir=${userData}`], cwd: ROOT });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    const d = driver(app, page);
    await d.stub();
    const dest = path.join(chosen, FOLDER);

    // Reveal goes to the chosen folder, even with a same-named POI installed earlier.
    expect((await d.run(project(6.98, "installed"), "install", false)).ok).toBe(true);
    await d.answer(chosen);
    const first = await d.run(project(6.98, "v1"), "choose-folder", false);
    expect(first.value?.path).toBe(dest);
    await d.reveal(FOLDER);
    await expect.poll(async () => (await d.state()).reveals).toEqual([dest]);

    // Same folder again: refused, then the confirmed retry writes there without a second picker.
    await d.answer(chosen);
    const refused = await d.run(project(6.98, "v2"), "choose-folder", false);
    expect(refused.error?.code).toBe("folder-exists");
    expect(labelIn(dest)).toBe("v1");
    expect((await d.state()).picks).toBe(2);
    const replaced = await d.run(project(6.98, "v2"), "choose-folder", true);
    expect(replaced.value?.path).toBe(dest);
    expect((await d.state()).picks).toBe(2);
    expect(labelIn(dest)).toBe("v2");

    // Picking the POI's own folder means its parent: the same refusal, the same replace, no nesting.
    await d.answer(dest);
    const own = await d.run(project(6.98, "v3"), "choose-folder", false);
    expect(own.error?.code).toBe("folder-exists");
    const ownReplaced = await d.run(project(6.98, "v3"), "choose-folder", true);
    expect(ownReplaced.value?.path).toBe(dest);
    expect(labelIn(dest)).toBe("v3");
    expect(readdirSync(dest)).not.toContain(FOLDER);

    // Moved far with the anchor on Auto: a new folder, and the export says so.
    await d.answer(chosen);
    const moved = await d.run(project(7.1, "v4"), "choose-folder", false);
    expect(moved.value?.folderName).toBe("e00710n4626_folder_e2e");
    expect(moved.value?.warnings.join(" ")).toContain(FOLDER);

    // Same in the sim's folder, where the old copy keeps loading.
    const movedInstall = await d.run(project(7.1, "v4"), "install", false);
    expect(movedInstall.value?.warnings.join(" ")).toContain(`still installed: ${FOLDER}`);
    expect(readdirSync(poi).sort()).toEqual([FOLDER, "e00710n4626_folder_e2e"]);
  } finally {
    await app.close();
  }
});
