// The INSTALLED heliport: the path where PCT writes outside scenery/poi/ for the first time. Everything
// here is about the guards on that, not about the file format (tests/unit/heliport.test.ts covers that).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AirportPad, AirportRunwayEnd, Project, ResolvedXref } from "../../src/core/project/types";
import {
  InvalidHeliportIdentityError,
  planExport,
  planHeliport,
} from "../../src/core/export/planExport";
import {
  HELIPORT_README_MARKER,
  HELIPORT_TSC_FILE,
  buildHeliportTsc,
  buildHeliportWad,
  heliportFolderName,
  isSafeAirportFolderName,
  validateIdentity,
  SNAME_MAX,
  type HeliportSpec,
} from "../../src/core/export/heliportTemplate";
import {
  UnsafeCountryError,
  airportRoot,
  listInstalledHeliports,
  uninstallHeliport,
  writePoi,
} from "../../src/main/installer";
import { forgetTakenIcaos, icaoStatus, scanTakenIcaos, takenIcaos } from "../../src/main/icaoIndex";

const HANGAR: ResolvedXref = {
  id: "hangar",
  kind: "xref",
  name: "hangar_small_plates_ds_02_15_42",
  position: { lon: -116.795, lat: 34.8536 },
  heightAsl: 585,
  direction: 50,
  scale: 1,
};

const PROJECT: Project = {
  schemaVersion: 1,
  app: "pct",
  name: "KDAG heliport",
  poiName: "kdag_heliport",
  createdAt: "2026-07-31T00:00:00.000Z",
  modifiedAt: "2026-07-31T00:00:00.000Z",
  reference: null,
  camera: { lon: -116.795, lat: 34.8536, zoom: 18 },
  objects: [],
};

const ID = { icao: "pct001", name: "PCT Test Heliport", country: "us" };
/** The by-hand template shape: no identity, so the files carry `__PLACEHOLDER__` values. */
const TEMPLATE_SPEC: HeliportSpec = {
  position: { lon: -116.7947, lat: 34.8536 },
  pads: [{ name: "", position: { lon: -116.7947, lat: 34.8536 }, headingDeg: 40, radiusM: 10 }],
  cultivationFileName: "poi",
  anchor: null,
  autoheight: false,
  identity: null,
};
/** The pad is its own point now, not a borrowed object (forum #168) — deliberately NOT on the hangar. */
const PAD: AirportPad = {
  id: "pad-1",
  name: "",
  position: { lon: -116.7962, lat: 34.8541 },
  heading: 40,
  radius: 10,
};
const OPTS = { identity: ID, heliport: { pads: [PAD] as AirportPad[] } };

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-heli-"));
  forgetTakenIcaos();
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  forgetTakenIcaos();
});

/** Create `<root>/<rel>` as an empty file, making parents. Only the NAME matters to the index. */
function touch(root: string, rel: string): void {
  const p = path.join(root, rel);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, "");
}

describe("validateIdentity", () => {
  it("accepts a well-formed identity", () => {
    expect(validateIdentity(ID)).toBeNull();
  });

  it("rejects codes outside 4-6 chars, and anything not a letter or digit", () => {
    for (const icao of ["abc", "abcdefg", "pct-01", "PCT001", "pct 01", ""]) {
      expect(validateIdentity({ ...ID, icao })).toBe("icao-format");
    }
    expect(validateIdentity({ ...ID, icao: "ab12" })).toBeNull();
    expect(validateIdentity({ ...ID, icao: "abcdef" })).toBeNull();
  });

  it("rejects a name past the limit that makes the sim drop the airport", () => {
    expect(validateIdentity({ ...ID, name: "x".repeat(SNAME_MAX) })).toBeNull();
    expect(validateIdentity({ ...ID, name: "x".repeat(SNAME_MAX + 1) })).toBe("name-too-long");
    expect(validateIdentity({ ...ID, name: "   " })).toBe("name-empty");
  });

  it("rejects a country that is not two letters — it becomes a DIRECTORY name", () => {
    for (const country of ["u", "usa", "u1", "../", "US", ""]) {
      expect(validateIdentity({ ...ID, country })).toBe("country-format");
    }
  });
});

