import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseUserTmb, isTextTmb } from "../../src/core/catalog/userTmb";

// Opt-in LOCAL test — validates parseUserTmb against REAL community `.tmb` WITHOUT copying any of
// their bytes into the repo (guardrail #8: the assertions check derived properties, never hardcoded
// dimensions). Reads whatever `.tmb` sit under `_local_reference/` (gitignored); auto-skips when none
// are present (e.g. the reference zips aren't extracted), so CI stays green and IPACS-free.
// Point elsewhere — e.g. a folder of extracted `.tmb` — with PCT_TMB_DIR=<dir>.
const ROOTS = [process.env.PCT_TMB_DIR, path.resolve("_local_reference")].filter(
  (x): x is string => Boolean(x),
);

function findTmb(root: string, out: string[] = []): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name === "__MACOSX" || e.name.startsWith("._")) continue; // macOS zip cruft / AppleDouble stubs
    const full = path.join(root, e.name);
    if (e.isDirectory()) findTmb(full, out);
    else if (e.name.toLowerCase().endsWith(".tmb")) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => findTmb(r));

describe.skipIf(files.length === 0)("parseUserTmb vs real .tmb files (local, opt-in)", () => {
  it.each(files)("classifies + parses %s", (file) => {
    const text = readFileSync(file, "utf8");
    const base = path.basename(file, path.extname(file));

    if (!isTextTmb(text)) {
      // Compiled/opaque class (e.g. the IPACS box) — nothing derivable; that's the whole point.
      expect(parseUserTmb(text).geometries).toEqual([]);
      return;
    }

    const { geometries } = parseUserTmb(text);
    expect(geometries.length).toBeGreaterThan(0);
    for (const g of geometries) {
      expect(g.name).not.toBe("");
      for (let k = 0; k < 3; k++) {
        expect(Number.isFinite(g.bbMin[k])).toBe(true);
        expect(g.bbMax[k]).toBeGreaterThanOrEqual(g.bbMin[k]); // ordered, finite bbox
      }
    }

    // The MDIvey/Rodeo pylons are single-geometry, internal name == basename. Loose bounds only —
    // no exact dimension is hardcoded into the repo.
    if (/^pylon_15m$/i.test(base)) {
      expect(geometries).toHaveLength(1);
      expect(geometries[0].name).toBe("pylon_15m");
      const zSpan = geometries[0].bbMax[2] - geometries[0].bbMin[2];
      expect(zSpan).toBeGreaterThan(10);
      expect(zSpan).toBeLessThan(20); // ~15 m tall
    }
  });
});
