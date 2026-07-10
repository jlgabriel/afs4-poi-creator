import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Project } from "../../src/core/project/types";
import { UnsupportedSchemaVersionError } from "../../src/core/project/schemas";
import {
  autosaveShadow,
  clearShadow,
  getCurrentProjectPath,
  loadShadow,
  openProject,
  saveProject,
  saveProjectAs,
  setCurrentProjectPath,
  type PickPath,
} from "../../src/main/projectFile";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-proj-"));
  setCurrentProjectPath(null); // reset the module-level singleton between tests
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const proj = (over: Partial<Project> = {}): Project => ({
  schemaVersion: 1,
  app: "pct",
  name: "T",
  poiName: "t_poi",
  createdAt: "2026-07-07T00:00:00Z",
  modifiedAt: "2026-07-07T00:00:00Z",
  reference: null,
  camera: { lon: 0, lat: 0, zoom: 15 },
  objects: [],
  ...over,
});

const pick = (p: string | null): PickPath => () => p;
const noPick: PickPath = () => {
  throw new Error("dialog should not have been shown");
};

describe("openProject", () => {
  it("reads + validates a picked project and sets the current path", async () => {
    const file = path.join(tmp, "in.json");
    writeFileSync(file, JSON.stringify(proj({ name: "Loaded" })), "utf8");
    const res = await openProject(pick(file));
    expect(res?.path).toBe(file);
    expect(res?.project.name).toBe("Loaded");
    expect(getCurrentProjectPath()).toBe(file);
  });

  it("returns null and leaves the current path untouched when cancelled", async () => {
    expect(await openProject(pick(null))).toBeNull();
    expect(getCurrentProjectPath()).toBeNull();
  });

  it("throws on a malformed project (untrusted input is validated)", async () => {
    const file = path.join(tmp, "bad.json");
    writeFileSync(file, JSON.stringify({ app: "pct" }), "utf8");
    await expect(openProject(pick(file))).rejects.toThrow();
  });

  it("throws UnsupportedSchemaVersionError on a newer file", async () => {
    const file = path.join(tmp, "future.json");
    writeFileSync(file, JSON.stringify(proj({ schemaVersion: 2 as unknown as 1 })), "utf8");
    await expect(openProject(pick(file))).rejects.toThrow(UnsupportedSchemaVersionError);
  });
});

describe("saveProject / saveProjectAs", () => {
  it("with no current path, falls through to the Save-As dialog and adopts it", async () => {
    const file = path.join(tmp, "saved.json");
    const res = await saveProject(proj({ name: "First" }), pick(file));
    expect(res?.path).toBe(file);
    expect(getCurrentProjectPath()).toBe(file);
    expect(JSON.parse(readFileSync(file, "utf8")).name).toBe("First");
  });

  it("with a current path, writes to it WITHOUT prompting", async () => {
    const file = path.join(tmp, "cur.json");
    setCurrentProjectPath(file);
    const res = await saveProject(proj({ name: "Quiet" }), noPick);
    expect(res?.path).toBe(file);
    expect(JSON.parse(readFileSync(file, "utf8")).name).toBe("Quiet");
  });

  it("returns null when the Save-As dialog is cancelled and writes nothing", async () => {
    expect(await saveProject(proj(), pick(null))).toBeNull();
    expect(getCurrentProjectPath()).toBeNull();
  });

  it("saveProjectAs always prompts, even with a current path, and adopts the new one", async () => {
    const first = path.join(tmp, "a.json");
    const second = path.join(tmp, "b.json");
    setCurrentProjectPath(first);
    const res = await saveProjectAs(proj({ name: "AsB" }), pick(second));
    expect(res?.path).toBe(second);
    expect(getCurrentProjectPath()).toBe(second);
    expect(JSON.parse(readFileSync(second, "utf8")).name).toBe("AsB");
  });
});

describe("autosaveShadow / loadShadow", () => {
  it("round-trips the shadow copy", () => {
    autosaveShadow(tmp, proj({ name: "Shadowed" }));
    expect(loadShadow(tmp)?.name).toBe("Shadowed");
  });
  it("returns null when there is no shadow", () => {
    expect(loadShadow(tmp)).toBeNull();
  });
  it("returns null on a corrupt shadow", () => {
    writeFileSync(path.join(tmp, "shadow.json"), "{ not json", "utf8");
    expect(loadShadow(tmp)).toBeNull();
  });
  it("returns null on an unreadable schemaVersion", () => {
    writeFileSync(path.join(tmp, "shadow.json"), JSON.stringify({ schemaVersion: 99 }), "utf8");
    expect(loadShadow(tmp)).toBeNull();
  });
  it("clearShadow removes the shadow", () => {
    autosaveShadow(tmp, proj({ name: "Doomed" }));
    expect(loadShadow(tmp)).not.toBeNull();
    clearShadow(tmp);
    expect(loadShadow(tmp)).toBeNull();
  });
  it("clearShadow with no shadow present is a no-op (never throws)", () => {
    expect(() => clearShadow(tmp)).not.toThrow();
  });
});
