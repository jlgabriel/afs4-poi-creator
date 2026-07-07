// ipc.ts — registers one ipcMain handler per PctApi method (design §3.5). Handlers stay thin: they
// resolve Electron-owned paths (userData, dialogs) and delegate to the pure main modules, which do
// the real work and are unit-tested on their own. M1e-2a wires detect/scan/settings; the
// project/export/elevation handlers arrive in M1e-2b.
import { app, ipcMain } from "electron";
import type { Catalog, Settings } from "../core/project/types";
import type { DetectResult } from "../shared/pctApi";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";
import { readCatalogCache, scanXref, writeCatalogCache } from "./scan";
import { readSettings, writeSettings } from "./settings";

export function registerIpc(): void {
  const userData = (): string => app.getPath("userData");

  ipcMain.handle(
    "pct:detectPaths",
    (): DetectResult => ({ installDirs: detectInstallDirs(), userDir: detectUserDir() }),
  );

  ipcMain.handle("pct:scan", (_e, installDir: string, userXrefDir: string | null): Catalog => {
    const { catalog } = scanXref(installDir, userXrefDir);
    writeCatalogCache(userData(), catalog);
    writeSettings(userData(), { lastScanAt: catalog.scannedAt });
    return catalog;
  });

  ipcMain.handle("pct:getCachedCatalog", (): Catalog | null => readCatalogCache(userData()));

  ipcMain.handle("pct:getSettings", (): Settings => readSettings(userData()));

  ipcMain.handle(
    "pct:setSettings",
    (_e, patch: Partial<Settings>): Settings => writeSettings(userData(), patch),
  );
}
