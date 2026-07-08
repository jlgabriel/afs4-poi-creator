import { describe, expect, it } from "vitest";
import { bundleSummary } from "../../src/renderer/dialogs/bundleSummary";
import type { Catalog } from "../../src/core/project/types";

// bundleSummary only reads .length off xref / bundles, so filled arrays of the right size suffice.
const cat = (xrefN: number, bundleN: number): Catalog => ({
  schemaVersion: 1,
  scannedAt: "",
  installDir: "",
  userXrefDir: null,
  bundles: new Array(bundleN).fill(null) as unknown as Catalog["bundles"],
  xref: new Array(xrefN).fill(null) as unknown as Catalog["xref"],
  plants: [],
  airportLights: [],
  animated: [],
});

describe("bundleSummary", () => {
  it("pluralizes objects and bundles", () => {
    expect(bundleSummary(cat(911, 7))).toBe("911 objects in 7 bundles");
    expect(bundleSummary(cat(1, 1))).toBe("1 object in 1 bundle");
    expect(bundleSummary(cat(0, 0))).toBe("0 objects in 0 bundles");
  });
});
