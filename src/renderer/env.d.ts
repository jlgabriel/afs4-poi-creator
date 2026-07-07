/// <reference types="vite/client" />

// The preload bridge, typed for the renderer. window.pct is the whole main↔renderer surface (§3.5).
import type { PctApi } from "../shared/pctApi";

declare global {
  interface Window {
    pct: PctApi;
  }
}
