// marks.ts — the TAP converter's vocabulary for the three one-point airport elements that only Export TAP
// reads: a GROUND TEXT painted on the pavement, a JETWAY mounted on a terminal, and a CAR LOT.
//
// All three are a point plus a facing, edited on the map like a parking position. Their values are rows of
// the `.tap` format, not data from the user's install, so they are listed here like surfaces.ts lists the
// materials. A value the converter does not know is not reported as an error, so the menus only offer
// these, and the loader (schemas.ts) refuses the enum fields when they hold anything else.

/** The colours a ground text's letters, background and outline take. `none` leaves that part out. */
export const GROUNDTEXT_COLORS = ["none", "black", "blue", "green", "red", "white", "yellow"] as const;
export type GroundTextColor = (typeof GROUNDTEXT_COLORS)[number];

/** The background's shape. */
export const GROUNDTEXT_BACKGROUNDS = ["box", "circle"] as const;
export type GroundTextBackground = (typeof GROUNDTEXT_BACKGROUNDS)[number];

/** An arrow beside the text, on its left or right end. */
export const GROUNDTEXT_POINTING = ["none", "left", "right"] as const;
export type GroundTextPointing = (typeof GROUNDTEXT_POINTING)[number];

/** The standard letter sizes, metres per letter: [width, height]. Any other positive size is legal. */
export const GROUNDTEXT_STANDARD_SIZES: readonly (readonly [number, number])[] = [
  [1, 3],
  [3, 4.25],
];

export const DEFAULT_GROUNDTEXT_SIZE: [number, number] = [1, 3];
/** A fresh ground text reads "A": the most common use is a taxiway letter. */
export const DEFAULT_GROUNDTEXT_VALUE = "A";
export const DEFAULT_GROUNDTEXT_TEXT_COLOR: GroundTextColor = "yellow";
export const DEFAULT_GROUNDTEXT_BACKGROUND: GroundTextBackground = "box";
export const DEFAULT_GROUNDTEXT_BACKGROUND_COLOR: GroundTextColor = "black";
export const DEFAULT_GROUNDTEXT_STROKE_COLOR: GroundTextColor = "yellow";
export const DEFAULT_GROUNDTEXT_POINTING: GroundTextPointing = "none";

/** A ground text's value, as the converter takes it: capitals A–Z, digits, space, `+` and `-`. Lowercase
 *  is raised; anything else is dropped. That also keeps `]` and line breaks out of the `.tap`, whose
 *  grammar has no escape. */
export function cleanGroundTextValue(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 +-]/g, "");
}

/** The `.tap` `direction` of a ground text, from its compass heading in the project. Written as the
 *  heading itself (0 = north), like the jetway and the car lot. */
export function groundTextTapDirection(heading: number): number {
  return heading;
}

/** The jetway's ranges and defaults. Directions are degrees RELATIVE to the jetway's own direction,
 *  counter-clockwise; the mounting elevation and the extension are metres. */
export const JETWAY_MOUNTING_RANGE: readonly [number, number] = [3.6, 6];
export const JETWAY_EXTENSION_DIRECTION_RANGE: readonly [number, number] = [0, 45];
export const JETWAY_EXTENSION_AMOUNT_RANGE: readonly [number, number] = [0, 24.5];
export const JETWAY_EXIT_DIRECTION_RANGE: readonly [number, number] = [0, 45];

export const DEFAULT_JETWAY = {
  mountingElevation: 5,
  extensionDirection: 45,
  extensionPitch: -1,
  extensionAmount: 10,
  exitDirection: 20,
  docked: false,
} as const;

/** A car lot is filled at random: `rows` rows of `columns` spaces each. */
export const CARLOT_COUNT_RANGE: readonly [number, number] = [1, 100];
export const DEFAULT_CARLOT_ROWS = 2;
export const DEFAULT_CARLOT_COLUMNS = 10;

/** Clamp into [lo, hi]; a non-finite value is null (the caller refuses it). */
export function clampTo(v: number, [lo, hi]: readonly [number, number]): number | null {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
}

/** A car lot count: an integer inside CARLOT_COUNT_RANGE, or null. */
export function cleanCarlotCount(v: number): number | null {
  return clampTo(Math.round(v), CARLOT_COUNT_RANGE);
}
