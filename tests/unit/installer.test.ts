import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExportPlan } from "../../src/core/project/types";
import { POI_README_MARKER } from "../../src/core/export/planExport";
import {
  FolderExistsError,
  UnsafeFolderNameError,
  listInstalledPois,
  poiRoot,
  resolvePoiPath,
  uninstallPoi,
  writePoi,
} from "../../src/main/installer";

let tmp: string; // stands in for the AFS4 user dir
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-inst-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const SAFE = "e01185n4838_munich_test";
const plan = (folderName: string, tocContent = "TOC\n"): ExportPlan => ({
  folderName,
  files: [
    { relPath: "poi.tsl", content: "TSL\n" },
    { relPath: "poi.toc", content: tocContent },
    { relPath: "README.txt", content: `Munich test\n${POI_README_MARKER}\n` },
  ],
  warnings: [],
});

describe("writePoi", () => {
  it("writes the plan's files into <root>/<folderName>/", () => {
    const root = poiRoot(tmp);
    const r = writePoi(plan(SAFE), root, { overwrite: false });
    expect(r.overwrote).toBe(false);
    expect(r.path).toBe(path.join(root, SAFE));
    expect(readFileSync(path.join(root, SAFE, "poi.toc"), "utf8")).toBe("TOC\n");
    expect(existsSync(path.join(root, SAFE, "README.txt"))).toBe(true);
  });

  it("refuses to clobber an existing folder unless overwrite is set", () => {
    const root = poiRoot(tmp);
    writePoi(plan(SAFE), root, { overwrite: false });
    expect(() => writePoi(plan(SAFE), root, { overwrite: false })).toThrow(FolderExistsError);
  });

  it("replaces the folder contents when overwrite is true", () => {
    const root = poiRoot(tmp);
    writePoi(plan(SAFE, "OLD\n"), root, { overwrite: false });
    // Drop a stray file the fresh plan doesn't include — overwrite must clear it.
    writeFileSync(path.join(root, SAFE, "stray.txt"), "x", "utf8");
    const r = writePoi(plan(SAFE, "NEW\n"), root, { overwrite: true });
    expect(r.overwrote).toBe(true);
    expect(readFileSync(path.join(root, SAFE, "poi.toc"), "utf8")).toBe("NEW\n");
    expect(existsSync(path.join(root, SAFE, "stray.txt"))).toBe(false);
  });

  it("rejects an unsafe folder name at the write boundary", () => {
    expect(() => writePoi(plan("../evil"), poiRoot(tmp), { overwrite: true })).toThrow(
      UnsafeFolderNameError,
    );
    expect(() => writePoi(plan("no_coord_prefix"), poiRoot(tmp), { overwrite: true })).toThrow(
      UnsafeFolderNameError,
    );
  });
});

describe("resolvePoiPath", () => {
  it("resolves a safe name inside its root", () => {
    expect(resolvePoiPath(poiRoot(tmp), SAFE)).toBe(path.join(poiRoot(tmp), SAFE));
  });
  it("rejects traversal and separators", () => {
    const root = poiRoot(tmp);
    expect(() => resolvePoiPath(root, "e01185n4838_x/../../y")).toThrow(UnsafeFolderNameError);
    expect(() => resolvePoiPath(root, "..")).toThrow(UnsafeFolderNameError);
  });
});

describe("uninstallPoi", () => {
  it("removes a safe-named installed folder", () => {
    writePoi(plan(SAFE), poiRoot(tmp), { overwrite: false });
    uninstallPoi(tmp, SAFE);
    expect(existsSync(path.join(poiRoot(tmp), SAFE))).toBe(false);
  });
  it("no-ops when the folder is already gone", () => {
    expect(() => uninstallPoi(tmp, SAFE)).not.toThrow();
  });
  it("refuses an unsafe name", () => {
    expect(() => uninstallPoi(tmp, "../../etc")).toThrow(UnsafeFolderNameError);
  });
});

describe("listInstalledPois", () => {
  it("marks byPct only for safe-named folders carrying the PCT README marker", () => {
    const root = poiRoot(tmp);
    writePoi(plan(SAFE), root, { overwrite: false }); // has marker → byPct
    const other = "e01185n4838_handmade";
    mkdirSync(path.join(root, other), { recursive: true });
    writeFileSync(path.join(root, other, "README.txt"), "no marker here", "utf8"); // byPct false
    mkdirSync(path.join(root, "loose_folder"), { recursive: true }); // unsafe name → byPct false
    writeFileSync(path.join(root, "afile.txt"), "x", "utf8"); // a file, ignored

    const list = listInstalledPois(tmp);
    const byName = Object.fromEntries(list.map((p) => [p.folderName, p.byPct]));
    expect(byName[SAFE]).toBe(true);
    expect(byName[other]).toBe(false);
    expect(byName["loose_folder"]).toBe(false);
    expect("afile.txt" in byName).toBe(false);
  });

  it("returns an empty list when scenery/poi does not exist", () => {
    expect(listInstalledPois(tmp)).toEqual([]);
  });
});
