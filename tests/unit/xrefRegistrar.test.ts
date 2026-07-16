import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSafeBundleName, planXrefRegistration, registerXref, xrefRoot } from "../../src/main/xrefRegistrar";
import { buildTmi } from "../../src/core/export/tmiWriter";

// Synthetic `.tmb` fixtures — invented names, the real plain-text grammar (scene → optional
// material_list/texture_list → geometry_list). No IPACS/community bytes enter the repo; the real pylon
// files are exercised only by hand in a local scratch run.
const IDENTITY = "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";
function tmbText(name: string, points: string, texture?: string): string {
  const material = texture
    ? `        <[list_tmxglmaterial][material_list][]
            <[tmxglmaterial][element][0]
                <[list_tm_tmtexture_index_pair][texture_list][]
                    <[tm_tmtexture_index_pair][element][0]
                        <[string8u][channel][diffuse]>
                        <[string8][name][${texture}]>
                    >
                >
            >
        >
`
    : "";
  return `<[file][][]
    <[tmxglscene][][]
${material}        <[pointer_list_tmxglgeometry][geometry_list][]
            <[tmxglgeometry][element][0]
                <[string8u][name][${name}]>
                <[matrix4_float64][matrix][${IDENTITY}]>
                <[tmxglmesh][mesh_collision][]
                    <[list_vector3_float32][point_list][${points}]>
                >
            >
        >
    >
>`;
}

let tmp: string;
let userData: string;
let root: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-reg-"));
  userData = mkdtempSync(path.join(os.tmpdir(), "pct-regdata-"));
  root = xrefRoot(tmp); // <tmp>/scenery/xref
  mkdirSync(root, { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
});
const writeLoose = (file: string, content: string | Buffer): void => writeFileSync(path.join(root, file), content);
/** Write into `<xref>/<folder>/` — the shape a real add-on ZIP extracts to (#122). */
const writeIn = (folder: string, file: string, content: string | Buffer): void => {
  mkdirSync(path.join(root, folder), { recursive: true });
  writeFileSync(path.join(root, folder, file), content);
};

describe("isSafeBundleName", () => {
  it("accepts slugs and rejects traversal / separators / spaces", () => {
    for (const ok of ["pylon_15m", "my.obj-1", "A320", "x"]) expect(isSafeBundleName(ok)).toBe(true);
    for (const bad of ["", "..", ".hidden", "a b", "a/b", "a\\b", "/abs"]) expect(isSafeBundleName(bad)).toBe(false);
  });
});

