import { describe, expect, it } from "vitest";
import { mayNavigate } from "../../src/main/navigation";

const DEV = "http://localhost:5173/";
const PACKAGED = undefined;

describe("mayNavigate — packaged", () => {
  it("refuses every navigation, because PCT never navigates", () => {
    expect(mayNavigate("file:///C:/Users/x/evil.html", PACKAGED)).toBe(false);
    expect(mayNavigate("https://example.com/", PACKAGED)).toBe(false);
    expect(mayNavigate("http://localhost:5173/", PACKAGED)).toBe(false);
    expect(mayNavigate("about:blank", PACKAGED)).toBe(false);
  });

  it("★ refuses one file:// URL from another — the whole point of this module", () => {
    // The guard this replaced compared the target's origin against the current page's. In a
    // packaged build the current page IS a file:// URL, and every file:// URL has origin "null",
    // so that comparison was "null" === "null" and let through a navigation to any local file.
    // Dragging a crafted .html onto the window was enough to reach it, and the page then loaded
    // with the preload attached — window.pct, which can export, install and uninstall.
    const current = "file:///C:/Program%20Files/PCT/resources/app/out/renderer/index.html";
    const dropped = "file:///C:/Users/x/Downloads/evil.html";
    expect(new URL(current).origin).toBe("null");
    expect(new URL(dropped).origin).toBe("null");
    expect(new URL(current).origin === new URL(dropped).origin).toBe(true); // the old logic said yes
    expect(mayNavigate(dropped, PACKAGED)).toBe(false); // this one says no
  });
});

describe("mayNavigate — dev", () => {
  it("allows the dev server to reload its own origin", () => {
    expect(mayNavigate("http://localhost:5173/", DEV)).toBe(true);
    expect(mayNavigate("http://localhost:5173/index.html?x=1", DEV)).toBe(true);
  });

  it("refuses any other origin, including a different port", () => {
    expect(mayNavigate("http://localhost:5199/", DEV)).toBe(false);
    expect(mayNavigate("https://example.com/", DEV)).toBe(false);
  });

  it("★ refuses opaque origins even in dev", () => {
    // file:, data: and blob: all report origin "null". If the dev URL were ever itself opaque, a
    // plain equality check would match them all — so opaque is rejected before any comparison.
    expect(mayNavigate("file:///C:/evil.html", DEV)).toBe(false);
    expect(mayNavigate("data:text/html,<script>alert(1)</script>", DEV)).toBe(false);
    expect(mayNavigate("blob:http://localhost:5173/abc", DEV)).toBe(false);
  });
});

describe("mayNavigate — malformed input", () => {
  it("refuses rather than throwing, so a bad URL cannot crash the guard", () => {
    expect(mayNavigate("", DEV)).toBe(false);
    expect(mayNavigate("not a url", DEV)).toBe(false);
    expect(mayNavigate("://", DEV)).toBe(false);
  });
});
