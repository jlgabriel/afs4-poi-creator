// The main-side half of v0.9: `<userData>/footprints.json`. The core module owns the shape (see
// footprints.test.ts); this covers what happens at the FILE — which is where the user's typed
// measurements can actually be lost.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  footprintsFile,
  readFootprints,
  readFootprintsFile,
  writeFootprints,
} from "../../src/main/footprints";
import { EMPTY_FOOTPRINTS, type FootprintOverrides } from "../../src/core/catalog/footprints";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "pct-footprints-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SET: FootprintOverrides = {
  schemaVersion: 1,
  entries: { "light.runway_approach_light_center_2": { width: 2, depth: 0.5, height: 4 } },
};

describe("readFootprints / writeFootprints", () => {
  it("reads an empty set when the file doesn't exist yet (every first run)", () => {
    expect(readFootprints(dir)).toEqual(EMPTY_FOOTPRINTS);
  });

  it("round-trips a saved set", () => {
    expect(writeFootprints(dir, SET)).toEqual(SET);
    expect(readFootprints(dir)).toEqual(SET);
  });

  it("degrades a corrupt file to empty AND LEAVES IT ON DISK — it is data the user typed", () => {
    const file = footprintsFile(dir);
    writeFileSync(file, "{ not json at all");
    expect(readFootprints(dir)).toEqual(EMPTY_FOOTPRINTS);
    expect(readFileSync(file, "utf8")).toBe("{ not json at all"); // recoverable by hand, not clobbered
  });

  it("degrades a file that parses but isn't a footprints set", () => {
    writeFileSync(footprintsFile(dir), JSON.stringify({ schemaVersion: 9, entries: {} }));
    expect(readFootprints(dir)).toEqual(EMPTY_FOOTPRINTS);
  });

  it("refuses to WRITE a set the next launch could not read back", () => {
    // The renderer is the one calling this. A bug there must fail loudly here rather than produce a file
    // that silently reads as "no measurements" on the next boot.
    const bad = { schemaVersion: 1, entries: { ok: { width: 0, depth: 1, height: 1 } } };
    expect(() => writeFootprints(dir, bad as FootprintOverrides)).toThrow();
  });
});

describe("readFootprintsFile — the import side, where the file is somebody else's", () => {
  it("reads a well-formed shared file", () => {
    const shared = path.join(dir, "from-the-forum.json");
    writeFileSync(shared, JSON.stringify(SET));
    expect(readFootprintsFile(shared)).toEqual(SET);
  });

  it("throws rather than importing nothing, so the user sees WHY", () => {
    const junk = path.join(dir, "junk.json");
    writeFileSync(junk, JSON.stringify({ hello: "world" }));
    expect(() => readFootprintsFile(junk)).toThrow();
    expect(() => readFootprintsFile(path.join(dir, "no-such-file.json"))).toThrow();
  });
});
