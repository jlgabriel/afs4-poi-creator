import { describe, expect, it } from "vitest";
import path from "node:path";
import { anchorAssetsDir } from "../../src/main/anchorAsset";

describe("anchorAssetsDir", () => {
  it("prefers the PCT_ASSETS_DIR override above everything else", () => {
    expect(
      anchorAssetsDir({
        env: { PCT_ASSETS_DIR: "/custom/assets" },
        packaged: true,
        resourcesPath: "/app/resources",
        appPath: "/repo",
      }),
    ).toBe("/custom/assets");
  });

  it("uses <resourcesPath>/assets when packaged", () => {
    expect(
      anchorAssetsDir({ env: {}, packaged: true, resourcesPath: "/app/resources", appPath: "/repo" }),
    ).toBe(path.join("/app/resources", "assets"));
  });

  it("uses <appPath>/assets in dev (not packaged)", () => {
    expect(
      anchorAssetsDir({ env: {}, packaged: false, resourcesPath: "/app/resources", appPath: "/repo" }),
    ).toBe(path.join("/repo", "assets"));
  });

  it("falls back to <appPath>/assets when packaged but resourcesPath is missing", () => {
    expect(
      anchorAssetsDir({ env: {}, packaged: true, resourcesPath: undefined, appPath: "/repo" }),
    ).toBe(path.join("/repo", "assets"));
  });
});
