/// <reference types="vite/client" />

// The preload bridge, typed for the renderer. window.pct is the whole main↔renderer surface (§3.5).
import type { PctApi } from "../shared/pctApi";

declare global {
  interface Window {
    // Optional: injected by the preload bridge inside Electron, but UNDEFINED in the browser preview
    // harness (vite.preview.mts). Marking it optional forces every call site to guard (getPct()) so
    // the renderer degrades gracefully without the bridge. See src/renderer/app/pct.ts.
    pct?: PctApi;
  }
}
