// markLooks.ts — how MarkLayer draws each of the four one-point TAP elements.
//
//   • GROUND TEXT: its real footprint (one letter cell per character, plus one for an arrow) with the
//     letters painted in its own colours, turned with the element. The tops of the letters point along
//     the heading, which is what the heading tick shows.
//   • TAXI SIGN: BOTH faces laid flat on the ground, one each side of the sign's point, which sits on the
//     line between them. The front face lies on the side it looks toward (the heading tick's side) and
//     reads upright from there; the back face lies on the other side and reads upright from behind. Each
//     face is drawn whether it has components or not — a blank one as an empty plate. Components are
//     painted in their own colours (red, yellow, black), arrows drawn as arrows. The size is approximate
//     (from the size type); the painted faces never shrink below a readable size, so a sign stays legible
//     when zoomed out.
//   • JETWAY: three parts from the mounting point out. The BASE, a square on the heading; the EXTENSION,
//     a 3 m wide tunnel from the base, turned by its extension direction (counter-clockwise) and as long as
//     its extension amount (2 m at least, so a retracted one still shows); and the EXIT, a square at the
//     end of the tunnel, turned by its exit direction from the heading. Sizes approximate.
//   • CAR LOT: an approximate footprint — rows along the heading, spaces across it, each space 2.5 m wide
//     and 5 m deep.
//
// Colours: teal, orange, indigo and lime, the four not already spoken for on this map (blue footprints,
// white pads, violet stands, pink glider starts, yellow boundary, amber selection, cyan grips).
import type {
  AirportCarlot,
  AirportGroundText,
  AirportJetway,
  AirportTaxisign,
  AirportTaxisignElement,
  LonLat,
} from "../../core/project/types";
import type { GroundTextColor, TaxisignElementType } from "../../core/project/marks";
import { cleanTaxisignValue, taxisignFaces, taxisignValueParts } from "../../core/project/marks";
import { destination } from "../../core/geo/geo";
import { circleAround, rectAround, type MarkLook } from "./MarkLayer";

const PAINT: Record<GroundTextColor, string> = {
  none: "transparent",
  black: "#111111",
  blue: "#1d4ed8",
  green: "#16a34a",
  red: "#dc2626",
  white: "#ffffff",
  yellow: "#facc15",
};

/** Below this letter height on screen the painted text is dropped; the outline still shows. */
const MIN_LETTER_PX = 8;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The cells a ground text occupies: one per character, and one more for an arrow. */
const groundTextCells = (g: AirportGroundText): number =>
  Math.max(1, g.value.length) + (g.pointing === "none" ? 0 : 1);

export const GROUNDTEXT_LOOK: MarkLook<AirportGroundText> = {
  color: "#14b8a6",
  outline: (g, at, heading) =>
    g.background === "circle" && groundTextCells(g) === 1
      ? circleAround(at, Math.max(g.size[0], g.size[1]) / 2)
      : rectAround(at, heading, g.size[1], groundTextCells(g) * g.size[0]),
  reach: (g) => g.size[1] / 2,
  glyph: (g, pxPerM, heading) => {
    const h = g.size[1] * pxPerM;
    if (h < MIN_LETTER_PX) return null;
    const w = g.size[0] * pxPerM;
    const font = h * 0.8;
    // A letter is about 0.6 of its font size wide; squeeze or stretch it to the cell.
    const k = w / (0.6 * font);
    const cell = (ch: string): string =>
      `<span style="display:inline-block;width:${w}px;text-align:center">` +
      `<span style="display:inline-block;transform:scaleX(${k.toFixed(3)})">` +
      `${ch === " " ? "&nbsp;" : escapeHtml(ch)}</span></span>`;
    const cells = [...g.value].map(cell);
    if (g.pointing === "left") cells.unshift(cell("◀"));
    if (g.pointing === "right") cells.push(cell("▶"));
    const radius = g.background === "circle" ? "border-radius:9999px;" : "";
    const stroke =
      g.strokeColor === "none" ? "" : `box-shadow:inset 0 0 0 ${Math.max(1, w * 0.08)}px ${PAINT[g.strokeColor]};`;
    const style =
      `transform:translate(-50%,-50%) rotate(${heading}deg);height:${h}px;line-height:${h}px;` +
      `font-size:${font}px;color:${PAINT[g.textColor]};background:${PAINT[g.backgroundColor]};${radius}${stroke}`;
    return `<div class="pct-groundtext" style="${style}">${cells.join("")}</div>`;
  },
};

