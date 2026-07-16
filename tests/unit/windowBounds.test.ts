import { describe, it, expect } from "vitest";
import { DEFAULT_SIZE, isReachable, restoreBounds, type Rect } from "../../src/main/windowBounds";
import type { WindowBounds } from "../../src/core/project/types";

// "Can the PCT app also be coded in such a way that it reappears at the same place and in the size as
// when closing?" (forum #125, @ApfelFlieger). The easy half is giving the bounds back; the half worth
// testing is the display set CHANGING between runs, because getting that wrong strands the window
// somewhere unclickable AND persists — every restart reopens it in the same unreachable place.

const LAPTOP: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND: Rect = { x: 1920, y: 0, width: 2560, height: 1400 }; // docked monitor, to the right

const saved = (p: Partial<WindowBounds> = {}): WindowBounds => ({
  x: 100,
  y: 80,
  width: 1280,
  height: 820,
  maximized: false,
  ...p,
});

describe("restoreBounds", () => {
  it("opens at the default size with nothing saved", () => {
    expect(restoreBounds(undefined, [LAPTOP])).toEqual({ ...DEFAULT_SIZE, maximized: false });
  });

  it("gives back an on-screen placement unchanged", () => {
    expect(restoreBounds(saved(), [LAPTOP])).toEqual({ x: 100, y: 80, width: 1280, height: 820, maximized: false });
  });

  it("carries the maximized flag back", () => {
    expect(restoreBounds(saved({ maximized: true }), [LAPTOP]).maximized).toBe(true);
  });

  it("restores a placement on a second monitor while it is still attached", () => {
    const onSecond = saved({ x: 2200, y: 200 });
    expect(restoreBounds(onSecond, [LAPTOP, SECOND])).toMatchObject({ x: 2200, y: 200 });
  });

  // THE case this module exists for: close PCT on the docked monitor, undock, reopen.
  it("drops a position whose display is gone, but keeps the size", () => {
    const onSecond = saved({ x: 2200, y: 200, width: 1400, height: 900 });
    const got = restoreBounds(onSecond, [LAPTOP]); // second monitor unplugged
    expect(got).toEqual({ width: 1400, height: 900, maximized: false });
    expect(got.x).toBeUndefined(); // no position → Electron centres it, which is reachable by definition
    expect(got.y).toBeUndefined();
  });

  it("refuses a position that only grazes a display", () => {
    // 40px of the window on screen: technically visible, not actually grabbable.
    expect(restoreBounds(saved({ x: 1880, y: 500 }), [LAPTOP]).x).toBeUndefined();
  });

  it("keeps a position that overlaps enough to grab", () => {
    expect(restoreBounds(saved({ x: 1700, y: 500 }), [LAPTOP]).x).toBe(1700);
  });

  it("clamps a size saved on a big monitor down to the display it reopens on", () => {
    const onBig = saved({ x: 0, y: 0, width: 2560, height: 1400 });
    const got = restoreBounds(onBig, [LAPTOP]);
    expect(got.width).toBe(1920);
    expect(got.height).toBe(1040); // taller than the laptop would put the title bar off the top
  });

  it("rescues a degenerate saved size", () => {
    const got = restoreBounds(saved({ width: 1, height: 1 }), [LAPTOP]);
    expect(got.width).toBe(640); // a 1px window cannot be grabbed to fix itself
    expect(got.height).toBe(480);
  });

  it("falls back to defaults when there are no displays at all", () => {
    expect(restoreBounds(saved(), [])).toEqual({ ...DEFAULT_SIZE, maximized: false });
  });
});

describe("isReachable", () => {
  it("accepts a window fully on a display", () => {
    expect(isReachable({ x: 10, y: 10, width: 800, height: 600 }, [LAPTOP])).toBe(true);
  });

  it("rejects a window entirely off every display", () => {
    expect(isReachable({ x: 5000, y: 0, width: 800, height: 600 }, [LAPTOP])).toBe(false);
  });

  it("accepts a window that straddles two displays", () => {
    expect(isReachable({ x: 1800, y: 100, width: 800, height: 600 }, [LAPTOP, SECOND])).toBe(true);
  });

  it("rejects a window hidden above the work area", () => {
    // Negative Y past the window's own height: the title bar is off the top of the screen.
    expect(isReachable({ x: 100, y: -700, width: 800, height: 600 }, [LAPTOP])).toBe(false);
  });
});