describe("planHeliport", () => {
  it("writes the airport files and NO poi.tsl — the .tsc replaces it", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    expect(plan.files.map((f) => f.relPath)).toEqual([
      "pct001.tsc",
      "pct001.wad",
      "poi.toc",
      "README.txt",
    ]);
  });

  // ★ REGRESSION. The INSTALL path and the export-TEMPLATE path build their own HeliportSpec, and when
  // stands were added only the template one got them: "Install HELIPORT…" wrote an airport with the
  // helipad and silently no parking. Nothing failed — the files were valid, just missing a block — which
  // is why this is a test and not a code comment. EVERY repeatable element is pinned here, so the next
  // one cannot be added to one half only.
  it("writes every repeatable element on the INSTALL path too, not only in the templates", () => {
    const opts = {
      ...OPTS,
      heliport: {
        ...OPTS.heliport,
        runways: [
          {
            id: "rwy-1",
            width: 40,
            ends: [
              {
                threshold: { lon: -116.8, lat: 34.85 },
                identifier: "08",
                appltsys: "none" as const,
                papi: "none" as const,
                reil: "none" as const,
                approach: true,
                takeoff: true,
              },
              {
                threshold: { lon: -116.79, lat: 34.855 },
                identifier: "26",
                appltsys: "none" as const,
                papi: "none" as const,
                reil: "none" as const,
                approach: true,
                takeoff: true,
              },
            ] as [AirportRunwayEnd, AirportRunwayEnd],
          },
        ],
        aerotows: [
          {
            id: "ato-1",
            name: "26",
            position: { lon: -116.7975, lat: 34.8548 },
            heading: 260,
          },
        ],
        winches: [
          {
            id: "wnc-1",
            name: "26",
            position: { lon: -116.7975, lat: 34.8548 },
            winch: { lon: -116.807, lat: 34.8525 },
            spacing: 25,
          },
        ],
        parkings: [
          {
            id: "prk-1",
            name: "Parking_W",
            position: { lon: -116.7965, lat: 34.8544 },
            heading: 165,
            size: 7.5,
            type: "parked_ga" as const,
          },
        ],
      },
    };
    const plan = planHeliport(PROJECT, [HANGAR], opts);
    for (const rel of ["pct001.tsc", "pct001.wad"]) {
      const text = plan.files.find((f) => f.relPath === rel)!.content;
      expect(text).toContain("parking_positions");
      expect(text).toContain("Parking_W");
      expect(text).toContain("parked_ga");
      expect(text).toMatch(/\[08\]/);
    }
    // The two files name the runway list differently, so pin each one rather than a shared substring.
    expect(plan.files.find((f) => f.relPath === "pct001.tsc")!.content).toContain(
      "[list_tmsimulator_runway][runways]",
    );
    expect(plan.files.find((f) => f.relPath === "pct001.wad")!.content).toContain(
      "[list_tmworld_airport_detailed_rwy_pair][runway_pairs]",
    );
    // The glider starts are .wad-only: present there, absent from the .tsc, and that is correct.
    const wad = plan.files.find((f) => f.relPath === "pct001.wad")!.content;
    const tsc = plan.files.find((f) => f.relPath === "pct001.tsc")!.content;
    for (const t of ["glider_aerotows", "glider_winches"]) {
      expect(wad).toContain(t);
      expect(tsc).not.toContain(t);
    }
  });

  // ★★ INSTALLABLE ALONE (v1.5, forum #255). "When all data entries for an airport are made, it must
  // already be able to be installed alone - even if no other element for this airport has yet been
  // entered." Through v1.4 an empty pad list was silently replaced by ONE invented pad at the POI anchor,
  // which was right for the opt-in heliport TEMPLATE — a template with no helipad has nowhere to spawn a
  // helicopter — and wrong here: it wrote a helipad the user never placed into a file they are installing
  // precisely to see what FS 4 already knows about the code.
  it("writes NO helipad when the project has none, instead of inventing one", () => {
    const opts = { identity: ID, heliport: { pads: [], position: PAD.position } };
    const plan = planHeliport(PROJECT, [HANGAR], opts);
    const tsc = plan.files.find((f) => f.relPath === "pct001.tsc")!.content;
    const wad = plan.files.find((f) => f.relPath === "pct001.wad")!.content;
    // The LISTS are still written — they are DEFAULT rows in his own files (#217/#236) — but empty.
    expect(tsc).toContain("[list_tmsimulator_helipad][helipads][]");
    expect(tsc).not.toContain("[tmsimulator_helipad][element]");
    expect(wad).not.toContain("[tmworld_airport_detailed_helipad][element]");
    // And the identity is all there, which is the point of installing it at all.
    expect(tsc).toContain("[icao][PCT001]");
  });

  it("says out loud that a pad-less airport starts nothing", () => {
    // Nobody has flown one. An empty LOCATION entry must not read as a PCT bug.
    const opts = { identity: ID, heliport: { pads: [], position: PAD.position } };
    const plan = planHeliport(PROJECT, [HANGAR], opts);
    expect(plan.warnings.some((w) => w.includes("no helipad"))).toBe(true);
  });

  it("still gives the export TEMPLATE its default pad — the two callers want opposite things", () => {
    // The guard on the split: fixing the install must not quietly change the #160 template, which has
    // been shipping an invented pad since v1.1 and is a different object with a different job.
    const plan = planExport(PROJECT, [HANGAR], { heliport: { pads: [] } });
    const tsc = plan.files.find((f) => f.relPath === HELIPORT_TSC_FILE)!.content;
    expect(tsc).toContain("[tmsimulator_helipad][element]");
  });

  it("drops the cultivation reference entirely for an empty project", () => {
    const plan = planHeliport(PROJECT, [], OPTS);
    expect(plan.files.map((f) => f.relPath)).toEqual(["pct001.tsc", "pct001.wad", "README.txt"]);
    expect(plan.warnings.some((w) => w.includes("no objects"))).toBe(true);
  });

  it("names the two files after the code, and carries the identity into them", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    expect(plan.files.map((f) => f.relPath)).toContain("pct001.tsc");
    expect(plan.files.map((f) => f.relPath)).toContain("pct001.wad");
    expect(plan.files.map((f) => f.relPath)).not.toContain("poi.tsl");
    const tsc = plan.files.find((f) => f.relPath === "pct001.tsc")!.content;
    expect(tsc).toContain("[icao][PCT001]");
    expect(tsc).toContain("[sname][PCT Test Heliport]");
    expect(tsc).not.toContain("__ICAO__");
    expect(plan.country).toBe("us");
  });

  // ApfelFlieger, forum #172: the icao ROW must be capitals for FS 4 to display the airport, while the
  // file and folder names stay lowercase. IPACS agrees with itself on this — `de0025.wad` holds `DE0025`.
  // v1.1 and v1.2 wrote the code lowercase in both files; the sim matched it anyway (codes are compared
  // case-insensitively), so the only symptom was cosmetic, which is exactly why it shipped twice.
  it("writes the code in CAPITALS inside both files, and in lowercase on disk", () => {
    const plan = planHeliport(PROJECT, [HANGAR], { ...OPTS, identity: { ...ID, icao: "ab12" } });

    expect(plan.folderName.startsWith("ab12_")).toBe(true);
    expect(plan.files.map((f) => f.relPath)).toEqual(
      expect.arrayContaining(["ab12.tsc", "ab12.wad"]),
    );

    for (const rel of ["ab12.tsc", "ab12.wad"]) {
      const text = plan.files.find((f) => f.relPath === rel)!.content;
      expect(text).toContain("[icao][AB12]");
      expect(text).not.toContain("[icao][ab12]");
      // Only the CODE goes up. `country` is a path segment under scenery/airports/ and IPACS writes it
      // lowercase in its own files, so it must not be swept along.
      expect(text).toContain("[country][us]");
    }
  });

  it("marks its README so only PCT's own folders are ever offered for Uninstall", () => {
    const readme = planHeliport(PROJECT, [HANGAR], OPTS).files.find((f) => f.relPath === "README.txt")!;
    expect(readme.content).toContain(HELIPORT_README_MARKER);
  });

  it("refuses an identity that never passed validation, rather than writing a broken airport", () => {
    expect(() => planHeliport(PROJECT, [HANGAR], { ...OPTS, identity: { ...ID, country: ".." } })).toThrow(
      InvalidHeliportIdentityError,
    );
  });
});

