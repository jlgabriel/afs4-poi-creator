import { describe, it, expect } from "vitest";
import { buildCatalog, type TmiSource } from "../../src/core/catalog/buildCatalog";

const tmi = (filename: string, entries: string): string => `<[file][][]
  <[tmxglscene_info][][]
    <[string8][filename][${filename}]>
    ${entries}
  >
>`;

const entry = (name: string, bbMin: string, bbMax: string): string => `
    <[tmxglscene_info_entry][element][0]
      <[string8u][name][${name}]>
      <[vector3_float64][bb_min][${bbMin}]>
      <[vector3_float64][bb_max][${bbMax}]>
      <[float64][bs_radius][1.0]>
    >`;

describe("buildCatalog", () => {
  it("assembles a catalog with per-bundle counts, categories and rounded sizes", () => {
    const sources: TmiSource[] = [
      {
        path: "a/xref_test.tmi",
        source: "install",
        text: tmi(
          "xref_test",
          // synthetic name, but the ACT tower's exact bbox → proves the 8.19 x 25.90 size math
          entry("hangar_demo_ds_01", "-3.587511 -3.978786 -1.565422", "4.602168 4.010449 24.339308") +
            entry("mystery_thing", "0 0 0", "1 2 3"),
        ),
      },
    ];
    const { catalog, warnings } = buildCatalog(sources, {
      installDir: "X",
      userXrefDir: null,
      scannedAt: "2026-01-01T00:00:00Z",
    });

    expect(warnings).toEqual([]);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.xref).toHaveLength(2);
    expect(catalog.bundles[0]).toMatchObject({ bundle: "xref_test", count: 2, source: "install" });

    const hangar = catalog.xref.find((o) => o.name === "hangar_demo_ds_01");
    expect(hangar).toBeDefined();
    expect(hangar!.size).toEqual({ x: 8.19, y: 7.99, z: 25.9 });
    expect(hangar!.category).toBe("buildings/hangar");
    expect(hangar!.displayName).toBe("Hangar Demo");

    const mystery = catalog.xref.find((o) => o.name === "mystery_thing");
    expect(mystery!.category).toBe("other/xref_test");
  });

  it("keeps duplicate names across bundles (no dedupe — raw count is the headline)", () => {
    const dup = entry("dup_obj", "0 0 0", "1 1 1");
    const sources: TmiSource[] = [
      { path: "a.tmi", source: "install", text: tmi("xref_a", dup) },
      { path: "b.tmi", source: "install", text: tmi("xref_b", dup) },
    ];
    const { catalog } = buildCatalog(sources, { installDir: "X", userXrefDir: null, scannedAt: "t" });
    expect(catalog.xref).toHaveLength(2);
    expect(catalog.bundles.map((b) => b.bundle)).toEqual(["xref_a", "xref_b"]);
  });

  it("propagates parser warnings, tagged with the source path", () => {
    const sources: TmiSource[] = [
      { path: "bad.tmi", source: "install", text: tmi("xref_bad", entry("broken", "0 0", "1 1 1")) },
    ];
    const { catalog, warnings } = buildCatalog(sources, { installDir: "X", userXrefDir: null, scannedAt: "t" });
    expect(catalog.xref).toHaveLength(0);
    expect(warnings.join(" ")).toContain("bad.tmi");
    expect(warnings.join(" ")).toContain("broken");
  });
});
