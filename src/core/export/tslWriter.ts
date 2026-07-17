// tslWriter.ts — Project → `poi.tsl`, the AFS4 `tmsimulator_scenery_place_simple` that
// AFS4 loads for a POI (design §3.4, format bible FILES - POI - POI.TSL).
//
// For PCT the .tsl is a thin wrapper: it holds no objects of its own, it just points at the
// `poi.toc` cultivation file via the `cultivation` field. (The Race App put objects inline
// here instead; PCT's whole payload lives in the .toc.)
//
// Both remaining details came from the format's author (ApfelFlieger, 2026-07-17), with a real
// working file attached — see the two notes below. The place-level empty `geometry` tag the Race
// App's proven .tsl carried was likewise dropped on his word (2026-07-08).

import { tag, block } from "../tm/tmEmit";

/** Build the `poi.tsl` text.
 *  @param opts.tocFileName  cultivation reference (the .toc basename), or null for no toc.
 *
 *  ── Two things this deliberately does NOT do ──────────────────────────────────────────────────
 *
 *  1. **No `<[string8][name]>`.** It used to carry project.name. The format's author: *"In this line
 *     was initially the file name again, but that doesn't make any sense at all. => I suggest
 *     deleting this line without replacement."* Dropping it also retires the export's only
 *     user-typed value, so the `]`-truncation hazard that `sanitizeValue` guarded here (Fable C2) no
 *     longer exists in the .tsl at all — the remaining values are our own literals and a slug.
 *
 *  2. **`autoheight` is FALSE, always.** This is the whole reason v0.4's plants never rendered, and
 *     it cost five in-sim flights to find:
 *
 *       `autoheight true`  → the sim forces EVERY plant to height 0 and ignores its `altitude`.
 *       `autoheight false` → each plant gets its own `altitude`.
 *
 *     At KDAG (584 m terrain) "height 0" buries every plant 584 m underground, which is why ~20
 *     format variants all failed identically and why the log stayed silent — nothing was wrong with
 *     the file. The author only caught it by moving to Heligoland, at sea level, where height 0 is
 *     roughly ground level and the difference becomes visible.
 *
 *     False is safe for everything else, which is the precondition he names ("all heights of all
 *     elements will always be entered as individual absolute height values and everything can remain
 *     as before"): PCT has always written explicit absolute ASL for every object (design R1, matrix
 *     V2), and five gates established that autoheight does not reach xref cultivation at all — the
 *     archived autoheight investigation exists precisely because it does NOT work for them. So this
 *     flag was inert for our xrefs and actively harmful to our plants. */
export function buildTsl(opts: { tocFileName: string | null }): string {
  const body = [tag("string8u", "coordinate_system", "lonlat"), tag("bool", "autoheight", "false")];
  if (opts.tocFileName !== null) {
    body.push(tag("string8u", "cultivation", opts.tocFileName));
  }
  const place = block("tmsimulator_scenery_place_simple", "", "", body);
  return block("file", "", "", place).join("\n") + "\n";
}
