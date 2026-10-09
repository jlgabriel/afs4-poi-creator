// browseVisibility.ts — which catalog objects appear in the CatalogPanel (its category-tree counts +
// the gallery). A DISPLAY filter only: hidden objects stay in the scanned catalog and its name→object
// index, so anything already placed keeps resolving, exporting and rendering — we only tidy the browse
// list. Pure + React-free so it unit-tests under the node config, like catalogFilter / catalogTree.
//
// Jetways: in the built-in "jetways" category only the horizontal "Jetway Footway" pieces
// (Jetway_footway_*) are usable placed on their own. The rest are loose flexible-jetway parts that only
// line up assembled inside an airport and are noise in a POI browser, so we hide them. Keyed on the
// footway NAME family (not the curated `act` flag) so a future footway piece stays shown.
import type { CatalogObject } from "../../core/project/types";

const JETWAY_FOOTWAY = /^jetway_footway_/i;

export function isBrowsable(o: CatalogObject): boolean {
  if (o.category === "jetways") return JETWAY_FOOTWAY.test(o.name);
  return true;
}
