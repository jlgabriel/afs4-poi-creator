// captureScene.test.ts — the pure capture-scene generator (core/capture/captureScene.ts).
// Golden-ish geometry checks: row spacing/order, boya approach path, uniform sea height, the UDP
// nearest-match, and that the generated Project passes PCT's own loader (so it exports cleanly).
import { describe, expect, it } from "vitest";
import {
  BOYA_GUIDE,
  BOYA_START,
  SCIP,
  buildCaptureProject,
  buildCaptureScene,
  matchNearestEntry,
} from "../../src/core/capture/captureScene";
import { haversine } from "../../src/core/geo/geo";
import { isExportablePoiName, safeParseProject } from "../../src/core/project/schemas";
import { resolveHeightsFlat } from "../../src/core/export/heights";
import { planExport } from "../../src/core/export/planExport";

const NAMES = ["staticpeople_man00", "staticpeople_man01", "staticpeople_man02", "staticpeople_man03"];
const ANCHOR = { lon: -109.5, lat: -27.1654 }; // an explicit offshore anchor keeps spacing assertions clean

describe("buildCaptureScene", () => {
  it("puts one manifest entry per name, in order, the head on the anchor", () => {
    const { manifest } = buildCaptureScene({ names: NAMES, anchor: ANCHOR });
    expect(manifest.entries.map((e) => e.name)).toEqual(NAMES);
    expect(manifest.entries.map((e) => e.order)).toEqual([0, 1, 2, 3]);
    expect(manifest.entries[0].lon).toBeCloseTo(ANCHOR.lon, 9);
    expect(manifest.entries[0].lat).toBeCloseTo(ANCHOR.lat, 9);
  });

  it("spaces consecutive row objects by spacingM", () => {
    const spacingM = 40;
    const { manifest } = buildCaptureScene({ names: NAMES, anchor: ANCHOR, spacingM });
    for (let i = 1; i < manifest.entries.length; i++) {
      const a = manifest.entries[i - 1];
      const b = manifest.entries[i];
      const d = haversine({ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat });
      expect(Math.abs(d - spacingM)).toBeLessThan(0.5);
    }
  });

  it("prepends the approach boyas + a START marker, and keeps them OUT of the manifest", () => {
    const approachBoyas = 5;
    const { objects, manifest } = buildCaptureScene({ names: NAMES, anchor: ANCHOR, approachBoyas });
    const boyas = objects.filter((o) => o.name === BOYA_GUIDE || o.name === BOYA_START);
    expect(boyas).toHaveLength(approachBoyas + 1); // guides + one START
    expect(objects.filter((o) => o.name === BOYA_START)).toHaveLength(1);
    expect(objects).toHaveLength(approachBoyas + 1 + NAMES.length);
    // Boyas are markers, never photographed → absent from the manifest.
    const manifestNames = new Set(manifest.entries.map((e) => e.name));
    expect(manifestNames.has(BOYA_GUIDE)).toBe(false);
    expect(manifestNames.has(BOYA_START)).toBe(false);
  });

  it("places the whole scene at one flat sea-clearance height", () => {
    const seaClearanceM = 7;
    const { objects } = buildCaptureScene({ names: NAMES, anchor: ANCHOR, seaClearanceM });
    for (const o of objects) {
      expect(o.height).toEqual({ mode: "asl", value: seaClearanceM });
      expect(o.scale).toBe(1);
    }
  });

  it("derives the default anchor offshore from SCIP", () => {
    const offshoreM = 8000;
    const { manifest } = buildCaptureScene({ names: NAMES }); // no explicit anchor
    const d = haversine(SCIP, manifest.anchor);
    expect(Math.abs(d - offshoreM)).toBeLessThan(1);
  });
});

describe("matchNearestEntry", () => {
  it("returns the entry the position is closest to", () => {
    const { manifest } = buildCaptureScene({ names: NAMES, anchor: ANCHOR, spacingM: 35 });
    const target = manifest.entries[2];
    // A point ~3 m off object #2 should still resolve to it.
    const near = { lon: target.lon + 0.00002, lat: target.lat };
    expect(matchNearestEntry(manifest, near)?.order).toBe(2);
  });

  it("returns null when the nearest object is beyond maxDistanceM", () => {
    const { manifest } = buildCaptureScene({ names: NAMES, anchor: ANCHOR });
    const faraway = { lon: 0, lat: 0 };
    expect(matchNearestEntry(manifest, faraway, 100)).toBeNull();
  });
});

describe("buildCaptureProject", () => {
  it("produces a Project PCT's own loader accepts, with an exportable poi name", () => {
    const scene = buildCaptureScene({ names: NAMES, anchor: ANCHOR });
    const project = buildCaptureProject(scene, {
      name: "Capture — people",
      poiName: "capture_people",
      now: "2026-07-23T00:00:00.000Z",
    });
    expect(isExportablePoiName(project.poiName)).toBe(true);
    const res = safeParseProject(project);
    expect(res.success).toBe(true);
  });
});

describe("end-to-end through the real export pipeline", () => {
  it("resolves + plans a POI whose toc carries both the boyas and the captured objects", () => {
    const scene = buildCaptureScene({ names: NAMES, anchor: ANCHOR });
    const project = buildCaptureProject(scene, {
      name: "Capture — people",
      poiName: "capture_people",
      now: "2026-07-23T00:00:00.000Z",
    });
    const resolved = resolveHeightsFlat(scene.objects, 0); // asl heights ignore terrain; 0 is a safe base
    const plan = planExport(project, resolved);

    const toc = plan.files.find((f) => f.relPath === "poi.toc");
    expect(toc).toBeDefined();
    expect(toc!.content).toContain("staticpeople_man00"); // a captured object landed in the .toc verbatim
    expect(toc!.content).toContain(BOYA_START); // ...and so did the START marker boya
    expect(plan.folderName).toBe("w10950s2717_capture_people"); // anchor coords encoded + the slug
    expect(plan.warnings).toHaveLength(0);
  });
});
