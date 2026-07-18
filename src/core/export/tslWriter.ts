// tslWriter.ts — Project → `poi.tsl`, the AFS4 `tmsimulator_scenery_place_simple` that
// AFS4 loads for a POI (design §3.4, format bible FILES - POI - POI.TSL).
//
// For PCT the .tsl is a thin wrapper around the `poi.toc` cultivation file (referenced via the
// `cultivation` field), where the whole payload lives. The ONE exception is the plant anchor: a POI
// with plants also carries a single reference-POI object here at terrain height, so the sim anchors the
// cultivation's bounding volume and the plants stop blinking (v0.4 — see plantAnchor.ts). (The Race App
// put ALL objects inline here; PCT ships none of its own except that anchor.)
//
// Both remaining details came from the format's author (ApfelFlieger, 2026-07-17), with a real
// working file attached — see the two notes below. The place-level empty `geometry` tag the Race
// App's proven .tsl carried was likewise dropped on his word (2026-07-08).

import { tag, block, fmtLonLat, fmtMeters } from "../tm/tmEmit";
import { ANCHOR_GEOMETRY, type PlantAnchor } from "./plantAnchor";

/** Build the `poi.tsl` text.
 *  @param opts.tocFileName  cultivation reference (the .toc basename), or null for no toc.
 *  @param opts.anchor       the plant reference-POI anchor (plantAnchor.ts), or null/absent for a POI
 *                           with no plants — then the .tsl carries no objects, exactly as before v0.4.
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
export function buildTsl(opts: { tocFileName: string | null; anchor?: PlantAnchor | null }): string {
  const body = [tag("string8u", "coordinate_system", "lonlat"), tag("bool", "autoheight", "false")];
  if (opts.tocFileName !== null) {
    body.push(tag("string8u", "cultivation", opts.tocFileName));
  }
  if (opts.anchor) {
    body.push(...anchorObjects(opts.anchor));
  }
  const place = block("tmsimulator_scenery_place_simple", "", "", body);
  return block("file", "", "", place).join("\n") + "\n";
}

/** The reference-POI anchor object a POI carries in its .tsl when it has plants (v0.4). One
 *  `tmsimulator_scenery_object` with real geometry at terrain height, which anchors the cultivation's
 *  bounding volume so the plants stop blinking. ABSOLUTE mode: the place stays autoheight=false and the
 *  position z is the terrain ASL, so there is NO `autoheight_override` — object and place agree, exactly
 *  as IPACS's official exporter emits `__af_abs`. In-sim gate 2026-07-17 confirmed the anchor holds in
 *  absolute mode. See plantAnchor.ts for the why. */
function anchorObjects(anchor: PlantAnchor): string[] {
  const pos = `${fmtLonLat(anchor.position.lon)} ${fmtLonLat(anchor.position.lat)} ${fmtMeters(anchor.heightAsl)}`;
  const element = block("tmsimulator_scenery_object", "element", "0", [
    tag("string8u", "type", "object"),
    tag("string8u", "geometry", ANCHOR_GEOMETRY),
    tag("vector3_float64", "position", pos),
  ]);
  return block("list_tmsimulator_scenery_object", "objects", "", element);
}
