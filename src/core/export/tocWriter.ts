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
 *  `altitude` field, so this is deliberately NOT fmtPosition. Two values because the type is a
 *  `vector2_float64` (the bible's `vector3` was the error — see plantElement). */
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

// v0.4 plants. This element now mirrors a REAL, in-sim-proven `list_plant` — the format's author
// (ApfelFlieger) built and flew one at Heligoland and sent the file (2026-07-17). Until then this was
// the only element with no ground truth anywhere: every `list_plant` in the install sits inside the
// 38k binary-packed cultivation `.toc` we cannot read, so the format bible was the sole spec.
//
// ★ The bible is WRONG about all three types here, and the errors were self-concealing:
//
//     bible                  real (proven)          why the bible looked plausible
//     vector3_float64 position   vector2_float64    it prints TWO values into a "vector3"
//     vector3_float32 height_range vector2_float32  same — two values in a "vector3"
//     string8 group/species      stringt8c          string8 is what the doc uses everywhere
//
// The two-values-in-a-vector3 oddity was the tell, and it now resolves: the type IS a vector2. The
// earlier read — "the type tag is loose, our proven .toc writes float32 where the bible says float64"
// — was true but did not generalise: float32↔float64 is a scalar the parser can coerce, while
// vector3↔vector2 is an ARITY, and `string8`↔`stringt8c` is a different type entirely.
//
// Order is genuinely free (the sim resolves properties by hash of the NAME — tm.log says so), and the
// five NAMES are proven correct by a deliberate bogus-property control that made the log complain
// while ours never did. `group` (not the `type` the bible's list header shows) is confirmed the same
// way: "property 'type' is not a member of type 'plant'".
//
// ⚠️ None of this is why plants failed to render for five flights — see buildTsl: `autoheight true`
// forces every plant to height 0. This element was already close enough that the author's verdict on
// our code was "Claude did not make a mistake".
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
