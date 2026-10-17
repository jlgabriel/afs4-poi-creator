// marks.ts — the TAP converter's vocabulary for the one-point airport elements that only Export TAP reads:
// a GROUND TEXT painted on the pavement, a TAXI SIGN, a JETWAY mounted on a terminal, and a CAR LOT.
//
// All four are a point plus a facing, edited on the map like a parking position. Their values are rows of
// the `.tap` format, not data from the user's install, so they are listed here like surfaces.ts lists the
// materials. A value the converter does not know is not reported as an error, so the menus only offer
// these, and the loader (schemas.ts) refuses the enum fields when they hold anything else.
import { headingToDirection } from "../geo/orientation";

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
 *  counter-clockwise, −80 to +80; the mounting elevation and the extension are metres. A fresh jetway
 *  is straight and retracted. */
export const JETWAY_MOUNTING_RANGE: readonly [number, number] = [3.6, 6];
export const JETWAY_EXTENSION_DIRECTION_RANGE: readonly [number, number] = [-80, 80];
export const JETWAY_EXTENSION_AMOUNT_RANGE: readonly [number, number] = [0, 24.5];
export const JETWAY_EXIT_DIRECTION_RANGE: readonly [number, number] = [-80, 80];

export const DEFAULT_JETWAY = {
  mountingElevation: 5,
  extensionDirection: 0,
  extensionPitch: -1,
  extensionAmount: 0,
  exitDirection: 0,
  docked: false,
} as const;

/** A car lot is filled at random: `rows` rows of `columns` spaces each. */
export const CARLOT_COUNT_RANGE: readonly [number, number] = [1, 100];
export const DEFAULT_CARLOT_ROWS = 2;
export const DEFAULT_CARLOT_COLUMNS = 10;

// ── TAXISIGN ──────────────────────────────────────────────────────────────────────────────────────

/** The components a taxi sign is built from, shown left to right. Each type has its own colours:
 *  runway = white on red, destination = black on yellow, location = yellow on black, remainingrunway =
 *  white on black. `linebreak` carries no value: the components after it go on the BACK face. */
export const TAXISIGN_ELEMENT_TYPES = ["runway", "destination", "location", "remainingrunway", "linebreak"] as const;
export type TaxisignElementType = (typeof TAXISIGN_ELEMENT_TYPES)[number];

/** The sign sizes the converter takes. */
export const TAXISIGN_SIZE_TYPES = [1, 2, 3, 4] as const;
export const DEFAULT_TAXISIGN_SIZE_TYPE = 3;
/** The `level` row. Always this value: its use is unknown, so PCT offers nothing for it. */
export const TAXISIGN_LEVEL = 0;
/** The sign's brightness: 0.0 to 1.0 in steps of 0.1 — unlike a tarmac's, 0.0 is allowed. */
export const TAXISIGN_BRIGHTNESS_STEPS: readonly number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
export const DEFAULT_TAXISIGN_BRIGHTNESS = 0.5;
/** A fresh sign faces SOUTH, so its front reads upright on a north-up map. */
export const DEFAULT_TAXISIGN_HEADING = 180;
/** A fresh sign: one location component reading "A". */
export const DEFAULT_TAXISIGN_ELEMENTS: readonly { type: TaxisignElementType; value: string }[] = [
  { type: "location", value: "A" },
];

/** Snap a taxi sign brightness onto TAXISIGN_BRIGHTNESS_STEPS; a non-finite value is null. */
export function clampTaxisignBrightness(b: number): number | null {
  return Number.isFinite(b) ? Math.min(1, Math.max(0, Math.round(b * 10) / 10)) : null;
}

/** The arrows and hold marks a DESTINATION value can carry, written inline: `B<RIGHT90>` reads "B →".
 *  The number is the arrow's angle from straight up, turned right or left: any whole number 0–180
 *  (isTaxisignToken). These are the PRESETS the Inspector offers as buttons; any other angle is typed.
 *  The hold marks are exactly these two. */
export const TAXISIGN_TOKENS: readonly string[] = [
  ...[0, 45, 90, 135, 180].map((a) => `<LEFT${a}>`),
  ...[0, 45, 90, 135, 180].map((a) => `<RIGHT${a}>`),
  "<HOLD0>",
  "<HOLD1>",
];

