// previewPosition.ts — where the hover-preview popup lands relative to the card it describes (forum
// #170/#166). PURE and viewport-only (all inputs are getBoundingClientRect coords), so the placement
// rules unit-test without a DOM. The popup itself is portalled to <body> with position:fixed, which is
// why viewport coordinates are exactly right and no scroll offset enters here.

/** The slice of DOMRect we read — the anchor (the hovered thumbnail) and, for clamping, the viewport. */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Pos {
  left: number;
  top: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/** Place the preview beside the hovered anchor. The catalog is the LEFT column, so the right side has
 *  room and is preferred (the popup floats over the map, un-clipped because it's portalled out of the
 *  panel's overflow:hidden); if the right side would run off-screen we flip to the left. Vertically we
 *  center on the anchor, then clamp both axes so the box always stays fully on-screen with an 8px margin
 *  — a preview larger than the viewport pins to the top-left margin rather than going negative. */
export function computePreviewPosition(anchor: Rect, preview: Size, viewport: Size, gap = 12): Pos {
  const margin = 8;

  // Horizontal: right of the anchor first; flip left if it overflows the right edge.
  let left = anchor.right + gap;
  if (left + preview.width + margin > viewport.width) {
    left = anchor.left - gap - preview.width;
  }
  left = clamp(left, margin, viewport.width - preview.width - margin);

  // Vertical: centered on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - preview.height / 2;
  top = clamp(top, margin, viewport.height - preview.height - margin);

  return { left, top };
}
