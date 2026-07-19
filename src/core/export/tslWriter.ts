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
import { ANCHOR_GEOMETRY, type Anchor } from "./plantAnchor";

/** The AGL z of the anchor object in autoheight mode: 0.1 m above the ground, paired with
 *  autoheight_override=-1. A literal string so the bytes match the value flown firm in the 2026-07-19 gate. */
const ANCHOR_AGL_Z = "0.1";

/** Build the `poi.tsl` text.
 *  @param opts.tocFileName  cultivation reference (the .toc basename), or null for no toc.
 *  @param opts.anchor       the reference-POI anchor (plantAnchor.ts), or null/absent for no anchor object
 *                           — then the .tsl carries no objects, exactly as before v0.4.
 *  @param opts.autoheight   true → the place is autoheight=true and the anchor is written AGL (see below).
 *
 *  ── Two things this deliberately does NOT do ──────────────────────────────────────────────────
 *
 *  1. **No `<[string8][name]>`.** It used to carry project.name. The format's author: *"In this line
 *     was initially the file name again, but that doesn't make any sense at all. => I suggest
 *     deleting this line without replacement."* Dropping it also retires the export's only
 *     user-typed value, so the `]`-truncation hazard that `sanitizeValue` guarded here (Fable C2) no
 *     longer exists in the .tsl at all — the remaining values are our own literals and a slug.
 *
 *  2. **`autoheight` reflects the project's height mode** (`opts.autoheight`, default false):
 *
 *       baked-asl (default) → `autoheight=false`. Each object carries its own absolute ASL height (design
 *         R1); the flag is inert for xref cultivation (five gates) — and false is REQUIRED for plants:
 *         `autoheight=true` ALONE forces EVERY plant to height 0 and ignores its `altitude`, which at KDAG
 *         (583 m) buries them 583 m underground (five flights + ~20 silent-log variants to find, v0.4).
 *       autoheight → `autoheight=true` + the pct_anchor (always present here). The anchor makes the flag
 *         REACH the cultivation, so each object written at z=0 snaps to the terrain (AGL) — forum #142,
 *         gate 2026-07-19. Plants at altitude 0 land at ground level too (not buried), because the anchor
 *         supplies the terrain reference the bare flag lacked. `asl` heights are rejected upstream
 *         (resolveHeightsAgl) — they have no AGL meaning under this flag. */
export function buildTsl(opts: {
  tocFileName: string | null;
  anchor?: Anchor | null;
  autoheight?: boolean;
}): string {
  const autoheight = opts.autoheight ?? false;
  const body = [
    tag("string8u", "coordinate_system", "lonlat"),
    tag("bool", "autoheight", autoheight ? "true" : "false"),
  ];
  if (opts.tocFileName !== null) {
    body.push(tag("string8u", "cultivation", opts.tocFileName));
  }
  if (opts.anchor) {
    body.push(...anchorObjects(opts.anchor, autoheight));
  }
  const place = block("tmsimulator_scenery_place_simple", "", "", body);
  return block("file", "", "", place).join("\n") + "\n";
}

/** The reference-POI anchor object (`pct_anchor`) a POI carries in its .tsl. One `tmsimulator_scenery_object`
 *  whose real geometry anchors the cultivation's bounding volume. Two shapes, one per mode:
 *
 *    ABSOLUTE (baked-asl / plants): position z = terrain ASL, NO `autoheight_override` — object and place
 *      agree at autoheight=false, exactly as IPACS's official exporter emits `__af_abs`. Anchors the
 *      plants' bounding volume so they stop blinking (in-sim gate 2026-07-17).
 *    AGL (autoheight): position z = ANCHOR_AGL_Z (just above ground) + `autoheight_override=-1` (inherit the
 *      place's autoheight=true). This is what makes autoheight REACH the cultivation, grounding every object
 *      written at z=0 (in-sim gate 2026-07-19). See plantAnchor.ts for the why. */
function anchorObjects(anchor: Anchor, autoheight: boolean): string[] {
  const z = autoheight ? ANCHOR_AGL_Z : fmtMeters(anchor.heightAsl);
  const pos = `${fmtLonLat(anchor.position.lon)} ${fmtLonLat(anchor.position.lat)} ${z}`;
  const children = [
    tag("string8u", "type", "object"),
    tag("string8u", "geometry", ANCHOR_GEOMETRY),
    tag("vector3_float64", "position", pos),
  ];
  if (autoheight) children.push(tag("int32", "autoheight_override", "-1"));
  const element = block("tmsimulator_scenery_object", "element", "0", children);
  return block("list_tmsimulator_scenery_object", "objects", "", element);
}
