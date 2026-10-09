import { describe, expect, it } from "vitest";
import { iconKey } from "../../src/renderer/catalog/iconKey";

describe("iconKey — built-in categories", () => {
  it("keeps the curated mapping", () => {
    expect(iconKey("aircraft")).toBe("plane");
    expect(iconKey("vehicles/truck")).toBe("truck");
    expect(iconKey("vehicles/cars")).toBe("car");
    expect(iconKey("buildings/tower")).toBe("tower");
    expect(iconKey("buildings/office")).toBe("building");
    expect(iconKey("items/barrel")).toBe("box");
    expect(iconKey("other/xref_misc")).toBe("generic");
  });
});

describe("iconKey — user objects take the glyph from their bundle name", () => {
  it("follows FS4's own xref folder names", () => {
    expect(iconKey("user/xref_aircraft")).toBe("plane");
    expect(iconKey("user/xref_vehicles")).toBe("car");
    expect(iconKey("user/xref_buildings")).toBe("building");
  });

  it("reads other plain names, case-insensitively", () => {
    expect(iconKey("user/My_Helicopters")).toBe("plane");
    expect(iconKey("user/neuchatel-hangars")).toBe("hangar");
    expect(iconKey("user/trucks")).toBe("truck");
  });

  it("matches whole words only", () => {
    expect(iconKey("user/xref_air_race_pylons")).toBe("generic"); // "air" is not "aircraft"
    expect(iconKey("user/carousel")).toBe("generic"); // "car" inside a word doesn't count
  });

  it("falls back to generic for anything it can't read", () => {
    expect(iconKey("user/my_pylon")).toBe("generic");
    expect(iconKey("user/xref_generic")).toBe("generic");
    expect(iconKey("user/xref_misc")).toBe("generic");
  });
});
