// holdMark.ts — the two hold marks of a taxi sign as small drawings, so `<HOLD0>` and `<HOLD1>` look like
// what the sign shows instead of their names. Shared by the Inspector's token buttons and the sign drawn on
// the map. Drawn in currentColor, so each place paints it in its own ink.
//
//   <HOLD0>: two solid lines over two dashed ones.
//   <HOLD1>: two lines joined by pairs of bars — a ladder.

const BARS: Record<"<HOLD0>" | "<HOLD1>", string> = {
  "<HOLD0>":
    `<rect x="2" y="3" width="36" height="2"/><rect x="2" y="7" width="36" height="2"/>` +
    [3, 14, 25, 35]
      .map((x) => `<rect x="${x}" y="11" width="3" height="2"/><rect x="${x}" y="15" width="3" height="2"/>`)
      .join(""),
  "<HOLD1>":
    `<rect x="2" y="4" width="36" height="2"/><rect x="2" y="14" width="36" height="2"/>` +
    [8, 19, 30]
      .map((x) => `<rect x="${x}" y="6" width="1.2" height="8"/><rect x="${x + 2}" y="6" width="1.2" height="8"/>`)
      .join(""),
};

export const isHoldToken = (t: string): t is "<HOLD0>" | "<HOLD1>" => t === "<HOLD0>" || t === "<HOLD1>";

/** The mark as an inline SVG `height` px tall (twice as wide). */
export function holdSvg(token: "<HOLD0>" | "<HOLD1>", height: number): string {
  return (
    `<svg viewBox="0 0 40 20" width="${height * 2}" height="${height}" fill="currentColor" ` +
    `style="vertical-align:middle" aria-hidden="true">${BARS[token]}</svg>`
  );
}
