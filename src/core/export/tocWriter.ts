// tocWriter.ts — Project objects → `poi.toc`, the AFS4 `cultivation` file that places
// built-in xref objects BY NAME (design §3.4, format bible FILES - POI - POI.TOC).
//
// This is what makes PCT different from the Race App exporter: the Race App bundles .tmb
// models and lists them inline in the .tsl; PCT ships no bytes and instead references the
// sim's built-in objects through a cultivation `list_xref`. Field order, tag types and the
// per-element index all follow the canonical hand-authored cultivation
// (the canonical cultivation layout — the reference layout). Each
// xref element carries, IN THIS ORDER:
//   name                        — the exact xref id
//   position [lon lat height]   — height is ASL for POIs (design R1 / matrix V2)
//   direction °                 — clockwise positive; negative = counterclockwise
//   scale_factor                — uniform
//
// Output is byte-exact and golden-tested. The cultivation layout now mirrors the canonical
// file (2026-07-10); the new byte layout is pending re-confirmation in the M3 in-sim gate.

import type { ResolvedXref } from "../project/types";
import { tag, block, sanitizeValue, fmtLonLat, fmtMeters, fmtNum } from "../tm/tmEmit";

function xrefElement(o: ResolvedXref, index: number): string[] {
  const position = `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)} ${fmtMeters(o.heightAsl)}`;
  // Field order + tag types mirror the canonical cultivation layout: name first, direction is float32,
  // and the element carries its list index ([0], [1], …) exactly as the sim's own files do.
  return block("xref", "element", String(index), [
    // sanitizeValue as defence in depth: the schema (XREF_NAME_RE) already rejects a name with a `]` on
    // load, but never emit an un-escaped user-influenced value into the .toc — a stray `]` would truncate
    // the element and corrupt the file (Fable A). Catalog names are slugs, so this is a no-op for them.
    tag("string8u", "name", sanitizeValue(o.name)),
    tag("vector3_float64", "position", position),
    tag("float32", "direction", fmtNum(o.direction, 3)),
    tag("float32", "scale_factor", fmtNum(o.scale, 4)),
  ]);
}

/** Build the `poi.toc` text for a set of height-resolved objects.
 *  V-matrix assumption: a POI with only xrefs needs just the `xref_list` inside
 *  `cultivation` — the optional plant/light/airport_light lists are omitted, not emitted
 *  empty, and the empty `buildings_texture_folder` tag is dropped too (confirmed
 *  it's optional, forum 2026-07-08). If in-sim testing shows the sim wants them present, add them here. */
export function buildToc(objects: ResolvedXref[]): string {
  const xrefList = block("list_xref", "xref_list", "", objects.flatMap((o, i) => xrefElement(o, i)));
  const cultivation = block("cultivation", "", "", [
    tag("string8u", "coordinate_system", "lonlat"),
    ...xrefList,
  ]);
  return block("file", "", "", cultivation).join("\n") + "\n";
}
