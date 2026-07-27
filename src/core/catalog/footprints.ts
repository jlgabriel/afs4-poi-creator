// footprints.ts — the user's OWN measurements of objects PCT cannot measure (v0.9).
//
// WHY THIS EXISTS. An XREF carries a bounding box because the install indexes it in a `.tmi`, so the map
// can draw the blue footprint that tells you whether the thing fits where you're putting it. An
// `airport_light` and a `plant` have no `.tmi` at all — the scan is pure name derivation — so they draw
// as bare dots, and forum #126/#129 (ApfelFlieger) is exactly what that costs: the Runway Approach Light
// group is nine fixtures whose whole difference IS their size (Center 1 is 0.5 × 0.5 × 2.0 m, Center 5 is
// 8.0 × 0.5 × 10.0), and on the map all nine are the same 6-pixel circle.
//
// WHAT THIS IS NOT. The obvious fix — ship a `.tmi` of every airport light inside PCT — was declined, and
// not for effort: PCT's one hard rule is that it ships ZERO IPACS data, and a table of measurements of
// IPACS models is IPACS data wearing a spreadsheet. So the numbers are never PCT's. They are the user's,
// typed into their own file on their own disk, exactly like the v0.6 object photos — and like the photos,
// they can be exported and handed to somebody else, which is how a measurement made once by one person
// reaches everybody without a single byte of it ever living in this repository.
//
// THE MODEL. One entry per CARD, keyed by the v0.8 `photoKey` — the same key the photo feature already
// uses, so the two features name an object identically and one right-click menu can serve both. What the
// user types is `width × depth × height` in metres, the reading they get by eyeballing the model against
// a 1 × 1 × 1 m cube (#129), and `overrideToBox` turns that into the model-local bbox the map wants.
//
// TWO ASSUMPTIONS, STATED. Both are assumptions and neither is a finding:
//   1. The box is CENTRED on the model origin in x/y and rises from it in z. A scanned XREF box is NOT
//      centred (see geo/footprint.ts — that off-centre-ness is the whole reason footprints are built in
//      model-local metres and rotated around the anchor), but a user supplying three numbers has said
//      nothing about where the origin sits inside them, and centred is the only answer that doesn't
//      invent a fourth and fifth number. If a fixture turns out to hang visibly off its anchor, the fix
//      is an offset pair here — not a reinterpretation of these three.
//   2. `height` does NOT reach the map. The footprint is a ground polygon; z has no say in it. It is
//      stored because it is what #129 measured and because the card's size line reads better with it,
//      and for nothing else. Anyone reading a taller polygon into a taller number is reading a bug.

import type { Catalog, CatalogAirportLight, CatalogObject, CatalogPlant, Vec3 } from "../project/types";
import { photoKey } from "./photoKey";

/** One hand-measured object, in metres. `width` runs along the model's x axis, `depth` along y and
 *  `height` along z (z up) — the frame `overrideToBox` maps into a bbox. */
export interface FootprintOverride {
  width: number;
  depth: number;
  height: number;
  /** Optional free text the user (or whoever shared the file) can leave: who measured it and how. Carried
   *  through import/export untouched — it is the only provenance a shared file has. */
  note?: string;
}

/** The whole `footprints.json`: a version and a flat map of photoKey → measurement. Deliberately its own
 *  file rather than a corner of the catalog cache, because those two have opposite lifetimes — the cache
 *  is rebuilt from the install by every Rescan, and these are the one thing in the app a Rescan must never
 *  touch. (Same reasoning as the photos folder, which is also not in the cache.) */
export interface FootprintOverrides {
  schemaVersion: 1;
  entries: Record<string, FootprintOverride>;
}

export const EMPTY_FOOTPRINTS: FootprintOverrides = { schemaVersion: 1, entries: {} };

/** The bbox trio a catalog entry carries. Mirrors the three fields CatalogObject has had since M0, so
 *  applying an override to an XREF is a field-for-field replacement rather than a parallel shape. */
