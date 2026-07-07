// Preload — the ONLY privileged bridge (design §3.5). Implements PctApi as thin ipcRenderer.invoke
// calls and exposes it as window.pct. contextIsolation is on, so we go through contextBridge (never
// touch window directly). Adding a method here means adding its handler in main/ipc.ts (same channel).
import { contextBridge, ipcRenderer } from "electron";
import type { PctApi } from "../shared/pctApi";

const pct: PctApi = {
  detectPaths: () => ipcRenderer.invoke("pct:detectPaths"),
  scan: (installDir, userXrefDir) => ipcRenderer.invoke("pct:scan", installDir, userXrefDir),
  getCachedCatalog: () => ipcRenderer.invoke("pct:getCachedCatalog"),
  getSettings: () => ipcRenderer.invoke("pct:getSettings"),
  setSettings: (patch) => ipcRenderer.invoke("pct:setSettings", patch),
  openProject: () => ipcRenderer.invoke("pct:openProject"),
  saveProject: (project, filePath) => ipcRenderer.invoke("pct:saveProject", project, filePath),
  autosaveShadow: (project) => ipcRenderer.invoke("pct:autosaveShadow", project),
  loadShadow: () => ipcRenderer.invoke("pct:loadShadow"),
  resolveHeights: (objects) => ipcRenderer.invoke("pct:resolveHeights", objects),
  exportPoi: (project, opts) => ipcRenderer.invoke("pct:exportPoi", project, opts),
  uninstallPoi: (folderName) => ipcRenderer.invoke("pct:uninstallPoi", folderName),
  listInstalledPois: () => ipcRenderer.invoke("pct:listInstalledPois"),
  revealInFolder: (targetPath) => ipcRenderer.invoke("pct:revealInFolder", targetPath),
};

contextBridge.exposeInMainWorld("pct", pct);
