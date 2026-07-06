import { describe, it, expect } from "vitest";
import { categorize, displayName } from "../../src/core/catalog/categorize";
import { CATEGORY_BY_NAME } from "../../src/core/catalog/categories.data";

describe("categorize", () => {
  it("every curated name resolves to its intended category with act=true (AC3)", () => {
    const wrong: string[] = [];
    for (const [name, cat] of Object.entries(CATEGORY_BY_NAME)) {
      const r = categorize(name, "xref_any");
      if (r.category !== cat || !r.act) wrong.push(`${name} → ${r.category} (want ${cat})`);
    }
    expect(wrong).toEqual([]);
  });

  it("prefix rules catch non-curated stragglers (act=false)", () => {
    expect(categorize("PBridgePitch", "xref_airport")).toEqual({ category: "jetways", act: false });
    expect(categorize("PBruckeVorneSG", "xref_airport")).toEqual({ category: "jetways", act: false });
    expect(categorize("jetway_base", "xref_airport")).toEqual({ category: "jetways", act: false });
    expect(categorize("powerline_37m", "xref_generic")).toEqual({ category: "various", act: false });
    expect(categorize("FloodLight99_new", "xref_airport")).toEqual({ category: "items/lighting", act: false });
  });

  it("unknown names fall back to other/<bundle>, never lost", () => {
    expect(categorize("totally_unknown_xyz", "xref_misc")).toEqual({
      category: "other/xref_misc",
      act: false,
    });
  });
});

describe("displayName", () => {
  it("strips decoration runs and title-cases", () => {
    expect(displayName("tower00_small_plates_ds_00_08_08")).toBe("Tower00 Small Plates");
    expect(displayName("BarrelBlueNew")).toBe("Barrel Blue New");
    expect(displayName("terminal00_ds_16_13")).toBe("Terminal00");
  });
});
