// contextMenuPosition.ts — where the right-click object menu (v0.7) lands. PURE and viewport-only (its
// inputs are the clientX/clientY of the contextmenu event plus the measured menu size), so the placement
// rules unit-test without a DOM. The menu is portalled to <body> with position:fixed, which is why
// viewport coordinates are exactly right and no scroll offset enters here.
//
// Unlike the hover-preview (previewPosition.ts, placed BESIDE a card), a context menu opens AT the cursor:
// its top-left sits on the click and it only flips to the other side of the cursor when it would overflow
// the right/bottom edge — the native-menu convention. Both axes are then clamped to an 8px viewport margin.
export interface Size {
  width: number;
  height: number;
}
export interface Pos {
  left: number;
  top: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/** Place a `menu`-sized popup opened at the cursor (`x`,`y`) inside `viewport`. Opens down-right from the
 *  cursor; flips to the left/up side if that edge would overflow, then clamps to an 8px margin so the menu
 *  is always fully on-screen (one taller/wider than the viewport pins to the top-left margin rather than
 *  going negative). */
export function computeContextMenuPosition(x: number, y: number, menu: Size, viewport: Size): Pos {
  const margin = 8;

  let left = x;
  if (left + menu.width + margin > viewport.width) left = x - menu.width; // flip to the cursor's left
  left = clamp(left, margin, Math.max(margin, viewport.width - menu.width - margin));

  let top = y;
  if (top + menu.height + margin > viewport.height) top = y - menu.height; // flip above the cursor
  top = clamp(top, margin, Math.max(margin, viewport.height - menu.height - margin));

  return { left, top };
}
