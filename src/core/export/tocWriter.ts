// tocWriter.ts — Project objects → `poi.toc`, the AFS4 `cultivation` file that places
// built-in xref objects BY NAME (design §3.4).
//
// PCT ships no model bytes: it references the sim's built-in objects through a cultivation
// `list_xref`. Field order, tag types and the per-element index all follow the canonical
// cultivation layout. Each xref element carries, IN THIS ORDER:
//   name                        — the exact xref id
//   position [lon lat height]   — height is ASL for POIs (design R1)
//   direction °                 — clockwise positive; negative = counterclockwise
//   scale_factor                — uniform
//
// Output is byte-exact and golden-tested.

import type {
  ResolvedAirportLight,
  ResolvedLight,
  ResolvedObject,
  ResolvedPlant,
  ResolvedXref,
} from "../project/types";
import { tag, block, sanitizeValue, fmtLonLat, fmtMeters, fmtNum } from "../tm/tmEmit";

function fmtPosition(o: { position: { lon: number; lat: number }; heightAsl: number }): string {
  return `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)} ${fmtMeters(o.heightAsl)}`;
}

/** A plant's `position` carries only [LONGITUDE LATITUDE] — its height lives in the sibling
 *  `altitude` field, so this is deliberately NOT fmtPosition. Two values because the type is a
 *  `vector2_float64`, not a vector3 — see plantElement. */
function fmtLonLatOnly(o: { position: { lon: number; lat: number } }): string {
  return `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)}`;
}

function xrefElement(o: ResolvedXref, index: number): string[] {
  // Field order + tag types mirror the canonical cultivation layout: name first, direction is float32,
  // and the element carries its list index ([0], [1], …).
  return block("xref", "element", String(index), [
    // sanitizeValue as defence in depth: the schema (XREF_NAME_RE) already rejects a name with a `]` on
    // load, but never emit an un-escaped user-influenced value into the .toc — a stray `]` would truncate
    // the element and corrupt the file. Catalog names are slugs, so this is a no-op for them.
    tag("string8u", "name", sanitizeValue(o.name)),
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("float32", "direction", fmtNum(o.direction, 3)),
    tag("float32", "scale_factor", fmtNum(o.scale, 4)),
  ]);
}

// Airport lights. Field order + tag types: type_name FIRST, `orientation` is float64 (xref's
// `direction` is float32), and each element carries its own per-list index [0], [1], … .
function airportLightElement(o: ResolvedAirportLight, index: number): string[] {
  return block("airport_light", "element", String(index), [
    tag("string8u", "type_name", sanitizeValue(o.typeName)),
    tag("string8u", "configuration", sanitizeValue(o.configuration)),
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("float64", "orientation", fmtNum(o.orientation, 3)),
    tag("uint32", "group_index", String(o.groupIndex)),
  ]);
}

// Generic point light. This exact emitted shape renders in-sim.
function lightElement(o: ResolvedLight, index: number): string[] {
  return block("light", "element", String(index), [
    tag("vector3_float64", "position", fmtPosition(o)),
    tag("vector3_float32", "color", o.color.map((c) => fmtNum(c, 6)).join(" ")),
    tag("float32", "intensity", fmtNum(o.intensity, 6)),
    tag("vector4_float32", "flashing", o.flashing.map((f) => fmtNum(f, 6)).join(" ")),
    tag("uint32", "group_index", String(o.groupIndex)),
  ]);
}

// Plants. The types matter and are easy to get wrong:
//
//     position      vector2_float64   [lon lat] only — height is the separate `altitude`
//     height_range  vector2_float32   two values, NOT a vector3
//     group/species stringt8c         NOT string8 (a different type, not a coercible one)
//
// A float32↔float64 mismatch is a scalar the parser can coerce; vector3↔vector2 is an ARITY and
// `string8`↔`stringt8c` a different type, so neither of those is tolerated. Field ORDER is free (the
// parser is name-keyed). The field is `group`, not `type` — `type` is not a member of `plant`.
//
// ⚠️ Plants render only with the place at `autoheight=false` (or with the autoheight anchor) — see
// buildTsl: a bare `autoheight true` forces every plant to height 0.
function plantElement(o: ResolvedPlant, index: number): string[] {
  return block("plant", "element", String(index), [
    tag("vector2_float64", "position", fmtLonLatOnly(o)),
    tag("float32", "altitude", fmtMeters(o.heightAsl)),
    tag("vector2_float32", "height_range", o.heightRange.map((h) => fmtMeters(h)).join(" ")),
    tag("stringt8c", "group", sanitizeValue(o.group)),
    tag("stringt8c", "species", sanitizeValue(o.species)),
  ]);
}

/** Build the `poi.toc` text for a set of height-resolved objects.
 *  A POI's `cultivation` carries sibling lists in the order `list_plant` → `list_light` →
 *  `list_airport_light` → `list_xref`. Every optional list is OMITTED when empty (never emitted
 *  empty), so an xref-only POI's bytes do not depend on the other kinds; `list_xref` is always
 *  emitted (even empty), which loads fine. Height is absolute ASL in baked-asl mode (the `altitude`
 *  field for plants); under autoheight the same field carries AGL (heights.ts). Accepts any ResolvedObject[]; an all-xref array hits only that branch. */
export function buildToc(objects: ResolvedObject[]): string {
  const xrefs: ResolvedXref[] = [];
  const airportLights: ResolvedAirportLight[] = [];
  const lights: ResolvedLight[] = [];
  const plants: ResolvedPlant[] = [];
  for (const o of objects) {
    // One arm per kind, no catch-all `else`: a trailing else silently swept any unrecognised kind into
    // the last bucket, so adding plants would have emitted them as lights. `never` makes the next kind
    // a compile error here instead.
    if (o.kind === "xref") xrefs.push(o);
    else if (o.kind === "airport_light") airportLights.push(o);
    else if (o.kind === "light") lights.push(o);
    else if (o.kind === "plant") plants.push(o);
    else {
      const unreachable: never = o;
      throw new Error(`buildToc: unhandled object kind ${JSON.stringify(unreachable)}`);
    }
  }

  const children: string[] = [tag("string8u", "coordinate_system", "lonlat")];
  if (plants.length > 0) {
    children.push(...block("list_plant", "plant_list", "", plants.flatMap((o, i) => plantElement(o, i))));
  }
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
