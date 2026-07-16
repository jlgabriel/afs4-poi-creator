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
  ResolvedPlant,
  ResolvedXref,
} from "../project/types";
import { tag, block, sanitizeValue, fmtLonLat, fmtMeters, fmtNum } from "../tm/tmEmit";

function fmtPosition(o: { position: { lon: number; lat: number }; heightAsl: number }): string {
  return `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)} ${fmtMeters(o.heightAsl)}`;
}

/** A plant's `position` carries only [LONGITUDE LATITUDE] — its height lives in the sibling
 *  `altitude` field, so this is deliberately NOT fmtPosition. (Both fields are still declared
 *  `vector3_*` in the bible while carrying two values; the type tag is a loose hint — see below.) */
function fmtLonLatOnly(o: { position: { lon: number; lat: number } }): string {
  return `${fmtLonLat(o.position.lon)} ${fmtLonLat(o.position.lat)}`;
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

// v0.4 plants. UNLIKE every element above, this one has NO ground truth behind it: the install's own
// `list_plant`s all live in the 38k binary-packed cultivation `.toc` we cannot read, so the bible is
// the only spec and the in-sim gate is the validator. Emitted in the bible's declared order and types
// verbatim — which is a weaker claim than it sounds, because three properties of the parser make the
// shape below low-risk, each one already paid for:
//   • ORDER doesn't matter — the sim resolves a property by HASH OF ITS NAME (tm.log: "property
//     'model_center' is not a member of type 'cultivation' hash=…"). `list_light` shipped in pure
//     bible order with no canonical example and rendered (gate 2026-07-12).
//   • The TYPE TAG is loose — our own in-sim-proven `.toc` writes `float32 direction` where the bible
//     says float64, and `string8u coordinate_system` where it says string8. Both load.
//   • A wrong property NAME is therefore the real risk, and it is the one thing tm.log names out loud
//     WITHOUT flying. It settles the bible's own contradiction here: this element calls the field
//     `group` while the bible's plant list header calls the same thing `type`. We emit `group` (the
//     element is the more specific statement) and read the log.
// What stays for the flight: whether `altitude` is ASL or AGL, and what `height_range` does.
function plantElement(o: ResolvedPlant, index: number): string[] {
  return block("plant", "element", String(index), [
    tag("vector3_float64", "position", fmtLonLatOnly(o)),
    tag("float32", "altitude", fmtMeters(o.heightAsl)),
    tag("vector3_float32", "height_range", o.heightRange.map((h) => fmtMeters(h)).join(" ")),
    tag("string8", "group", sanitizeValue(o.group)),
    tag("string8", "species", sanitizeValue(o.species)),
  ]);
}

/** Build the `poi.toc` text for a set of height-resolved objects.
 *  A POI's `cultivation` carries sibling lists in the bible's order `list_plant` → `list_light` →
 *  `list_airport_light` → `list_xref`. Every optional list is OMITTED when empty (never emitted
 *  empty), so an xref-only POI stays byte-identical to before v0.2/v0.4; `list_xref` is always
 *  emitted (even empty), which every in-sim gate has proven renders. Height is absolute ASL for
 *  xref and both light kinds (gate 2026-07-12) — for plants it is the working assumption the v0.4
 *  gate tests, not a finding. Accepts any ResolvedObject[]; an all-xref array hits only that branch. */
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
