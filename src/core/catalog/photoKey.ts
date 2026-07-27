// photoKey.ts — the file-name stem that identifies an object's user photo (v0.8).
//
// v0.6 gave every XREF card a photo by making the identity trivial: the stem IS the object's `name`.
// Plants and lights had no photo at all, and the reason was never "nobody wanted one" — a Runway Edge
// Light and a Taxiway Edge Light are the same glyph, and Broadleaf 00 and 01 differ only by a metre of
// height. The reason was that neither family has a `name`:
//
//   • a plant is identified by a PAIR (`group` + `species`), and plantKey joins them with a `/` —
//     a path separator, so it could never be a file name;
//   • an airport light has a unique `typeName`, but it lives in a FLAT folder shared with the ~900
//     XREF stems, so `runway_edge_light.png` would be indistinguishable from an XREF of that name.
//
// So the three families get one namespaced key, and the separator is a DOT for two concrete reasons:
//   1. `isValidThumbName` (main/thumbnails.ts) already admits `.`, and `path.extname`/`path.basename`
//      still split `plant.palm.08.png` into the stem `plant.palm.08` + `.png`. Nothing downstream
//      changes — not the guard, not the index, not the IPC signatures.
//   2. A built-in XREF name is `[A-Za-z0-9_]` (all 837 scanned) and so CANNOT contain a dot. A prefixed
//      key therefore can't collide with a catalog object by construction, rather than merely by luck —
//      which is the same standard the rest of this feature is held to (a photo that silently attaches
//      to the wrong object is bug #176 wearing a different hat).
//
// The XREF key is the bare `name`, UNCHANGED: every photo taken with v0.6/v0.7 keeps resolving. That
// backward compatibility is the load-bearing property of this module, not a nicety — the photos are the
// user's own screenshots and PCT must never orphan them.

import type { PlacedObject } from "../project/types";
import { plantKey } from "./plants";

/** The prefix that namespaces a non-XREF family in the flat photo folder. Exported for the tests and for
 *  anything that needs to explain the convention to the user (README, the Settings hint). */
export const PLANT_PHOTO_PREFIX = "plant";
export const LIGHT_PHOTO_PREFIX = "light";

/** The shape a photo key may have: starts alphanumeric, then letters, digits, `_`, `.`, `-`. It covers
 *  every key `photoKey` produces (the 837 scanned `[A-Za-z0-9_]` XREF names, the user's own registered
 *  objects — which routinely carry a `-`, forum #176 — and the dotted `plant.`/`light.` keys) while
 *  leaving out a leading `.`/`-` and any `..`, so a key is still safe to join into a path.
 *
 *  Two consumers, one shape: main/thumbnails.ts guards a FILE NAME with it (a key arrives over IPC and
 *  becomes `<dir>/<key>.png`), and v0.9's footprints.json guards a JSON KEY with it. The path-safety
 *  reason belongs to the first; the second wants it because a key outside this set can't correspond to
 *  any card, and a file full of such keys is a typo, not data. They share the predicate so the two can
 *  never drift into disagreeing about what a key is. */
export function isValidPhotoKey(key: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key);
}

/** The stem the parametric "Point light (custom)" card uses. It has no catalog entry at all — it's fully
 *  described by its parameters — but it's a card in the Lights section like any other, so it gets a key
 *  rather than an exception. */
export const POINT_LIGHT_PHOTO_KEY = `${LIGHT_PHOTO_PREFIX}.point`;

/** What a card is, for photo purposes. Deliberately narrower than PlacingSpec (which carries placement
 *  parameters): a photo depends only on WHICH object the card names, never on how it would be placed. */
export type PhotoSubject =
  | { kind: "xref"; name: string }
  | { kind: "plant"; group: string; species: string }
  | { kind: "airport_light"; typeName: string }
  | { kind: "light" };

/** The photo file-name stem for a card. Case is preserved (catalog names carry mixed case, e.g.
 *  `UH60_usarmy`); every consumer lowercases when matching, exactly as the v0.6 index does. */
export function photoKey(subject: PhotoSubject): string {
  switch (subject.kind) {
    case "xref":
      return subject.name; // v0.6/v0.7 compatibility — the bare name, untouched
    case "plant":
      // plantKey's `/` is the one character a file name can't hold, so it becomes the family separator:
      // `palm/08` → `plant.palm.08`. A group's own underscores ("conifer_forest") survive intact.
      return `${PLANT_PHOTO_PREFIX}.${plantKey(subject).replace("/", ".")}`;
    case "airport_light":
      return `${LIGHT_PHOTO_PREFIX}.${subject.typeName}`;
    case "light":
      return POINT_LIGHT_PHOTO_KEY;
  }
}

/** The photo key for an object already placed in the project — the placed list draws the same thumbnail
 *  the catalog card does. A PlacedObject carries the identifying fields plus placement state, so this is
 *  just the projection down to the subject; kept explicit rather than relying on structural assignability
 *  so a future field on one of the placed kinds can't quietly change which overload applies. */
export function photoKeyForPlaced(o: PlacedObject): string {
  switch (o.kind) {
    case "xref":
      return photoKey({ kind: "xref", name: o.name });
    case "plant":
      return photoKey({ kind: "plant", group: o.group, species: o.species });
    case "airport_light":
      return photoKey({ kind: "airport_light", typeName: o.typeName });
    case "light":
      return photoKey({ kind: "light" });
  }
}
