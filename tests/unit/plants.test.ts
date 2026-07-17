import { describe, it, expect } from "vitest";
import { buildPlants, type PlantFile } from "../../src/core/catalog/plants";

// The REAL install layout: all 41 filenames in `<install>/scenery/plants/`, verbatim off Juan's disk
// (2026-07-17). Every one is a `.ttx` texture — there is no `.tmb` and no geometry in that folder at
// all, which is why a plant is placeable from its filename alone.
//
// This list is also the cross-check: the format bible's plant list (group → species indices) matches
// it EXACTLY, 41 = 41, including the i04–i07 gap in every group. Two independent sources agreeing is
// the closest thing to ground truth this feature has — the install's own `list_plant`s are all inside
// binary-packed cultivation `.toc` files we cannot read.
const REAL_FILES: PlantFile[] = [
  "alley__i00__h2740_color",
  "broadleaf__i00__h1750_color",
  "broadleaf__i01__h1650_color",
  "broadleaf__i02__h1450_color",
  "broadleaf__i03__h1850_color",
  "broadleaf__i08__h1400_color",
  "broadleaf__i09__h1250_color",
  "broadleaf__i10__h1550_color",
  "broadleaf__i11__h1850_color",
  "broadleaf__i12__h1050_color",
  "conifer__i00__h1700_color",
  "conifer__i01__h1550_color",
  "conifer__i02__h1750_color",
  "conifer__i03__h1800_color",
  "conifer__i08__h0850_color",
  "conifer__i09__h1840_color",
  "conifer__i10__h2050_color",
  "conifer__i11__h1250_color",
  "conifer__i12__h2200_color",
  "conifer__i13__h1400_color",
  "conifer_forest__i00__h2500_color",
  "conifer_forest__i01__h2820_color",
  "conifer_forest__i02__h2014_color",
  "palm__i08__h2700_color",
  "palm__i09__h2700_color",
  "palm__i10__h1000_color",
  "palm__i11__h1500_color",
  "palm__i12__h2200_color",
  "palm__i13__h2400_color",
  "palm__i14__h2500_color",
  "shrub__i00__h0650_color",
  "shrub__i01__h0120_color",
  "shrub__i02__h0520_color",
  "shrub__i03__h0430_color",
  "shrub__i08__h0550_color",
  "shrub__i09__h0120_color",
  "shrub__i10__h0420_color",
  "shrub__i11__h0080_color",
  "shrub__i12__h0100_color",
  "shrub__i13__h1250_color",
  "shrub__i14__h0450_color",
].map((base) => ({ base }));

