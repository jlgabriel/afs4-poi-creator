// bundleSummary.ts — pure "N objects in M bundles" line for the wizard's result step (design §5).
// React-free so it unit-tests under the node config.
import type { Catalog } from "../../core/project/types";

export function bundleSummary(catalog: Catalog): string {
  const o = catalog.xref.length;
  const b = catalog.bundles.length;
  return `${o} object${o === 1 ? "" : "s"} in ${b} bundle${b === 1 ? "" : "s"}`;
}
