// xrefTableSource.ts — main-side loader for the optional official `xref_table.csv` overlay.
// "Build-but-disabled" (docs/XREF_TABLE_CSV_DECISION.md): the code path exists but the CSV is NOT
// shipped yet (waits on forum #114 settling packaging/licence). Disabled is expressed as ABSENCE OF THE
// FILE — no feature flag. When no candidate exists, the table is null and buildCatalog falls back to the
// heuristic, i.e. exactly today's behaviour. Electron-free (env + resourcesPath are injected by ipc.ts)
// so it unit-tests without a running app.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseXrefTable, type XrefTable } from "../core/catalog/xrefTable";

export interface XrefTableLoad {
  table: XrefTable | null; // null ⇒ overlay disabled (no candidate found, or an unreadable file)
  path: string | null; // the candidate that was loaded, for logging/provenance
  warnings: string[]; // parser warnings (path-tagged), or a single load-failure warning
}

/** Load the first EXISTING candidate CSV into a parsed table. Absent everywhere → { table: null } and
 *  the overlay stays disabled. Never throws: a read/parse failure degrades to null + a warning, so a
 *  corrupt drop-in can never take the scan down. */
export function loadXrefTable(candidates: Array<string | undefined>): XrefTableLoad {
  for (const p of candidates) {
    if (!p || !existsSync(p)) continue;
    try {
      const table = parseXrefTable(readFileSync(p, "utf8"));
      return { table, path: p, warnings: table.warnings.map((w) => `[${p}] ${w}`) };
    } catch (err) {
      return { table: null, path: null, warnings: [`xref_table load failed (${p}): ${(err as Error).message}`] };
    }
  }
  return { table: null, path: null, warnings: [] };
}

/** Candidate paths in priority order for a running app:
 *   1. PCT_XREF_TABLE — a dev/local override, so the overlay can be verified end-to-end (point it at a
 *      local copy of the official CSV) WITHOUT shipping anything in the repo.
 *   2. <resourcesPath>/xref_table.csv — the packaged location. It does NOT exist until forum #114 adds
 *      the CSV to electron-builder's extraResources; until then this resolves to nothing and the overlay
 *      stays disabled — which is the entire point of build-but-disabled.
 *  env + resourcesPath are injected (ipc.ts passes process.env / process.resourcesPath) to keep this
 *  Electron-free and testable. */
export function defaultXrefTableCandidates(env: NodeJS.ProcessEnv, resourcesPath: string | undefined): string[] {
  const out: string[] = [];
  if (env.PCT_XREF_TABLE) out.push(env.PCT_XREF_TABLE);
  if (resourcesPath) out.push(path.join(resourcesPath, "xref_table.csv"));
  return out;
}