describe("icaoIndex", () => {
  it("reads codes from .wad FILENAMES across all three roots, lowercased", () => {
    const install = path.join(tmp, "install");
    const user = path.join(tmp, "user");
    touch(install, "scenery/airports_db/kdag.wad");
    touch(install, "scenery/airports/ch/lsgb/LSGB.WAD"); // case is the disk's business, not ours
    touch(user, "scenery/airports/na/us/mine/pct001.wad");
    touch(user, "scenery/airports/na/us/mine/pct001.tsc"); // not a .wad → not a code
    const taken = scanTakenIcaos(install, user);
    expect([...taken].sort()).toEqual(["kdag", "lsgb", "pct001"]);
  });

  it("never opens a file — a .wad that cannot be read still counts", () => {
    // Belt and braces on the zero-IPACS-bytes rule: the index is readdir-only, so an unreadable or
    // binary file is indistinguishable from an empty one.
    const install = path.join(tmp, "install");
    touch(install, "scenery/airports_db/kdag.wad");
    expect(scanTakenIcaos(install, null).has("kdag")).toBe(true);
  });

  it("treats missing roots as empty, not as an error", () => {
    expect(scanTakenIcaos(path.join(tmp, "nope"), null).size).toBe(0);
    expect(scanTakenIcaos(null, null).size).toBe(0);
  });

  it("memoises, and refresh: true sees a code that appeared since", () => {
    const install = path.join(tmp, "install");
    touch(install, "scenery/airports_db/kdag.wad");
    expect(takenIcaos(install, null).has("late")).toBe(false);
    touch(install, "scenery/airports_db/late.wad");
    expect(takenIcaos(install, null).has("late")).toBe(false); // memo — this is the typing path
    expect(takenIcaos(install, null, { refresh: true }).has("late")).toBe(true); // the write path
  });
});

