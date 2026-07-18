// anchorAsset.ts — resolve the directory holding PCT's bundled binary assets: the v0.4 plant anchor
// mesh (pct_anchor.tmb) and its texture (pct_anchor.ttx), which writePoi copies into any POI that has
// plants (see core/export/plantAnchor.ts for the why). Electron-free — env/packaged/paths are injected
// by ipc.ts — so it unit-tests without a running app, mirroring xrefTableSource.ts.

import path from "node:path";

/** The single directory the bundled anchor assets live in, in priority order:
 *   1. PCT_ASSETS_DIR — a dev/local override (point it at build/_poc/ to test before the asset ships).
 *   2. packaged: <resourcesPath>/assets — electron-builder's extraResources copies `assets/` there.
 *   3. dev:      <appPath>/assets       — the repo's `assets/` folder, beside package.json.
 *  writePoi only reads this when the plan actually ships assets (a POI with plants); an xref/light-only
 *  POI never touches it. Returns a path even if nothing exists there yet — the copy is what surfaces a
 *  missing asset, loudly, at export time. */
export function anchorAssetsDir(opts: {
  env: NodeJS.ProcessEnv;
  packaged: boolean;
  resourcesPath: string | undefined;
  appPath: string;
}): string {
  if (opts.env.PCT_ASSETS_DIR) return opts.env.PCT_ASSETS_DIR;
  if (opts.packaged && opts.resourcesPath) return path.join(opts.resourcesPath, "assets");
  return path.join(opts.appPath, "assets");
}
