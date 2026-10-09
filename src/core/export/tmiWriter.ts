// tmiWriter.ts — TmiEntrySpec[] → a `.tmi` scene index, the file that makes a user's plain-text
// `.tmb` object resolvable BY NAME from a POI's `.toc` (design B2 / user object libraries).
//
// PCT ships zero model bytes. To register a user's `.tmb`, PCT writes a sibling `.tmi` that indexes
// each geometry by its INTERNAL name plus a bounding box + bounding sphere. This emitter is PURE (specs
// in, string out — no filesystem), so the registrar (main-side) owns the write surface and this stays
// golden-testable, mirroring `tocWriter.ts`. The layout `registerXref` produces — a folder of separate
// `.tmb` indexed by one multi-entry `.tmi` — loads and renders in-sim.
//
// Per entry, bs_center/bs_radius are DERIVED from the bbox alone:
//   bs_center = bbox midpoint
//   bs_radius = half the bbox space diagonal — a circumscribing sphere, which errs on the safe side (the
//               object is never hidden early). Single-pass, no second geometry read needed.

import type { Vec3 } from "../project/types";
import { tag, block, fmtF6 } from "../tm/tmEmit";

/** One geometry to index: its exact internal name and axis-aligned bounding box. bs_center/bs_radius
 *  are derived inside `buildTmi`, never passed in. */
export interface TmiEntrySpec {
  name: string;
  bbMin: Vec3;
  bbMax: Vec3;
}

const fmtVec3 = (v: Vec3): string => v.map(fmtF6).join(" ");

function entryElement(e: TmiEntrySpec, index: number): string[] {
  const [minX, minY, minZ] = e.bbMin;
  const [maxX, maxY, maxZ] = e.bbMax;
  const center: Vec3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
  return block("tmxglscene_info_entry", "element", String(index), [
    // name VERBATIM — never sanitize or synthesize it. It must equal the `.tmb`'s internal geometry
    // name and the `.toc` reference byte-for-byte, or the sim silently renders nothing. A name that couldn't be emitted safely (a stray `]`, whitespace) fails
    // XREF_NAME_RE upstream (schemas.ts) and is rejected as not-registerable — it never reaches here.
    tag("string8u", "name", e.name),
    tag("vector3_float64", "bb_min", fmtVec3(e.bbMin)),
    tag("vector3_float64", "bb_max", fmtVec3(e.bbMax)),
    tag("vector3_float64", "bs_center", fmtVec3(center)),
    tag("float64", "bs_radius", fmtF6(radius)),
  ]);
}

/** Build the byte-exact `.tmi` text indexing `entries` under bundle `bundleBase` — **the bundle FOLDER's
 *  name**, which is not necessarily any `.tmb`'s basename. Two valid layouts:
 *
 *    folder/  ONE multi-geometry folder.tmb + a multi-entry .tmi
 *    folder/  SEVERAL single-geometry .tmb (any names) + a multi-entry .tmi; no folder.tmb exists
 *
 *  PCT produces the second. The sim does NOT locate a geometry through `filename` — it resolves each
 *  entry by its `name`; `filename` is the folder name in both layouts, so that is what we write.
 *
 *  `bundleBase` is emitted verbatim — the registrar guards it as a safe slug upstream (same rationale as
 *  the entry name). Layout-agnostic: one element per entry, so single- or multi-geometry `.tmb` both work
 *  with no special case. */
export function buildTmi(bundleBase: string, entries: TmiEntrySpec[]): string {
  const info = block("tmxglscene_info", "", "", [
    tag("string8", "filename", bundleBase),
    ...block(
      "list_tmxglscene_info_entry",
      "geometries",
      "",
      entries.flatMap((e, i) => entryElement(e, i)),
    ),
  ]);
  return block("file", "", "", info).join("\n") + "\n";
}