// ★ forum #170: "The airfield code must be changed every time." Two faults met here — PCT counted its
// OWN heliport as a collision, so re-installing after an adjustment was impossible; and deleting the
// folder by hand did not release the code either. His test zip is SHJH, SHJI, SHJJ, SHJK, SHJL: five
// codes for one rooftop pad.
describe("icaoStatus — your own heliport is not a collision", () => {
  /** Install OPTS's heliport into `tmp` and return where it landed. */
  const install = (opts = OPTS): string => {
    const plan = planHeliport(PROJECT, [HANGAR], opts);
    forgetTakenIcaos();
    return writePoi(plan, airportRoot(tmp, plan.country), {
      overwrite: true,
      isSafeName: isSafeAirportFolderName,
    }).path;
  };

  it("reports a code PCT installed as `ours`, NOT as taken", () => {
    install();
    const s = icaoStatus(null, tmp, "pct001", { refresh: true });
    expect(s.taken).toBe(false); // ← v1.1 said true here, and blocked the button
    expect(s.ours.map((h) => h.icao)).toEqual(["pct001"]);
  });

  it("still refuses a code held by somebody else's airport", () => {
    const other = path.join(tmp, "scenery", "airports", "de", "de0869_albersthof");
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(other, "de0869.wad"), "");
    const s = icaoStatus(null, tmp, "de0869", { refresh: true });
    expect(s.taken).toBe(true);
    expect(s.ours).toEqual([]);
  });

  it("releases the code as soon as the folder is deleted BY HAND, with no PCT involved", () => {
    const at = install();
    expect(icaoStatus(null, tmp, "pct001", { refresh: true }).ours).toHaveLength(1);
    rmSync(at, { recursive: true, force: true }); // Finder / Explorer, not PCT
    const s = icaoStatus(null, tmp, "pct001", { refresh: true });
    expect(s.taken).toBe(false);
    expect(s.ours).toEqual([]);
  });

  it("finds the earlier folder when the heliport has since been RENAMED", () => {
    // The subtle half: heliportFolderName is <code>_<name>, so renaming produces a DIFFERENT directory.
    // Without spotting the old one, two folders would claim pct001 and the sim would take whichever it
    // saw last. runHeliportInstall removes the ones that are not the destination.
    install();
    const renamed = { ...OPTS, identity: { ...ID, name: "Rooftop Pad" } };
    const plan = planHeliport(PROJECT, [HANGAR], renamed);
    expect(plan.folderName).not.toBe("pct001_pct_test_heliport");
    const s = icaoStatus(null, tmp, "pct001", { refresh: true });
    expect(s.ours.map((h) => h.folderName)).toEqual(["pct001_pct_test_heliport"]);
  });
});

