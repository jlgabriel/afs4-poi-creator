import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultXrefTableCandidates, loadXrefTable } from "../../src/main/xrefTableSource";

// Synthetic CSV — invented values, real column grammar (one closed unit ring + one truescale ring).
const CSV = [
  "name internal;display name;main category;sub category;type category;length;width;height;offset;shape;shape truescale",
  "pct_a;PCT A;M;S;T;1;1;1;0 0 0;-1 -1;1 -1;1 1;-1 1;-1 -1;-2 -2;2 -2;2 2;-2 2;-2 -2",
].join("\n");

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-xtab-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("loadXrefTable", () => {
  it("loads the first existing candidate and parses it", () => {
    const p = path.join(tmp, "xref_table.csv");
    writeFileSync(p, CSV);
    const load = loadXrefTable([path.join(tmp, "missing.csv"), undefined, p]);
    expect(load.path).toBe(p);
    expect(load.table?.rows).toBe(1);
    expect(load.table?.byName.get("pct_a")?.displayName).toBe("PCT A");
    expect(load.warnings).toEqual([]);
  });

  it("returns a null table when no candidate exists → overlay disabled", () => {
    const load = loadXrefTable([path.join(tmp, "nope.csv"), undefined]);
    expect(load.table).toBeNull();
    expect(load.path).toBeNull();
    expect(load.warnings).toEqual([]);
  });

  it("surfaces parser warnings, tagged with the file path", () => {
    const p = path.join(tmp, "warn.csv");
    writeFileSync(p, "not a header line\n;no name;M;S;T;1;1;1;0 0 0"); // unrecognised header + empty-name row
    const load = loadXrefTable([p]);
    expect(load.table).not.toBeNull(); // a warning-laden file still loads (tolerant by contract)
    expect(load.warnings.join(" ")).toContain(p);
    expect(load.warnings.join(" ")).toContain("empty name");
  });
});

describe("defaultXrefTableCandidates", () => {
  it("prefers PCT_XREF_TABLE, then <resourcesPath>/xref_table.csv", () => {
    const c = defaultXrefTableCandidates(
      { PCT_XREF_TABLE: "/dev/mine.csv" } as unknown as NodeJS.ProcessEnv,
      "/app/resources",
    );
    expect(c).toEqual(["/dev/mine.csv", path.join("/app/resources", "xref_table.csv")]);
  });

  it("is empty when neither the env override nor resourcesPath is set → overlay disabled", () => {
    expect(defaultXrefTableCandidates({} as NodeJS.ProcessEnv, undefined)).toEqual([]);
  });
});