export interface FootprintBox {
  bbMin: Vec3;
  bbMax: Vec3;
  size: { x: number; y: number; z: number };
  bsRadius: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Half the box diagonal — the same derivation buildCatalog uses for a scanned object, so an overridden
 *  entry's `bsRadius` stays consistent with the box it now has instead of describing the old one. */
function bsRadiusOf(box: Pick<FootprintBox, "bbMin" | "bbMax">): number {
  return (
    Math.hypot(
      box.bbMax[0] - box.bbMin[0],
      box.bbMax[1] - box.bbMin[1],
      box.bbMax[2] - box.bbMin[2],
    ) / 2
  );
}

/** Turn a user measurement into a model-local bbox: centred in x/y, rising from the origin in z (see the
 *  two stated assumptions at the top). */
export function overrideToBox(o: FootprintOverride): FootprintBox {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const bbMin: Vec3 = [-hw, -hd, 0];
  const bbMax: Vec3 = [hw, hd, o.height];
  return {
    bbMin,
    bbMax,
    size: { x: round2(o.width), y: round2(o.depth), z: round2(o.height) },
    bsRadius: bsRadiusOf({ bbMin, bbMax }),
  };
}

/** The bbox to draw for a catalog entry, or null when it has none. An XREF always has one (the scan
 *  guarantees it); a light or plant has one only where the user measured it. The one place the rest of
 *  the app should ask "does this thing have a footprint?", so the answer can't drift between the map,
 *  the cards and the dialog. */
export function catalogBox(
  entry: CatalogObject | CatalogAirportLight | CatalogPlant | undefined,
): { bbMin: Vec3; bbMax: Vec3 } | null {
  if (entry === undefined) return null;
  const { bbMin, bbMax } = entry as { bbMin?: Vec3; bbMax?: Vec3 };
  return bbMin !== undefined && bbMax !== undefined ? { bbMin, bbMax } : null;
}

/** How many objects the user has measured. */
export function countFootprints(fp: FootprintOverrides): number {
  return Object.keys(fp.entries).length;
}

/** Set (or, with `null`, clear) one entry, returning a NEW FootprintOverrides — the caller persists it.
 *  Clearing a key that isn't there returns the input unchanged, so a stray "Clear" writes nothing. */
export function setFootprint(
  base: FootprintOverrides,
  key: string,
  override: FootprintOverride | null,
): FootprintOverrides {
  if (override === null) {
    if (!(key in base.entries)) return base;
    const entries = { ...base.entries };
    delete entries[key];
    return { schemaVersion: 1, entries };
  }
  return { schemaVersion: 1, entries: { ...base.entries, [key]: override } };
}

/** Fold an imported file into the user's own. Incoming wins on a key both hold — the user asked for this
 *  file — but `updated` counts every such collision so the UI can say so out loud rather than letting a
 *  community file quietly redefine measurements somebody took themselves. */
export function mergeFootprints(
  base: FootprintOverrides,
  incoming: FootprintOverrides,
): { merged: FootprintOverrides; added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const entries = { ...base.entries };
  for (const [key, value] of Object.entries(incoming.entries)) {
    if (key in entries) updated += 1;
    else added += 1;
    entries[key] = value;
  }
  return { merged: { schemaVersion: 1, entries }, added, updated };
}

/** Apply every override onto a freshly scanned catalog, returning the catalog the editor should use.
 *
 *  Returns the SAME reference when there is nothing to apply, which is the common case and keeps a user
 *  with no overrides on exactly the code path v0.8 had. When it does rewrite, every touched entry is a new
 *  object and the caller rebuilds its indexes — which is precisely what makes the map notice (FootprintLayer
 *  rebuilds an entry whose index Map identity changed, Fable I3).
 *
 *  A key naming nothing in the catalog is silently kept in the file and ignored here: it may belong to an
 *  object from an install this machine doesn't have (an imported file is written for somebody else's), and
 *  dropping it would quietly destroy data on the next save. */
export function applyFootprintOverrides(catalog: Catalog, fp: FootprintOverrides): Catalog {
  if (countFootprints(fp) === 0) return catalog;

  let touched = false;
  /** The three fields both families share. `bsRadius` is XREF-only (a light/plant has never had one), so
   *  it is applied at that call site rather than smuggled onto types that don't declare it. */
  const boxOf = (key: string): Pick<FootprintBox, "bbMin" | "bbMax" | "size"> | null => {
    const o = fp.entries[key];
    if (o === undefined) return null;
    touched = true;
    const { bbMin, bbMax, size } = overrideToBox(o);
    return { bbMin, bbMax, size };
  };

  const xref = catalog.xref.map((o) => {
    const box = boxOf(photoKey({ kind: "xref", name: o.name }));
    if (box === null) return o;
    // An opaque user `.tmb` has no derivable size at all (`sizeUnknown`, a zero bbox). A measurement is
    // exactly the missing knowledge, so the flag goes with it — otherwise the card would keep saying
    // "size unknown" while the map drew the box the user just typed.
    const next: CatalogObject = { ...o, ...box, bsRadius: bsRadiusOf(box), footprintSource: "user" };
    if (next.sizeUnknown === true) delete next.sizeUnknown;
    return next;
  });
  const airportLights = catalog.airportLights.map((l) => {
    const box = boxOf(photoKey({ kind: "airport_light", typeName: l.typeName }));
    return box === null ? l : { ...l, ...box, footprintSource: "user" as const };
  });
  // `?? []` for the same reason the store has it: a catalog cached before v0.4 has no plants key.
  const plants = (catalog.plants ?? []).map((p) => {
    const box = boxOf(plantFootprintKey(p));
    return box === null ? p : { ...p, ...box, footprintSource: "user" as const };
  });

  return touched ? { ...catalog, xref, airportLights, plants } : catalog;
}

/** The key for a plant, spelled once. Kept here so a caller with a CatalogPlant in hand doesn't have to
 *  know that `photoKey` wants the pair rather than `plantKey`'s slash-joined string. */
export function plantFootprintKey(p: Pick<CatalogPlant, "group" | "species">): string {
  return photoKey({ kind: "plant", group: p.group, species: p.species });
}
