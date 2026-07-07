/// <reference types="vite/client" />

// Renderer-visible shape of the preload bridge. Replaced by the full PctApi (§3.5) in M1e-2.
interface Window {
  pct?: {
    ping(): string;
  };
}
