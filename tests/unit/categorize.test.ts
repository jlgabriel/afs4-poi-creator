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

  // forum #110 — the old trailing-number strip collapsed distinct community pylons to the
  // same label. Keep the number so variants stay distinguishable (name is the only discriminator).
  it("keeps meaningful trailing numbers so variants stay distinct (#110)", () => {
    expect(displayName("pylon_15m")).toBe("Pylon 15m");
    expect(displayName("pylon_30m")).toBe("Pylon 30m");
    expect(displayName("pylon_air_race_18_4")).toBe("Pylon Air Race 18 4");
    expect(displayName("pylon_air_race_25_5")).toBe("Pylon Air Race 25 5");
    expect(displayName("pylon_reno_3")).toBe("Pylon Reno 3");
    // the two air-race variants must NOT render identically
    expect(displayName("pylon_air_race_18_4")).not.toBe(displayName("pylon_air_race_25_5"));
  });

  // keeping trailing numbers also brings built-ins closer to IPACS's own curated labels,
  // where numbered variants keep their index (verified against the official xref table).
  it("keeps built-in numeric indices (matches IPACS labels)", () => {
    expect(displayName("car_00")).toBe("Car 00");
    expect(displayName("glider_02")).toBe("Glider 02");
    expect(displayName("mast_03")).toBe("Mast 03");
  });
});
