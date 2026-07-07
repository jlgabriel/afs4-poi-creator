// Preload — the ONLY privileged bridge between the sandboxed renderer and Node/main. For M1e-1
// it exposes just a liveness ping so the renderer can confirm the bridge is wired; the full
// typed PctApi (§3.5) is added here in M1e-2. contextIsolation is on, so we go through
// contextBridge (never assign to window directly).
import { contextBridge } from "electron";

const pct = {
  ping: (): string => "pct-alive",
};

contextBridge.exposeInMainWorld("pct", pct);
