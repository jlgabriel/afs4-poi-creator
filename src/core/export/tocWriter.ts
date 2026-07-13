// tocWriter.ts — Project objects → `poi.toc`, the AFS4 `cultivation` file that places
// built-in xref objects BY NAME (design §3.4, format bible FILES - POI - POI.TOC).
//
// This is what makes PCT different from the Race App exporter: the Race App bundles .tmb
// models and lists them inline in the .tsl; PCT ships no bytes and instead references the
// sim's built-in objects through a cultivation `list_xref`. Field order, tag types and the
// per-element index all follow the canonical hand-authored cultivation layout. Each
// xref element carries, IN THIS ORDER:
//   name                        — the exact xref id
//   position [lon lat height]   — height is ASL for POIs (design R1 / matrix V2)
//   direction °                 — clockwise positive; negative = counterclockwise
//   scale_factor                — uniform
//
// Output is byte-exact and golden-tested. The cultivation layout now mirrors the canonical
// reference (2026-07-10); the new byte layout is pending re-confirmation in the M3 in-sim gate.

import type {
  ResolvedAirportLight,
  ResolvedLight,
  ResolvedObject,
  ResolvedXref,
} from "../project/types";
import { tag, block, sanitizeValue, fmtLonLat, fmtMeters, fmtNum } from "../tm/tmEmit";

function fmtPosition(o: { position: { lon: number; lat: number }; heightAsl: number }): string {
  return `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)} ${fmtMeters(o.heightAsl)}`;
}

function xrefElement(o: ResolvedXref, index: number): string[] {
  // Field order + tag types mirror the canonical cultivation layout: name first, direction is float32,
  // and the element carries its list index ([0], [1], …) exactly as the sim's own files do.
  return block("xref", "element", String(index), [
    // sanitizeValue as defence in depth: the schema (XREF_NAME_RE) already rejects a name with a `]` on
    // load, but never emit an un-escaped user-influenced value into the .toc — a stray `]` would truncate
    // the element and corrupt the file (Fable A). Catalog names are slugs, so this is a no-op for them.
    tag("string8u", "name", sanitizeValue(o.name)),
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("float32", "direction", fmtNum(o.direction, 3)),
    tag("float32", "scale_factor", fmtNum(o.scale, 4)),
  ]);
}

// v0.2 lights. Field order + tag types are byte-verified against the canonical hand-authored examples
// (Fable A) and re-confirmed in-sim on 2026-07-12: type_name FIRST (the bible lists it last — same
// name-first inversion the xref element already carries), `orientation` is float64 (xref's `direction`
// is float32), and each element carries its own per-list index [0], [1], … .
function airportLightElement(o: ResolvedAirportLight, index: number): string[] {
  return block("airport_light", "element", String(index), [
    tag("string8u", "type_name", sanitizeValue(o.typeName)),
    tag("string8u", "configuration", sanitizeValue(o.configuration)),
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("float64", "orientation", fmtNum(o.orientation, 3)),
    tag("uint32", "group_index", String(o.groupIndex)),
  ]);
}

// v0.2 generic point light. Field order from the format bible; every canonical `list_light` ships
// empty, so the ORDER is bible-only, but the in-sim gate rendered this exact emitted shape (2026-07-12).
function lightElement(o: ResolvedLight, index: number): string[] {
  return block("light", "element", String(index), [
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("vector3_float32", "color", o.color.map((c) => fmtNum(c, 6)).join(" ")),
    tag("float32", "intensity", fmtNum(o.intensity, 6)),
    tag("vector4_float32", "flashing", o.flashing.map((f) => fmtNum(f, 6)).join(" ")),
    tag("uint32", "group_index", String(o.groupIndex)),
  ]);
}

/** Build the `poi.toc` text for a set of height-resolved objects.
 *  A POI's `cultivation` carries sibling lists in the canonical order `list_light` →
 *  `list_airport_light` → `list_xref`. The two light lists are OMITTED when empty (never emitted
 *  empty), so an xref-only POI is byte-identical to before v0.2; `list_xref` is always emitted (even
 *  empty), which every in-sim gate has proven renders. Height is absolute ASL for all kinds (gate
 *  2026-07-12). Accepts any ResolvedObject[]; an all-xref array (the live path today) hits only the
 *  xref branch. */
export function buildToc(objects: ResolvedObject[]): string {
  const xrefs: ResolvedXref[] = [];
  const airportLights: ResolvedAirportLight[] = [];
  const lights: ResolvedLight[] = [];
  for (const o of objects) {
    if (o.kind === "xref") xrefs.push(o);
    else if (o.kind === "airport_light") airportLights.push(o);
    else lights.push(o);
  }

  const children: string[] = [tag("string8u", "coordinate_system", "lonlat")];
  if (lights.length > 0) {
    children.push(...block("list_light", "light_list", "", lights.flatMap((o, i) => lightElement(o, i))));
  }
  if (airportLights.length > 0) {
    children.push(
      ...block("list_airport_light", "airport_light_list", "", airportLights.flatMap((o, i) => airportLightElement(o, i))),
    );
  }
  children.push(...block("list_xref", "xref_list", "", xrefs.flatMap((o, i) => xrefElement(o, i))));

  const cultivation = block("cultivation", "", "", children);
  return block("file", "", "", cultivation).join("\n") + "\n";
}
