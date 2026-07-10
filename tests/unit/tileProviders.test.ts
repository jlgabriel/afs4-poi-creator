import { describe, expect, it } from "vitest";
import { ESRI, OSM, tileSourceFor } from "../../src/renderer/map/tileProviders";

describe("tileSourceFor", () => {
  it("maps esri and osm to their built-in sources", () => {
    expect(tileSourceFor({ provider: "esri" })).toBe(ESRI);
    expect(tileSourceFor({ provider: "osm" })).toBe(OSM);
  });

  it("uses a custom URL + attribution when the provider is custom", () => {
    const src = tileSourceFor({
      provider: "custom",
      customUrl: "https://t/{z}/{x}/{y}.png",
      customAttribution: "me",
    });
    expect(src.url).toBe("https://t/{z}/{x}/{y}.png");
    expect(src.attribution).toBe("me");
  });

  it("a custom provider with a blank URL falls back to Esri (never a blank map)", () => {
    expect(tileSourceFor({ provider: "custom" })).toBe(ESRI);
    expect(tileSourceFor({ provider: "custom", customUrl: "" })).toBe(ESRI);
  });

  it("OSM is the OpenStreetMap tile server", () => {
    expect(OSM.url).toContain("tile.openstreetmap.org");
  });
});