describe("the folder name comes from the IDENTITY, not the POI slug", () => {
  // The bug this pins down: a fresh project has no `poiName`, so the POI folder name came out as
  // `w07055s3345_` — a coordinate prefix and nothing else — and the write boundary refused it with
  // "Unsafe POI folder name", a message written for a programmer. A heliport lives under
  // scenery/airports/, where a coordinate prefix means nothing anyway.
  const UNNAMED: Project = { ...PROJECT, poiName: "", name: "" };

  it("builds <code>_<name>, IPACS's own convention in that tree", () => {
    expect(planHeliport(PROJECT, [HANGAR], OPTS).folderName).toBe("pct001_pct_test_heliport");
  });

  it("works for a project with no name at all", () => {
    const plan = planHeliport(UNNAMED, [HANGAR], OPTS);
    expect(plan.folderName).toBe("pct001_pct_test_heliport");
    expect(isSafeAirportFolderName(plan.folderName)).toBe(true);
  });

  it("falls back to the bare code when the name slugs away to nothing", () => {
    const plan = planHeliport(PROJECT, [HANGAR], { ...OPTS, identity: { ...ID, name: "!!! ???" } });
    expect(plan.folderName).toBe("pct001");
    expect(isSafeAirportFolderName(plan.folderName)).toBe(true);
  });

  it("produces a safe name from anything validateIdentity lets through", () => {
    for (const name of ["A B", "x/y", "..", "Ünïcödé", "a".repeat(SNAME_MAX)]) {
      const id = { ...ID, name };
      if (validateIdentity(id) !== null) continue;
      expect(isSafeAirportFolderName(heliportFolderName(id))).toBe(true);
    }
  });

  it("rejects a name with a separator or a dot at the boundary", () => {
    for (const bad of ["../etc", "a/b", "a\\b", "a.b", "", "A", "a".repeat(81)]) {
      expect(isSafeAirportFolderName(bad)).toBe(false);
    }
  });
});

