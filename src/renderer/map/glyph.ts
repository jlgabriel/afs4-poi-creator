// glyph.ts — how big the letter painted on a round airport element is, in screen pixels.
//
// WHY IT IS SHARED. The pad's H and the stand's P are meant to be the same object seen twice: he asked
// for the P *because* the H was already there ("PARKING POSITION should definitely also receive a
// labelling", #283), and in #295 he made the rule explicit — "All markings should always remain constant
// relative to the object", and "if a user positions several HELIPAD and PARKING POSITIONs side by side …
// it irritates when some letters are vertical and others are not." A constant that lived in two files
// would drift, and the drift would be visible in exactly the arrangement he described.
//
// WHY IT SCALES AT ALL (v1.8). Until now the letter was a fixed 17 px while the circle under it grew with
// the zoom, so a 10 m pad drawn 100 px wide carried a letter 17 px tall — 17% of it. Real paint does not
// work that way, and his second reason for turning the P leans on the letter being the thing you read:
// "The 'P' is much better to see than the orientation arrow and thus gives the user a better indication
// of how (P) is aligned." A letter that shrinks to a sixth of its circle is not that.

/** Never smaller than the size it has always had — below this the letter stops being legible, and the
 *  layers already drop it entirely below a 14 px radius. */
const MIN_PX = 17;
/** And never larger than this, so a stand blown up at maximum zoom does not fill the screen with a P. */
const MAX_PX = 96;

/** The letter's font size for a circle of this on-screen RADIUS in pixels.
 *
 *  The identity is deliberate — font size = radius means the cap-height letter lands at roughly half the
 *  circle's diameter, which is about what a painted H covers on a real pad. */
export function glyphPx(radiusPx: number): number {
  return Math.max(MIN_PX, Math.min(MAX_PX, Math.round(radiusPx)));
}
