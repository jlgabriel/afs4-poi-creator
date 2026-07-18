import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExportPlan } from "../../src/core/project/types";
import { POI_README_MARKER } from "../../src/core/export/planExport";
import {
  FolderExistsError,
  MissingAssetsDirError,
  UnsafeAssetNameError,
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
  assets: [],
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

  // Fable I5. writePoi used to write straight into the destination, deleting the previous POI FIRST on an
  // overwrite — so a failure part-way through (a full disk) destroyed the working POI and left a partial
  // one in its place. Now it stages the whole thing beside the destination and swaps it in with one rename.
  //
  // The failure is injected portably: file 2's relPath nests UNDER file 1's filename, so mkdirSync of its
  // parent hits an existing FILE and throws (EEXIST/ENOTDIR) half-way through the loop.
  const brokenPlan = (folderName: string): ExportPlan => ({
    folderName,
    files: [
      { relPath: "poi.tsl", content: "TSL\n" },
      { relPath: "poi.tsl/nope.txt", content: "boom" }, // parent is a file → mkdir throws
    ],
    assets: [],
    warnings: [],
  });

  it("leaves the PREVIOUS POI intact when an overwrite fails part-way through", () => {
    const root = poiRoot(tmp);
    writePoi(plan(SAFE, "GOOD\n"), root, { overwrite: false });
    expect(() => writePoi(brokenPlan(SAFE), root, { overwrite: true })).toThrow();
    // the old POI is still there, complete and unharmed — not deleted, not half-replaced
    expect(readFileSync(path.join(root, SAFE, "poi.toc"), "utf8")).toBe("GOOD\n");
    expect(existsSync(path.join(root, SAFE, "README.txt"))).toBe(true);
  });

  it("leaves NO partial POI behind when a fresh write fails part-way through", () => {
    const root = poiRoot(tmp);
    expect(() => writePoi(brokenPlan(SAFE), root, { overwrite: false })).toThrow();
    expect(existsSync(path.join(root, SAFE))).toBe(false); // no half-written POI in scenery/poi/
    expect(readdirSync(root)).toEqual([]); // and no staging scratch left lying around either
  });
});

describe("writePoi — bundled assets (v0.4 plant anchor)", () => {
  const withAssets = (folderName: string, assets: string[]): ExportPlan => ({ ...plan(folderName), assets });

  it("copies each plan asset from assetsDir into the POI folder", () => {
    const root = poiRoot(tmp);
    const assetsDir = mkdtempSync(path.join(os.tmpdir(), "pct-assets-"));
    writeFileSync(path.join(assetsDir, "pct_anchor.tmb"), "MESH", "utf8");
    writeFileSync(path.join(assetsDir, "pct_anchor.ttx"), "TEX", "utf8");
    try {
      writePoi(withAssets(SAFE, ["pct_anchor.tmb", "pct_anchor.ttx"]), root, { overwrite: false, assetsDir });
      expect(readFileSync(path.join(root, SAFE, "pct_anchor.tmb"), "utf8")).toBe("MESH");
      expect(readFileSync(path.join(root, SAFE, "pct_anchor.ttx"), "utf8")).toBe("TEX");
    } finally {
      rmSync(assetsDir, { recursive: true, force: true });
    }
  });

  it("throws MissingAssetsDirError — and stages nothing — when an asset is required but no assetsDir given", () => {
    const root = poiRoot(tmp);
    expect(() => writePoi(withAssets(SAFE, ["pct_anchor.tmb"]), root, { overwrite: false })).toThrow(
      MissingAssetsDirError,
    );
    expect(existsSync(path.join(root, SAFE))).toBe(false); // no half-built POI left behind
  });

  it("rejects an asset name that isn't a plain basename at the write boundary", () => {
    expect(() =>
      writePoi(withAssets(SAFE, ["../evil.tmb"]), poiRoot(tmp), { overwrite: false, assetsDir: tmp }),
    ).toThrow(UnsafeAssetNameError);
  });

  it("an asset-free plan (the common xref/light-only POI) needs no assetsDir", () => {
    expect(writePoi(plan(SAFE), poiRoot(tmp), { overwrite: false }).overwrote).toBe(false);
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

  it("ignores a staging folder left behind by an interrupted write", () => {
    const root = poiRoot(tmp);
    writePoi(plan(SAFE), root, { overwrite: false });
    mkdirSync(path.join(root, `${SAFE}.pct-staging`), { recursive: true }); // crash scratch
    expect(listInstalledPois(tmp).map((p) => p.folderName)).toEqual([SAFE]);
  });
});