describe("installing under scenery/airports", () => {
  const write = (plan: ReturnType<typeof planHeliport>) =>
    writePoi(plan, airportRoot(tmp, plan.country), {
      overwrite: false,
      isSafeName: isSafeAirportFolderName,
    });

  it("puts the folder in <userDir>/scenery/airports/<country>/", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    const w = write(plan);
    expect(w.path).toBe(path.join(tmp, "scenery", "airports", "us", "pct001_pct_test_heliport"));
    expect(existsSync(path.join(w.path, "pct001.tsc"))).toBe(true);
    expect(existsSync(path.join(w.path, "poi.tsl"))).toBe(false);
  });

  it("refuses a country code that is not two letters, at the PATH boundary", () => {
    // core validates it too, but this is the check that stands between a string and a directory.
    for (const bad of ["..", "../../etc", "u", "USA", "u/s"]) {
      expect(() => airportRoot(tmp, bad)).toThrow(UnsafeCountryError);
    }
  });

  it("lists only folders carrying PCT's heliport marker, and uninstalls them", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    writePoi(plan, airportRoot(tmp, "us"), { overwrite: false, isSafeName: isSafeAirportFolderName });
    // Somebody else's airport, in the same tree, with a valid-looking name.
    const other = path.join(tmp, "scenery", "airports", "de", "e01185n4838_someone_else");
    mkdirSync(other, { recursive: true });
    writeFileSync(path.join(other, "README.txt"), "not ours\n");

    const rows = listInstalledHeliports(tmp);
    expect(rows).toEqual([{ folderName: plan.folderName, country: "us", icao: "pct001" }]);

    uninstallHeliport(tmp, "us", plan.folderName);
    expect(listInstalledHeliports(tmp)).toEqual([]);
    expect(existsSync(other)).toBe(true); // and it left the other one alone
  });

  it("reads the code off the .tsc filename, so it cannot disagree with what the sim keys on", () => {
    const plan = planHeliport(PROJECT, [HANGAR], { ...OPTS, identity: { ...ID, icao: "ab12" } });
    writePoi(plan, airportRoot(tmp, "us"), { overwrite: false, isSafeName: isSafeAirportFolderName });
    expect(listInstalledHeliports(tmp)[0].icao).toBe("ab12");
  });

  it("survives a missing airports tree", () => {
    expect(listInstalledHeliports(path.join(tmp, "nothing-here"))).toEqual([]);
  });
});

describe("★ nothing may precede the root <[file] tag", () => {
  // The failure this pins down: with a ten-line `//` banner above `<[file]`, the sim logs
  // `ERROR: (error loading '…/pct002.tsc')` and NOTHING else. The `.wad` still loads, so the code is in
  // the airport database while the place is missing — the airport half-exists and cannot be flown, and
  // the LOCATION search shows nothing. Measured on 2026-07-31; the same file without the banner flew.
  // Both known-good heliports agree (ApfelFlieger's de0869, the Hong Kong pack).
  const startsClean = (text: string): boolean => text.startsWith("<[file][][]");

  it("holds for an installed heliport", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    for (const f of plan.files.filter((x) => /\.(tsc|wad)$/.test(x.relPath))) {
      expect(startsClean(f.content), `${f.relPath} must start on <[file]`).toBe(true);
    }
  });

  it("holds for the by-hand templates too — the user renames them INTO a .tsc", () => {
    for (const text of [buildHeliportTsc(TEMPLATE_SPEC), buildHeliportWad(TEMPLATE_SPEC)]) {
      expect(startsClean(text)).toBe(true);
    }
  });

  // v1.1 hung a trailing `// …` off each tag line, separated by TABs. Both are gone: the descriptions
  // moved into a banner INSIDE the place block (ApfelFlieger #167, the shape IPACS uses in its aircraft
  // files) and TABs went with them, on Jan's advice that they "could lead to interference".
  it("carries the descriptions in a banner, with no TAB anywhere", () => {
    const tsc = planHeliport(PROJECT, [HANGAR], OPTS).files.find((f) => f.relPath === "pct001.tsc")!;
    expect(tsc.content).toContain("//  Informations:");
    expect(tsc.content).not.toContain("\t");
  });
});

describe("the installed heliport's README", () => {
  it("carries the instructions the files may not — including how to undo it", () => {
    const readme = planHeliport(PROJECT, [HANGAR], OPTS).files.find((f) => f.relPath === "README.txt")!;
    expect(readme.content).toContain("To remove it");
    expect(readme.content).toContain("cannot speak for"); // the honest limit of the check
  });
});
