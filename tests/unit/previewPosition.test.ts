import { describe, it, expect } from "vitest";
import { computePreviewPosition, type Rect } from "../../src/renderer/catalog/previewPosition";

// A 40px thumbnail anchor at (left, top); the app's real thumb size. right/bottom/width/height derived.
function thumb(left: number, top: number, size = 40): Rect {
  return { left, top, right: left + size, bottom: top + size, width: size, height: size };
}

const PREVIEW = { width: 132, height: 150 }; // ~3× thumb + name
const VIEWPORT = { width: 1280, height: 800 };
const GAP = 12;
const MARGIN = 8;

describe("computePreviewPosition", () => {
  it("places the popup to the RIGHT of the anchor with the gap, vertically centered", () => {
    const anchor = thumb(20, 300); // catalog is the left column → room on the right
    const { left, top } = computePreviewPosition(anchor, PREVIEW, VIEWPORT, GAP);
    expect(left).toBe(anchor.right + GAP); // 72
    // centered on the anchor: anchor mid (320) − half the popup (75) = 245
    expect(top).toBe(anchor.top + anchor.height / 2 - PREVIEW.height / 2);
  });

  it("flips to the LEFT when the right side would overflow the viewport", () => {
    const anchor = thumb(VIEWPORT.width - 60, 300); // hard against the right edge
    const { left } = computePreviewPosition(anchor, PREVIEW, VIEWPORT, GAP);
    expect(left).toBe(anchor.left - GAP - PREVIEW.width); // to the left of the anchor
    expect(left).toBeGreaterThanOrEqual(MARGIN);
  });

  it("clamps the top to the margin when the anchor is near the top edge", () => {
    const anchor = thumb(20, 2); // popup centered here would go negative
    const { top } = computePreviewPosition(anchor, PREVIEW, VIEWPORT, GAP);
    expect(top).toBe(MARGIN);
  });

  it("clamps the bottom so the popup stays fully on-screen near the bottom edge", () => {
    const anchor = thumb(20, VIEWPORT.height - 20);
    const { top } = computePreviewPosition(anchor, PREVIEW, VIEWPORT, GAP);
    expect(top).toBe(VIEWPORT.height - PREVIEW.height - MARGIN);
    expect(top + PREVIEW.height + MARGIN).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("pins to the top-left margin when the preview is larger than the viewport", () => {
    const huge = { width: 2000, height: 2000 };
    const { left, top } = computePreviewPosition(thumb(400, 400), huge, VIEWPORT, GAP);
    expect(left).toBe(MARGIN);
    expect(top).toBe(MARGIN);
  });
});
