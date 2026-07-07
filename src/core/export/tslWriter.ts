// tslWriter.ts — Project → `poi.tsl`, the AFS4 `tmsimulator_scenery_place_simple` that
// AFS4 loads for a POI (design §3.4, format bible FILES - POI - POI.TSL).
//
// For PCT the .tsl is a thin wrapper: it holds no objects of its own, it just points at the
// `poi.toc` cultivation file via the `cultivation` field. (The Race App put objects inline
// here instead; PCT's whole payload lives in the .toc.)
//
// The tag set + order mirrors a REAL, proven-working text .tsl — the Race App's installed POI
// (…/scenery/poi/<coord>_mi_primera_carrera/…tsl), which AFS4 loads fine. We keep the empty
// place-level `geometry` tag it carries so PCT's .tsl differs from that known-good file in
// only ONE way: `cultivation` points at a .toc instead of being empty (and no inline objects).
// That isolates the variable for the M1 in-sim matrix (§6.2). The sim ships its own POIs
// binary-packed, so this text form + in-sim testing is the only way to confirm:
//   V5 — whether the .tsl wrapper is mandatory at all, or a lone .toc suffices.
//   V1 — the exact `cultivation` reference form. We follow the sim's file-reference habit
//        (a .tmb geometry is referenced by basename, no extension), so we pass the .toc's
//        basename ("poi") — planExport writes the file as "poi.toc".

import { tag, block } from "../tm/tmEmit";

/** Build the `poi.tsl` text.
 *  @param opts.name         human title stored in the place (shown by the sim's tools).
 *  @param opts.tocFileName  cultivation reference (the .toc basename), or null for no toc. */
export function buildTsl(opts: { name: string; tocFileName: string | null }): string {
  const body = [
    tag("string8", "name", opts.name),
    tag("string8u", "coordinate_system", "lonlat"),
    tag("bool", "autoheight", "true"),
    tag("string8u", "geometry", ""), // empty at place level — matches the known-good .tsl
  ];
  if (opts.tocFileName !== null) {
    body.push(tag("string8u", "cultivation", opts.tocFileName));
  }
  const place = block("tmsimulator_scenery_place_simple", "", "", body);
  return block("file", "", "", place).join("\n") + "\n";
}
