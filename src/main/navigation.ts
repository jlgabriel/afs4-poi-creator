/**
 * May the window navigate to this URL?
 *
 * A pure decision, extracted so it can be tested. The version this replaces compared the target's
 * origin against the current page's and allowed a match — which fails open in a packaged build,
 * because the renderer is loaded from disk and every `file://` URL has origin `"null"`. Comparing
 * them yields `"null" === "null"` for a navigation to any local file.
 *
 * PCT is a single page that never legitimately navigates. The only exception is Vite's dev server,
 * which may reload its own origin.
 */
export function mayNavigate(target: string, devServerUrl: string | undefined): boolean {
  if (!devServerUrl) return false; // packaged: nothing, ever
  try {
    const url = new URL(target);
    // Check the SCHEME, not just the origin. `file:` and `data:` report origin "null" — comparing
    // those is the original bug — but `blob:http://localhost:5173/…` reports the dev server's own
    // origin, so an origin test alone would wave it through. Vite only ever reloads http(s);
    // nothing else is a legitimate navigation, so nothing else is allowed.
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}
