// tocWriter.ts — Project objects → `poi.toc`, the AFS4 `cultivation` file that places
// built-in xref objects BY NAME (design §3.4, format bible FILES - POI - POI.TOC).
//
// This is what makes PCT different from the Race App exporter: the Race App bundles .tmb
// models and lists them inline in the .tsl; PCT ships no bytes and instead references the
// sim's built-in objects through a cultivation `list_xref`. Each xref carries:
//   position [lon lat height]   — height is ASL for POIs (design R1 / matrix V2)
//   direction °                 — clockwise positive; negative = counterclockwise
//   scale_factor                — uniform
//   name                        — the exact xref id
//
// Output is byte-exact and golden-tested. Format assumptions still pending in-sim
// confirmation are flagged for the M1 verification matrix (§6.2).

import type { ResolvedXref } from "../project/types";
import { tag, block, fmtLonLat, fmtMeters, fmtNum } from "../tm/tmEmit";

function xrefElement(o: ResolvedXref): string[] {
  const position = `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)} ${fmtMeters(o.heightAsl)}`;
  return block("xref", "element", "", [
    tag("vector3_float64", "position", position),
    tag("float64", "direction", fmtNum(o.direction, 3)),
    tag("float32", "scale_factor", fmtNum(o.scale, 4)),
    tag("string8u", "name", o.name),
  ]);
}

/** Build the `poi.toc` text for a set of height-resolved objects.
 *  V-matrix assumption: a POI with only xrefs needs just the `xref_list` inside
 *  `cultivation` — the optional plant/light/airport_light lists are omitted, not emitted
 *  empty. If in-sim testing shows the sim wants them present, add them here. */
export function buildToc(objects: ResolvedXref[]): string {
  const xrefList = block("list_xref", "xref_list", "", objects.flatMap(xrefElement));
  const cultivation = block("cultivation", "", "", [
    tag("string8", "coordinate_system", "lonlat"),
    tag("string8", "buildings_texture_folder", ""),
    ...xrefList,
  ]);
  return block("file", "", "", cultivation).join("\n") + "\n";
}