/** A sign's letter height per size type, metres — approximate. The face is SIGN_FACE_K letters tall, a
 *  letter SIGN_CELL_K of one wide, a token (an arrow) SIGN_TOKEN_K, and each component has SIGN_PAD_K of
 *  margin. */
const SIGN_LETTER_M = [0.3, 0.38, 0.46, 0.61];
const SIGN_FACE_K = 1.7;
const SIGN_CELL_K = 0.7;
const SIGN_TOKEN_K = 1.1;
const SIGN_PAD_K = 0.6;
/** The painted face is never drawn with letters smaller than this on screen… */
const SIGN_MIN_LETTER_PX = 9;
/** …and not at all below this scale: zoomed out that far, the outline is enough. */
const SIGN_MIN_PX_PER_M = 1;

/** Letters and background of each component type. */
const SIGN_PAINT: Record<Exclude<TaxisignElementType, "linebreak">, { fg: string; bg: string; edge?: string }> = {
  runway: { fg: "#ffffff", bg: "#c81e1e" },
  destination: { fg: "#111111", bg: "#facc15" },
  location: { fg: "#facc15", bg: "#111111", edge: "#facc15" },
  remainingrunway: { fg: "#ffffff", bg: "#111111" },
};

const signLetter = (t: AirportTaxisign): number => SIGN_LETTER_M[Math.min(3, Math.max(0, t.sizeType - 1))];

/** One component's width, in letters. */
function componentCells(e: AirportTaxisignElement): number {
  const v = cleanTaxisignValue(e.type, e.value);
  const parts = e.type === "destination" ? taxisignValueParts(v) : [{ kind: "text" as const, text: v }];
  const cells = parts.reduce((n, p) => n + (p.kind === "token" ? SIGN_TOKEN_K : p.text.length * SIGN_CELL_K), 0);
  return cells + SIGN_PAD_K;
}

/** The wider face's width in metres, at least one face's height. */
function signWidth(t: AirportTaxisign): number {
  const faces = taxisignFaces(t.elements);
  const cells = Math.max(...faces.map((f) => f.reduce((n, e) => n + componentCells(e), 0)));
  return Math.max(SIGN_FACE_K, cells) * signLetter(t);
}

/** One face's height, laid flat. The outline holds both faces, so it is twice this deep along the heading;
 *  at least 1.5 m a face, to grab. */
const signDepth = (t: AirportTaxisign): number => Math.max(1.5, SIGN_FACE_K * signLetter(t));

const spaced = (s: string): string => escapeHtml(s).replace(/ /g, "&nbsp;");

/** An arrow token as an arrow turned from straight up: right is clockwise, left counter-clockwise. A hold
 *  mark is shown by its name. */
function tokenHtml(token: string, letterPx: number): string {
  const m = /^<(LEFT|RIGHT)(\d+)>$/.exec(token);
  if (m === null) {
    return `<span style="font-size:${letterPx * 0.55}px;padding:0 0.2em">${escapeHtml(token.slice(1, -1))}</span>`;
  }
  const deg = (m[1] === "RIGHT" ? 1 : -1) * Number(m[2]);
  return `<span style="display:inline-block;transform:rotate(${deg}deg);padding:0 0.15em">↑</span>`;
}

/** One face as HTML: its components in a row, or an empty plate when it has none. */
function faceHtml(elements: readonly AirportTaxisignElement[], letterPx: number, extra: string): string {
  const shown = elements.filter((e) => e.type !== "linebreak" && cleanTaxisignValue(e.type, e.value) !== "");
  const style = `height:${letterPx * SIGN_FACE_K}px;${extra}`;
  if (shown.length === 0) {
    return `<div class="pct-taxisign-face blank" style="${style}width:${letterPx * 2}px;"></div>`;
  }
  const parts = shown.map((e) => {
    const paint = SIGN_PAINT[e.type as Exclude<TaxisignElementType, "linebreak">];
    const v = cleanTaxisignValue(e.type, e.value);
    const inner =
      e.type === "destination"
        ? taxisignValueParts(v)
            .map((p) => (p.kind === "token" ? tokenHtml(p.text, letterPx) : spaced(p.text)))
            .join("")
        : spaced(v);
    const edge =
      paint.edge === undefined ? "" : `box-shadow:inset 0 0 0 ${Math.max(1, letterPx * 0.08)}px ${paint.edge};`;
    const cell =
      `display:inline-block;padding:0 ${letterPx * 0.3}px;` + `color:${paint.fg};background:${paint.bg};${edge}`;
    return `<span style="${cell}">${inner}</span>`;
  });
  return `<div class="pct-taxisign-face" style="${style}">${parts.join("")}</div>`;
}

