import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseXrefTable, lookupXref } from "../../src/core/catalog/xrefTable";

// Opt-in LOCAL test — validates the parser against the REAL official `xref_table.csv` WITHOUT copying
// any of it into the repo (guardrail: assertions check derived properties, never hardcoded IPACS
// values). Point at the CSV with PCT_XREF_TABLE=<file>, or drop it anywhere under `_local_reference/`
// (gitignored). Auto-skips when absent so CI stays green and IPACS-free.
function findCsv(): string | null {
  const env = process.env.PCT_XREF_TABLE;
  if (env && existsSync(env)) return env;
  const stack = [path.resolve("_local_reference")];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__MACOSX" || e.name.startsWith("._")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.toLowerCase() === "xref_table.csv") return full;
    }
  }
  return null;
}

const csvPath = findCsv();

describe.skipIf(!csvPath)("parseXrefTable vs the real official xref_table.csv (local, opt-in)", () => {
  it("parses cleanly: hundreds of rows, zero warnings, every row well-formed", () => {
    const t = parseXrefTable(readFileSync(csvPath!, "utf8"));
    expect(t.rows).toBeGreaterThan(700); // ~753 in the 2026-04-10 snapshot
    expect(t.warnings).toEqual([]); // the real table parses with no complaints

    for (const e of t.byName.values()) {
      expect(e.name).not.toBe("");
      expect(e.displayName).not.toBe("");
      expect(e.taxonomy.main).not.toBe("");
      // a present footprint is a finite polygon of ≥3 vertices, stored open (no repeated closing vertex)
      if (e.footprint) {
        expect(e.footprint.length).toBeGreaterThanOrEqual(3);
        for (const [x, y] of e.footprint) {
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        }
        const [fx, fy] = e.footprint[0];
        const [lx, ly] = e.footprint[e.footprint.length - 1];
        expect(fx === lx && fy === ly).toBe(false);
      }
    }

    // Lookup is case-insensitive: a mixed-case scanned name must still resolve.
    const first = [...t.byName.keys()][0];
    expect(lookupXref(t, first.toUpperCase())).not.toBeNull();
  });
});
