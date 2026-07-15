import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseTmi } from "../../src/core/catalog/tmiParser";
import { buildTmi, type TmiEntrySpec } from "../../src/core/export/tmiWriter";

// Opt-in LOCAL test — validates `buildTmi` against REAL community/built-in `.tmi` files WITHOUT
// hardcoding any of their (IPACS/Rodeo/Michael-derived) values into the repo. It reparses whatever
// `.tmi` files sit under `_local_reference/` (gitignored) and checks that a buildTmi round-trip
// preserves every name + bbox and derives bs_center/bs_radius. Auto-skips when none are present
// (e.g. the reference zips aren't extracted), so CI stays green and IPACS-free.
// Point elsewhere — e.g. a real install's `scenery/xref` — with PCT_TMI_DIR=<dir>.
const ROOTS = [process.env.PCT_TMI_DIR, path.resolve("_local_reference")].filter(
  (x): x is string => Boolean(x),
);

function findTmi(root: string, out: string[] = []): string[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) return out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.name === "__MACOSX" || e.name.startsWith("._")) continue; // macOS zip cruft / AppleDouble stubs
    const full = path.join(root, e.name);
    if (e.isDirectory()) findTmi(full, out);
    else if (e.name.toLowerCase().endsWith(".tmi")) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => findTmi(r));

describe.skipIf(files.length === 0)("buildTmi vs real .tmi files (local, opt-in)", () => {
  it.each(files)("round-trips names + bboxes of %s", (file) => {
    const original = parseTmi(readFileSync(file, "utf8"));
    if (original.entries.length === 0) return; // skip odd/empty indexes — nothing to round-trip

    const specs: TmiEntrySpec[] = original.entries.map((e) => ({
      name: e.name,
      bbMin: e.bbMin,
      bbMax: e.bbMax,
    }));
    const reparsed = parseTmi(buildTmi(original.bundle, specs));

    expect(reparsed.warnings).toEqual([]);
    expect(reparsed.bundle).toBe(original.bundle);
    expect(reparsed.entries).toHaveLength(original.entries.length);

    reparsed.entries.forEach((e, i) => {
      const src = original.entries[i];
      // Name + bbox survive verbatim (bbox to 6 decimals — the emitter's precision).
      expect(e.name).toBe(src.name);
      e.bbMin.forEach((v, k) => expect(v).toBeCloseTo(src.bbMin[k], 6));
      e.bbMax.forEach((v, k) => expect(v).toBeCloseTo(src.bbMax[k], 6));
      // bs_center/bs_radius are PCT-DERIVED (midpoint + half-diagonal) — NOT a byte-match with the
      // source (IPACS ships tighter true spheres by design); assert they equal our derivation.
      src.bbMin.forEach((mn, k) => expect(e.bsCenter[k]).toBeCloseTo((mn + src.bbMax[k]) / 2, 6));
      const r =
        Math.hypot(src.bbMax[0] - src.bbMin[0], src.bbMax[1] - src.bbMin[1], src.bbMax[2] - src.bbMin[2]) /
        2;
      expect(e.bsRadius).toBeCloseTo(r, 6);
    });
  });
});
