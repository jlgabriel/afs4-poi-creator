// ipc.ts — registers one ipcMain handler per PctApi method (design §3.5) and is the app's ONE trust
// boundary: it resolves Electron-owned paths (userData, documents, dialogs), delegates to the pure
// main modules, and maps their typed errors into PctResult envelopes (Fable review P0-1) — because a
// thrown error crossing ipcRenderer.invoke reaches the renderer as a flattened Error with its
// discriminating fields gone. M1e-2a wires detect/scan/settings; project/export/elevation = M1e-2b.
import { app, ipcMain } from "electron";
import { ZodError } from "zod";
import type { Catalog, Settings } from "../core/project/types";
import type { DetectResult, PctError, PctResult } from "../shared/pctApi";
import { NeedsElevationError } from "../core/export/heights";
import { UnsupportedSchemaVersionError } from "../core/project/schemas";
import { detectInstallDirs, detectUserDir } from "./afs4Paths";
import { NoXrefError, readCatalogCache, scanXref, writeCatalogCache } from "./scan";
import { readSettings, writeSettings } from "./settings";

/** Map a typed core/main error to the serialization-safe PctError the renderer can switch on. */
function toPctError(e: unknown): PctError {
  if (e instanceof NoXrefError) return { code: "no-xref", message: e.message, installDir: e.installDir };
  if (e instanceof NeedsElevationError) {
    return { code: "needs-elevation", message: e.message, points: e.points };
  }
  if (e instanceof UnsupportedSchemaVersionError) {
    return { code: "unsupported-schema", message: e.message, found: e.found };
  }
  if (e instanceof ZodError) return { code: "invalid-project", message: e.message };
  return { code: "io", message: e instanceof Error ? e.message : String(e) };
}

/** Run a fallible handler body and wrap its outcome in a PctResult envelope. */
async function guarded<T>(fn: () => T | Promise<T>): Promise<PctResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: toPctError(e) };
  }
}

export function registerIpc(): void {
  const userData = (): string => app.getPath("userData");
  const documents = (): string => app.getPath("documents"); // OneDrive-safe user-dir detection (R5)

  ipcMain.handle(
    "pct:detectPaths",
    (): DetectResult => ({ installDirs: detectInstallDirs(), userDir: detectUserDir(documents()) }),
  );

  ipcMain.handle("pct:scan", (_e, installDir: string, userXrefDir: string | null) =>
    guarded((): Catalog => {
      const { catalog } = scanXref(installDir, userXrefDir);
      writeCatalogCache(userData(), catalog);
      writeSettings(userData(), { lastScanAt: catalog.scannedAt }, documents());
      return catalog;
    }),
  );

  ipcMain.handle("pct:getCachedCatalog", (): Catalog | null => readCatalogCache(userData()));

  ipcMain.handle("pct:getSettings", (): Settings => readSettings(userData(), documents()));

  ipcMain.handle(
    "pct:setSettings",
    (_e, patch: Partial<Settings>): Settings => writeSettings(userData(), patch, documents()),
  );
}
