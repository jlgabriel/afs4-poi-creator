// glyph.ts — how big the letter painted on a round airport element is, in screen pixels.
//
// WHY IT IS SHARED. The pad's H and the stand's P are the same kind of marking: both stay constant
// relative to their object, and pads and stands side by side must show letters of the same size. A
// constant that lived in two files would drift, and the drift would be visible in exactly that layout.
//
// WHY IT SCALES AT ALL. A fixed-size letter over a circle that grows with the zoom shrinks to a fraction
// of its circle (17 px on a 100 px pad). Real paint does not work that way, and the letter is meant to be
// the thing you read the stand's or pad's alignment from.

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
