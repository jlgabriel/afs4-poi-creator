import { describe, it, expect } from "vitest";
import { computeContextMenuPosition } from "../../src/renderer/catalog/contextMenuPosition";

const MENU = { width: 210, height: 160 };
const VIEWPORT = { width: 1280, height: 800 };
const MARGIN = 8;

describe("computeContextMenuPosition", () => {
  it("opens down-right from the cursor when there is room (top-left sits on the click)", () => {
    const { left, top } = computeContextMenuPosition(400, 300, MENU, VIEWPORT);
    expect(left).toBe(400);
    expect(top).toBe(300);
  });

  it("flips to the LEFT of the cursor near the right edge, staying on-screen", () => {
    const x = VIEWPORT.width - 20; // menu would overflow the right edge opening rightward
    const { left } = computeContextMenuPosition(x, 300, MENU, VIEWPORT);
    expect(left).toBe(x - MENU.width);
    expect(left + MENU.width + MARGIN).toBeLessThanOrEqual(VIEWPORT.width);
  });

  it("flips ABOVE the cursor near the bottom edge, staying on-screen", () => {
    const y = VIEWPORT.height - 20;
    const { top } = computeContextMenuPosition(400, y, MENU, VIEWPORT);
    expect(top).toBe(y - MENU.height);
    expect(top + MENU.height + MARGIN).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("pins to the top-left margin when the menu is larger than the viewport", () => {
    const { left, top } = computeContextMenuPosition(50, 50, { width: 2000, height: 2000 }, VIEWPORT);
    expect(left).toBe(MARGIN);
    expect(top).toBe(MARGIN);
  });

  it("never lets left/top drop under the margin, even for a click in the corner", () => {
    const { left, top } = computeContextMenuPosition(2, 2, MENU, VIEWPORT);
    expect(left).toBeGreaterThanOrEqual(MARGIN);
    expect(top).toBeGreaterThanOrEqual(MARGIN);
  });
});
