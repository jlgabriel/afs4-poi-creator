// markLooks.ts — how MarkLayer draws each of the three one-point TAP elements.
//
//   • GROUND TEXT: its real footprint (one letter cell per character, plus one for an arrow) with the
//     letters painted in its own colours, turned with the element. The tops of the letters point along
//     the heading, which is what the heading tick shows.
//   • JETWAY: a 3 m wide tunnel from the mounting point along the heading, as long as its extension
//     (6 m at least, so a retracted one can still be grabbed).
//   • CAR LOT: an approximate footprint — rows along the heading, spaces across it, each space 2.5 m wide
//     and 5 m deep.
//
// Colours: teal, indigo and lime, the three not already spoken for on this map (blue footprints, white
// pads, violet stands, pink glider starts, yellow boundary, amber selection, cyan grips).
import type { AirportCarlot, AirportGroundText, AirportJetway } from "../../core/project/types";
import type { GroundTextColor } from "../../core/project/marks";
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

const JETWAY_WIDTH_M = 3;
const jetwayLength = (j: AirportJetway): number => Math.max(6, j.extensionAmount);

export const JETWAY_LOOK: MarkLook<AirportJetway> = {
  color: "#6366f1",
  outline: (j, at, heading) =>
    rectAround(destination(at, jetwayLength(j) / 2, heading), heading, jetwayLength(j), JETWAY_WIDTH_M),
  reach: jetwayLength,
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