describe("buildPlants — enumerate the plant library", () => {
  const { plants, warnings } = buildPlants(REAL_FILES);
  const speciesOf = (g: string) => plants.filter((p) => p.group === g).map((p) => p.species);

  it("yields all 41 plants from the 41 install textures, with no warnings", () => {
    expect(plants).toHaveLength(41);
    expect(warnings).toEqual([]);
  });

  it("matches the format bible's group → species list exactly, gaps included", () => {
    // Independently transcribed from the bible's "LISTS - PLANTS" table, NOT derived from the
    // filenames above — the whole point is that the two sources agree without being the same source.
    expect(speciesOf("alley")).toEqual(["00"]);
    expect(speciesOf("broadleaf")).toEqual(["00", "01", "02", "03", "08", "09", "10", "11", "12"]);
    expect(speciesOf("conifer")).toEqual(["00", "01", "02", "03", "08", "09", "10", "11", "12", "13"]);
    expect(speciesOf("conifer_forest")).toEqual(["00", "01", "02"]);
    expect(speciesOf("palm")).toEqual(["08", "09", "10", "11", "12", "13", "14"]);
    expect(speciesOf("shrub")).toEqual(["00", "01", "02", "03", "08", "09", "10", "11", "12", "13", "14"]);
    // i04–i07 exist in NO group, in EITHER source.
    expect(plants.filter((p) => ["04", "05", "06", "07"].includes(p.species))).toEqual([]);
  });

  it("splits on the DOUBLE underscore, so a group keeps its own underscore", () => {
    // The regression this guards: a lazy `(.+?)__` that split on the first single `_` would file
    // these 3 under a group named "conifer", inventing a species collision with the real conifers.
    expect(speciesOf("conifer_forest")).toHaveLength(3);
    expect(plants.find((p) => p.group === "conifer_forest")!.displayName).toBe("Conifer Forest 00");
  });

  it("keeps `species` as the filename's 2 zero-padded digits — NOT a 0-based ordinal", () => {
    // Confirmed against the format author's proven-in-sim file, which places `palm`/`08` and
    // `palm`/`11`. Palm's textures are i08…i14, so an ordinal would top out at 6 and `11` could not
    // exist — the gaps are real and this field carries the filename's number.
    expect(speciesOf("alley")).toEqual(["00"]);
    expect(speciesOf("palm")).toContain("11"); // the exact value in the working reference file
    expect(plants.every((p) => /^\d\d$/.test(p.species))).toBe(true);
  });

  it("decodes h#### as centimetres of natural height", () => {
    const h = (g: string, s: string) => plants.find((p) => p.group === g && p.species === s)!.naturalHeight;
    expect(h("broadleaf", "00")).toBe(17.5); // h1750
    expect(h("shrub", "11")).toBe(0.8); // h0080 — the shortest in the install
    expect(h("conifer_forest", "01")).toBe(28.2); // h2820 — the tallest
    expect(h("conifer_forest", "02")).toBe(20.14); // h2014 — non-round, i.e. not a rounding artefact
  });

  it("assigns a category per group and carries install provenance", () => {
    const palm = plants.find((p) => p.group === "palm")!;
    expect(palm.category).toBe("plants/palm");
    expect(palm.source).toBe("install");
    expect(palm).not.toHaveProperty("bbMin"); // billboards, not footprint objects
  });

  it("is sorted by group then species for stable catalog.json + goldens", () => {
    // Asserted as the two real invariants rather than by re-sorting a joined "group/species" key:
    // `"conifer_forest/00".localeCompare("conifer/00")` is NEGATIVE (ICU root collation orders `_`
    // before `/`), so re-sorting joined keys would assert the collator's punctuation rules instead
    // of the catalog's order, and fail against a correctly-sorted catalog.
    const groupsInOrder = plants.map((p) => p.group).filter((g, i, a) => g !== a[i - 1]);
    // A group appearing twice here would mean its entries are not contiguous — one assert, both
    // properties: each group forms a single block, and the blocks ascend.
    expect(groupsInOrder).toEqual(["alley", "broadleaf", "conifer", "conifer_forest", "palm", "shrub"]);
    for (const g of groupsInOrder) expect(speciesOf(g)).toEqual([...speciesOf(g)].sort());
  });
});

describe("buildPlants — tolerance contract", () => {
  it("warns and skips a filename that doesn't match the pattern", () => {
    // Unlike an airport light we cannot include an unparseable name verbatim: group/species/height
    // are ONLY knowable from the name, and a guessed group places an invisible plant.
    const { plants, warnings } = buildPlants([{ base: "mystery_bush" }]);
    expect(plants).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("mystery_bush");
  });

  it("de-dupes a second texture channel for the same plant", () => {
    const { plants } = buildPlants([
      { base: "broadleaf__i00__h1750_color" },
      { base: "broadleaf__i00__h1750_light" },
    ]);
    expect(plants).toHaveLength(1);
    expect(plants[0].naturalHeight).toBe(17.5);
  });

  it("accepts a name with no channel suffix at all", () => {
    const { plants, warnings } = buildPlants([{ base: "broadleaf__i00__h1750" }]);
    expect(warnings).toEqual([]);
    expect(plants[0]).toMatchObject({ group: "broadleaf", species: "00", naturalHeight: 17.5 });
  });

  it("returns an empty catalog (no throw) for an install with no plants folder", () => {
    expect(buildPlants([])).toEqual({ plants: [], warnings: [] });
  });
});
