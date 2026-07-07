import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afs4UserDir,
  detectInstallDirs,
  detectUserDir,
  findTmi,
  resolveXrefDir,
} from "../../src/main/afs4Paths";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-paths-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function touch(rel: string): void {
  const full = path.join(tmp, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, "");
}

describe("findTmi", () => {
  it("collects .tmi recursively (case-insensitive), ignores others, tolerates missing dirs", () => {
    touch("scenery/xref/a.tmi");
    touch("scenery/xref/sub/b.TMI");
    touch("scenery/xref/readme.txt");
    const found = findTmi(path.join(tmp, "scenery", "xref"))
      .map((p) => path.basename(p))
      .sort();
    expect(found).toEqual(["a.tmi", "b.TMI"]);
    expect(findTmi(path.join(tmp, "does", "not", "exist"))).toEqual([]);
  });
});

describe("resolveXrefDir", () => {
  it("finds scenery/xref under an install root", () => {
    touch("scenery/xref/a.tmi");
    expect(resolveXrefDir(tmp)).toBe(path.join(tmp, "scenery", "xref"));
  });
  it("accepts an xref dir passed directly", () => {
    touch("xref/a.tmi");
    expect(resolveXrefDir(path.join(tmp, "xref"))).toBe(path.join(tmp, "xref"));
  });
  it("returns null when there is no xref", () => {
    expect(resolveXrefDir(tmp)).toBeNull();
  });
});

describe("path auto-detection (platform-dependent, must never throw)", () => {
  it("afs4UserDir names the AFS4 folder for this OS", () => {
    expect(afs4UserDir()).toContain("Aerofly FS 4");
  });
  it("detectInstallDirs returns an array (possibly empty)", () => {
    expect(Array.isArray(detectInstallDirs())).toBe(true);
  });
  it("detectUserDir returns a string or null", () => {
    const d = detectUserDir();
    expect(d === null || typeof d === "string").toBe(true);
  });
});