/** Whether `<…>` is a token the converter knows: `<LEFTn>` / `<RIGHTn>` with n a whole number 0–180
 *  (no leading zero), or one of the two hold marks. */
export function isTaxisignToken(t: string): boolean {
  if (t === "<HOLD0>" || t === "<HOLD1>") return true;
  const m = /^<(?:LEFT|RIGHT)(0|[1-9]\d{0,2})>$/.exec(t);
  return m !== null && Number(m[1]) <= 180;
}

/** The characters each component type takes. The destination also takes tokens (isTaxisignToken). */
const TAXISIGN_CHARS: Record<TaxisignElementType, RegExp> = {
  runway: /[0-9A-Z -]/,
  destination: /[A-Z0-9 -]/,
  location: /[A-Z]/,
  remainingrunway: /[0-9]/,
  linebreak: /(?!)/, // takes nothing
};

/** A component's value WHILE IT IS TYPED: lowercase raised, characters its type never takes dropped. A
 *  destination keeps `<` and `>` so a token can be typed one letter at a time; the writer drops anything
 *  that is not a whole token (cleanTaxisignValue). Nothing here can put `]` or a line break in the `.tap`. */
export function editTaxisignValue(type: TaxisignElementType, value: string): string {
  const keep = (ch: string): boolean =>
    TAXISIGN_CHARS[type].test(ch) || (type === "destination" && (ch === "<" || ch === ">"));
  return [...value.toUpperCase()].filter(keep).join("");
}

/** A destination value split into text and tokens, in order. Anything between `<` and `>` that is not a
 *  known token comes out as `bad`. */
export function taxisignValueParts(value: string): { kind: "text" | "token" | "bad"; text: string }[] {
  const out: { kind: "text" | "token" | "bad"; text: string }[] = [];
  for (const m of value.matchAll(/<[^<>]*>?|[^<]+/g)) {
    const t = m[0];
    out.push({ kind: !t.startsWith("<") ? "text" : isTaxisignToken(t) ? "token" : "bad", text: t });
  }
  return out;
}

/** A component's value as the `.tap` gets it: editTaxisignValue, and for a destination every `<…>` that
 *  is not a token (isTaxisignToken) dropped. */
export function cleanTaxisignValue(type: TaxisignElementType, value: string): string {
  const v = editTaxisignValue(type, value);
  if (type !== "destination") return v;
  return taxisignValueParts(v)
    .filter((p) => p.kind !== "bad")
    .map((p) => p.text)
    .join("");
}

/** What is wrong with a component's value, or null. */
export function taxisignValueProblem(type: TaxisignElementType, value: string): string | null {
  if (type === "linebreak") return null;
  const clean = cleanTaxisignValue(type, value);
  if (clean.trim() === "") return "Empty: this component shows nothing.";
  if (clean !== editTaxisignValue(type, value)) return "A <…> that is not an arrow (<LEFT0>–<LEFT180>, <RIGHT0>–<RIGHT180>) or a hold (<HOLD0>, <HOLD1>) is left out.";
  return null;
}

/** The components on each face: the front, and the back (after the first `linebreak`; a later
 *  `linebreak` is ignored). */
export function taxisignFaces<T extends { type: TaxisignElementType }>(elements: readonly T[]): [T[], T[]] {
  const i = elements.findIndex((e) => e.type === "linebreak");
  if (i < 0) return [[...elements], []];
  return [elements.slice(0, i), elements.slice(i + 1).filter((e) => e.type !== "linebreak")];
}

/** The `.tap` `direction` of a taxi sign, from the compass heading its FRONT face looks toward. Unlike
 *  the other one-point elements it uses the convention of objects — 0 = east, 90 = north, 180 = west,
 *  270 = south — so it goes through orientation.ts like an XREF's `.toc` rotation. */
export function taxisignTapDirection(heading: number): number {
  return headingToDirection(heading);
}

/** Clamp into [lo, hi]; a non-finite value is null (the caller refuses it). */
export function clampTo(v: number, [lo, hi]: readonly [number, number]): number | null {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
}

/** A car lot count: an integer inside CARLOT_COUNT_RANGE, or null. */
export function cleanCarlotCount(v: number): number | null {
  return clampTo(Math.round(v), CARLOT_COUNT_RANGE);
}