describe("planXrefRegistration", () => {
  it("marks a plain-text .tmb registerable, listing its geometry + present textures", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(0 0 0) (2 3 4)", "pct_tex"));
    writeLoose("pct_tex.ttx", "fake-texture-bytes");
    const plan = planXrefRegistration(tmp);
    expect(plan.registerable).toHaveLength(1);
    const b = plan.registerable[0];
    expect(b.base).toBe("pct_widget");
    expect(b.geometries.map((g) => g.name)).toEqual(["pct_widget"]);
    expect(b.ttx).toEqual(["pct_tex.ttx"]);
    expect(b.missingTextures).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("flags a referenced-but-absent texture as missing (copy-all still lists present ones)", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(0 0 0) (1 1 1)", "gone_tex"));
    expect(planXrefRegistration(tmp).registerable[0].missingTextures).toEqual(["gone_tex.ttx"]);
  });

  it("skips opaque, no-geometry, and dest-already-exists .tmb — each with a reason", () => {
    writeLoose("opaque.tmb", Buffer.from([0xb5, 0xfe, 0x24, 0xc7]));
    writeLoose("nogeom.tmb", "<[file][][]\n    <[tmxglscene][][]>\n>");
    writeLoose("taken.tmb", tmbText("taken", "(0 0 0) (1 1 1)"));
    mkdirSync(path.join(root, "taken")); // destination folder already present
    const plan = planXrefRegistration(tmp);
    expect(plan.registerable).toHaveLength(0);
    const reasons = plan.skipped.map((s) => s.reason).join(" | ");
    expect(reasons).toContain("opaque");
    expect(reasons).toContain("no derivable geometry");
    expect(reasons).toContain("already exists");
  });

  it("returns an empty plan when the user has no scenery/xref", () => {
    expect(planXrefRegistration(path.join(tmp, "nonexistent"))).toEqual({
      xrefDir: null,
      registerable: [],
      skipped: [],
    });
  });

  // ── #122: the layout real add-ons actually ship (a ZIP of a FOLDER). v0.3.0 walked the root only and
  //    found NOTHING here, so the feature could not fire for a normally-installed object. ──
  it("#122: a folder of .tmb with no .tmi is ONE registerable bundle named after the folder", () => {
    writeIn("xref_air_race_pylons", "pylon_15m.tmb", tmbText("pylon_15m", "(-1 -1 0) (1 1 15)", "pylon"));
    writeIn("xref_air_race_pylons", "pylon_30m.tmb", tmbText("pylon_30m", "(-1 -1 0) (1 1 30)", "pylon"));
    writeIn("xref_air_race_pylons", "pylon.ttx", "fake-texture-bytes");

    const plan = planXrefRegistration(tmp);
    expect(plan.skipped).toEqual([]);
    expect(plan.registerable).toHaveLength(1); // ONE bundle, not one per file
    const b = plan.registerable[0];
    expect(b.base).toBe("xref_air_race_pylons"); // the FOLDER names the bundle + its .tmi
    expect(b.inPlace).toBe(true);
    expect(b.dir).toBe(path.join(root, "xref_air_race_pylons"));
    expect(b.geometries.map((g) => g.name)).toEqual(["pylon_15m", "pylon_30m"]);
    expect(b.ttx).toEqual([]); // the user's texture is already beside its .tmb — never copy it
    expect(b.missingTextures).toEqual([]);
  });

  it("#122: a folder that already has a .tmi is left completely alone", () => {
    writeIn("xref_air_race", "pylon_15m.tmb", tmbText("pylon_15m", "(-1 -1 0) (1 1 15)"));
    writeIn("xref_air_race", "xref_air_race.tmi", "<[file][][]>"); // already resolvable → findTmi's job
    expect(planXrefRegistration(tmp).registerable).toEqual([]);
  });

  it("#122: an unreadable .tmb doesn't sink its readable siblings (partial index still helps)", () => {
    writeIn("pack", "good.tmb", tmbText("good", "(0 0 0) (1 1 1)"));
    writeIn("pack", "opaque.tmb", Buffer.from([0xb5, 0xfe, 0x24, 0xc7]));
    const plan = planXrefRegistration(tmp);
    expect(plan.registerable).toHaveLength(1);
    expect(plan.registerable[0].geometries.map((g) => g.name)).toEqual(["good"]);
    expect(plan.skipped.map((s) => s.reason).join(" ")).toContain("opaque");
  });

  it("#122: nested folders are walked too (symmetric with findTmi)", () => {
    writeIn(path.join("vendor", "deep_pack"), "thing.tmb", tmbText("thing", "(0 0 0) (1 1 1)"));
    const plan = planXrefRegistration(tmp);
    expect(plan.registerable).toHaveLength(1);
    expect(plan.registerable[0].base).toBe("deep_pack");
  });
});