export const TAXISIGN_LOOK: MarkLook<AirportTaxisign> = {
  color: "#f97316",
  outline: (t, at, heading) => rectAround(at, heading, 2 * signDepth(t), Math.max(2, signWidth(t))),
  reach: (t) => signDepth(t) + 1,
  glyph: (t, pxPerM, heading) => {
    if (pxPerM < SIGN_MIN_PX_PER_M) return null;
    const [front, back] = taxisignFaces(t.elements);
    const letterPx = Math.max(SIGN_MIN_LETTER_PX, signLetter(t) * pxPerM);
    // Turned so that "up" points AWAY from the front's reader, who stands where the heading tick points:
    // the front face, at the bottom, reads upright from there. The back face, at the top, is turned half
    // a turn more, so it reads upright from behind. The centre of the pair — the line between the two
    // faces — is the sign's point.
    const style =
      `transform:translate(-50%,-50%) rotate(${heading + 180}deg);` +
      `line-height:${letterPx * SIGN_FACE_K}px;font-size:${letterPx}px;`;
    return (
      `<div class="pct-taxisign" style="${style}">` +
      faceHtml(back, letterPx, "transform:rotate(180deg);") +
      faceHtml(front, letterPx, "") +
      `</div>`
    );
  },
};

const JETWAY_WIDTH_M = 3;
const JETWAY_BASE_M = 4;
const JETWAY_EXIT_M = 3.5;
const extensionLength = (j: AirportJetway): number => Math.max(2, j.extensionAmount);

/** The three parts' rings: base, extension, exit. Directions are relative to the heading and
 *  counter-clockwise, so a compass bearing is the heading MINUS them. */
export function jetwayParts(j: AirportJetway, at: LonLat, heading: number): [LonLat[], LonLat[], LonLat[]] {
  const base = rectAround(destination(at, JETWAY_BASE_M / 2, heading), heading, JETWAY_BASE_M, JETWAY_BASE_M);
  const start = destination(at, JETWAY_BASE_M, heading);
  const along = heading - j.extensionDirection;
  const length = extensionLength(j);
  const extension = rectAround(destination(start, length / 2, along), along, length, JETWAY_WIDTH_M);
  const end = destination(start, length, along);
  const exitHeading = heading - j.exitDirection;
  const exit = rectAround(destination(end, JETWAY_EXIT_M / 2, exitHeading), exitHeading, JETWAY_EXIT_M, JETWAY_EXIT_M);
  return [base, extension, exit];
}

export const JETWAY_LOOK: MarkLook<AirportJetway> = {
  color: "#6366f1",
  outline: (j, at, heading) => jetwayParts(j, at, heading),
  reach: (j) => JETWAY_BASE_M + extensionLength(j) + JETWAY_EXIT_M,
  glyph: () => null,
};

const SPACE_WIDTH_M = 2.5;
const SPACE_DEPTH_M = 5;

export const CARLOT_LOOK: MarkLook<AirportCarlot> = {
  color: "#84cc16",
  outline: (c, at, heading) => rectAround(at, heading, c.rows * SPACE_DEPTH_M, c.columns * SPACE_WIDTH_M),
  reach: (c) => (c.rows * SPACE_DEPTH_M) / 2,
  glyph: (c, pxPerM) => {
    const px = Math.min(c.rows * SPACE_DEPTH_M, c.columns * SPACE_WIDTH_M) * pxPerM;
    if (px < 24) return null;
    return `<div class="pct-mark-label">${c.rows} × ${c.columns}</div>`;
  },
};
