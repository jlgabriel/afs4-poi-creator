// errorLog.ts — forward the renderer's UNCAUGHT failures into the session log (main/log.ts).
//
// Everything main does is already logged at the ipc.ts chokepoint, but a renderer crash left no trace
// anywhere: it lands in a DevTools console that is closed in a packaged build, so from the outside a
// React component that throws is indistinguishable from a window that simply stopped responding — the
// "it just does nothing" report, which costs a full round trip to even classify.
//
// Write-only and best-effort. Nothing here can throw into the app: if the bridge is missing (the browser
// preview) the hooks are never installed at all, and a failed send is swallowed.
import { getPct } from "./pct";

/** After this many forwarded errors we stop. A component that throws on every render would otherwise
 *  send one line per frame — main's byte ceiling would contain the damage, but it would contain it by
 *  filling the log with the same line, which costs the user the rest of the session's history. The count
 *  is what matters after the first few anyway, and the last line says how it ended. */
const MAX_FORWARDED = 50;

let sent = 0;
let installed = false;

function forward(level: "warn" | "error", message: string): void {
  const pct = getPct();
  if (pct === null || sent > MAX_FORWARDED) return;
  sent += 1;
  const text =
    sent > MAX_FORWARDED
      ? `stopped forwarding renderer errors after ${MAX_FORWARDED} — something is failing repeatedly`
      : message;
  void pct.log(level, text).catch(() => {
    /* the log is never load-bearing */
  });
}

/** Describe a thrown value the way the log wants it: one line, name + message + first stack frame. */
function describe(value: unknown): string {
  if (value instanceof Error) {
    const frame = (value.stack ?? "").split("\n")[1]?.trim();
    return `${value.name}: ${value.message}${frame !== undefined ? ` (${frame})` : ""}`;
  }
  return String(value);
}

/** Install the global hooks. Call once, at boot. No-op without the bridge, and no-op if called twice. */
export function installErrorLog(): void {
  if (installed || getPct() === null) return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    // `error` fires for failed <img>/<script> loads too, where `e.error` is null and the interesting part
    // is which resource failed — a blank map tile, a photo that won't decode.
    if (e.error != null) forward("error", `${describe(e.error)} at ${e.filename}:${e.lineno}`);
    else if (e.message !== "") forward("error", e.message);
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    forward("error", `unhandled rejection — ${describe(e.reason)}`);
  });
}
