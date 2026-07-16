// windowBounds.ts — pure geometry for "reopen where you left it" (forum #125, @ApfelFlieger). No Electron
// import: main passes what it got from `screen` and gets back the bounds to open with, so this unit-tests
// directly — the settings.ts idiom.
//
// The reason this is a module and not three lines inside createWindow is that the DISPLAY SET CHANGES
// between runs. Close PCT on a docked second monitor, undock the laptop, reopen: the saved x/y names a
// rectangle that no longer exists on any screen, and the window opens somewhere the user cannot see or
// drag back — a worse bug than the one we're fixing, and one that persists across restarts because the
// bad position is now saved. So restoring the POSITION is conditional on it still being reachable; the
// SIZE is always restored (it can be clamped, but it can't strand anyone).
import type { WindowBounds } from "../core/project/types";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The fixed size v0.1–v0.3 always opened at: still the first-run default, and the fallback whenever
 *  there's no usable saved rect. */
export const DEFAULT_SIZE = { width: 1280, height: 820 } as const;

/** A rescue floor, not a layout policy. zod already rejects a non-positive size, but it happily accepts
 *  1×1 — and a 1-pixel window can't be grabbed to fix itself. Anything above this is the user's choice
 *  and is restored as-is, even if the panels get cramped. */
const MIN_WIDTH = 640;
const MIN_HEIGHT = 480;

/** How much of the window must land on a display to count as reachable. A window is dragged by its title
 *  bar, so what matters is that a real corner is on-screen — not that the whole thing fits. */
const VISIBLE_MARGIN = 96;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

const overlap = (a: Rect, b: Rect): { w: number; h: number } => ({
  w: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  h: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
});

/** True when at least a VISIBLE_MARGIN-square corner of `rect` sits on some display's work area. */
export function isReachable(rect: Rect, displays: Rect[]): boolean {
  return displays.some((d) => {
    const o = overlap(rect, d);
    return o.w >= VISIBLE_MARGIN && o.h >= VISIBLE_MARGIN;
  });
}

export interface RestoredBounds {
  width: number;
  height: number;
  x?: number; // both omitted → Electron centres the window, which is what we want when the position is unusable
  y?: number;
  maximized: boolean;
}

/** Decide the bounds to open with. `displays` are WORK AREAS (`screen.getAllDisplays().map(d => d.workArea)`)
 *  rather than full bounds, so a saved position that only overlaps the taskbar doesn't count as reachable.
 *  Never throws; never returns a position that isn't on a screen. */
export function restoreBounds(saved: WindowBounds | undefined, displays: Rect[]): RestoredBounds {
  if (saved === undefined || displays.length === 0) return { ...DEFAULT_SIZE, maximized: false };

  // Clamp the size to the largest display we actually have NOW: a window sized on a 4K monitor reopening
  // on a laptop must not be taller than the laptop, or its title bar starts off the top of the screen.
  const widest = Math.max(...displays.map((d) => d.width));
  const tallest = Math.max(...displays.map((d) => d.height));
  const width = clamp(saved.width, MIN_WIDTH, Math.max(MIN_WIDTH, widest));
  const height = clamp(saved.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, tallest));
  const { maximized } = saved;

  // The display it was saved on is gone → keep the size, drop the position, let Electron centre it.
  if (!isReachable({ x: saved.x, y: saved.y, width, height }, displays)) return { width, height, maximized };

  return { x: saved.x, y: saved.y, width, height, maximized };
}