describe("registerXref", () => {
  it("moves a loose .tmb into its own subfolder (generated .tmi + copied .ttx) and deletes the original", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(-1 -1 0) (1 1 3)", "pct_tex"));
    writeLoose("pct_tex.ttx", "fake");
    const res = registerXref(tmp, userData, "2026-07-15T00:00:00Z");

    expect(res.registered).toHaveLength(1);
    expect(res.warnings).toEqual([]);
    const dest = path.join(root, "pct_widget");
    expect(readdirSync(dest).sort()).toEqual(["pct_tex.ttx", "pct_widget.tmb", "pct_widget.tmi"]);
    // the generated .tmi is byte-exact buildTmi output
    expect(readFileSync(path.join(dest, "pct_widget.tmi"), "utf8")).toBe(
      buildTmi("pct_widget", [{ name: "pct_widget", bbMin: [-1, -1, 0], bbMax: [1, 1, 3] }]),
    );
    // original loose .tmb removed; the .ttx original stays at the root (copied, not moved — may be shared)
    expect(existsSync(path.join(root, "pct_widget.tmb"))).toBe(false);
    expect(existsSync(path.join(root, "pct_tex.ttx"))).toBe(true);
  });

  it("writes a journal entry keyed by base, with a sha + timestamp", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(0 0 0) (1 1 1)"));
    registerXref(tmp, userData, "2026-07-15T00:00:00Z");
    const journal = JSON.parse(readFileSync(path.join(userData, "xref-registry.json"), "utf8"));
    expect(Object.keys(journal)).toEqual(["pct_widget"]);
    expect(journal.pct_widget.files).toContain("pct_widget.tmi");
    expect(journal.pct_widget.registeredAt).toBe("2026-07-15T00:00:00Z");
    expect(journal.pct_widget.tmbSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("warns about a missing referenced texture but still registers the object", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(0 0 0) (1 1 1)", "gone_tex"));
    const res = registerXref(tmp, userData, "t");
    expect(res.registered).toHaveLength(1);
    expect(res.warnings.join(" ")).toContain("gone_tex.ttx not found");
  });

  it("is idempotent: a second run registers nothing (the loose .tmb is gone)", () => {
    writeLoose("pct_widget.tmb", tmbText("pct_widget", "(0 0 0) (1 1 1)"));
    expect(registerXref(tmp, userData, "t").registered).toHaveLength(1);
    expect(registerXref(tmp, userData, "t").registered).toHaveLength(0);
  });

  // ── #122: registering a real add-on folder. This is the whole point of the fix — and note how much
  //    LESS it does than the loose path: one file appears, nothing of the user's is touched. ──
  it("#122: registering a folder bundle only ADDS the .tmi — every user file is untouched", () => {
    writeIn("pylons", "pylon_15m.tmb", tmbText("pylon_15m", "(-1 -1 0) (1 1 15)", "pylon"));
    writeIn("pylons", "pylon_30m.tmb", tmbText("pylon_30m", "(-2 -2 0) (2 2 30)", "pylon"));
    writeIn("pylons", "pylon.ttx", "fake");
    writeIn("pylons", "__readme.txt", "michael's notes");
    const dir = path.join(root, "pylons");
    const before = readdirSync(dir).sort();

    const res = registerXref(tmp, userData, "2026-07-16T00:00:00Z");
    expect(res.warnings).toEqual([]);
    expect(res.registered).toEqual([{ base: "pylons", path: dir, geometries: 2, ttx: 0 }]);

    // exactly ONE new file — the index; nothing moved, nothing deleted, no folder created
    expect(readdirSync(dir).sort()).toEqual([...before, "pylons.tmi"].sort());
    expect(readFileSync(path.join(dir, "pylons.tmi"), "utf8")).toBe(
      buildTmi("pylons", [
        { name: "pylon_15m", bbMin: [-1, -1, 0], bbMax: [1, 1, 15] },
        { name: "pylon_30m", bbMin: [-2, -2, 0], bbMax: [2, 2, 30] },
      ]),
    );
    // the journal claims ONLY the .tmi — a future unregister must never delete the user's own files
    const journal = JSON.parse(readFileSync(path.join(userData, "xref-registry.json"), "utf8"));
    expect(journal.pylons.files).toEqual(["pylons.tmi"]);
    expect(journal.pylons.inPlace).toBe(true);
    expect(journal.pylons.sourceTmbPath).toBeUndefined();
  });

  it("#122: registering a folder bundle is idempotent (its .tmi now makes it resolvable)", () => {
    writeIn("pylons", "pylon_15m.tmb", tmbText("pylon_15m", "(0 0 0) (1 1 15)"));
    expect(registerXref(tmp, userData, "t").registered).toHaveLength(1);
    expect(registerXref(tmp, userData, "t").registered).toHaveLength(0); // the .tmi is there → left alone
  });

  it("registers the good bundle even when another is skipped", () => {
    writeLoose("good.tmb", tmbText("good", "(0 0 0) (1 1 1)"));
    writeLoose("opaque.tmb", Buffer.from([0xb5, 0xfe]));
    const res = registerXref(tmp, userData, "t");
    expect(res.registered.map((r) => r.base)).toEqual(["good"]);
    expect(res.warnings.join(" ")).toContain("Skipped opaque.tmb");
  });
});
