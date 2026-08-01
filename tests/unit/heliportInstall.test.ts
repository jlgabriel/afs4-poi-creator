// The INSTALLED heliport: the path where PCT writes outside scenery/poi/ for the first time. Everything
// here is about the guards on that, not about the file format (tests/unit/heliport.test.ts covers that).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Project, ResolvedXref } from "../../src/core/project/types";
import { InvalidHeliportIdentityError, planHeliport } from "../../src/core/export/planExport";
import {
  HELIPORT_README_MARKER,
  validateIdentity,
  SNAME_MAX,
} from "../../src/core/export/heliportTemplate";
import {
  UnsafeCountryError,
  airportRoot,
  listInstalledHeliports,
  uninstallHeliport,
  writePoi,
} from "../../src/main/installer";
import { forgetTakenIcaos, scanTakenIcaos, takenIcaos } from "../../src/main/icaoIndex";

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
const OPTS = { identity: ID, heliport: { objectId: "hangar" as string | null, radiusM: 10 } };

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
    expect(tsc).toContain("[icao][pct001]");
    expect(tsc).toContain("[sname][PCT Test Heliport]");
    expect(tsc).not.toContain("__ICAO__");
    expect(plan.country).toBe("us");
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

describe("installing under scenery/airports", () => {
  it("puts the folder in <userDir>/scenery/airports/<country>/", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    const w = writePoi(plan, airportRoot(tmp, plan.country), { overwrite: false });
    expect(w.path).toBe(path.join(tmp, "scenery", "airports", "us", plan.folderName));
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
    writePoi(plan, airportRoot(tmp, "us"), { overwrite: false });
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
    writePoi(plan, airportRoot(tmp, "us"), { overwrite: false });
    expect(listInstalledHeliports(tmp)[0].icao).toBe("ab12");
  });

  it("survives a missing airports tree", () => {
    expect(listInstalledHeliports(path.join(tmp, "nothing-here"))).toEqual([]);
  });
});

describe("the installed heliport's README", () => {
  it("says how to undo it — a file that shadows an airport has to be honest about that", () => {
    const plan = planHeliport(PROJECT, [HANGAR], OPTS);
    const w = writePoi(plan, airportRoot(tmp, plan.country), { overwrite: false });
    const tsc = readFileSync(path.join(w.path, "pct001.tsc"), "utf8");
    expect(tsc).toContain("To remove it");
    expect(tsc).not.toContain("HELIPORT TEMPLATE"); // that header belongs to the by-hand files
  });
});
