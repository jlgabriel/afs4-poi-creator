// browseVisibility.ts — which catalog objects appear in the CatalogPanel (its category-tree counts +
// the gallery). A DISPLAY filter only: hidden objects stay in the scanned catalog and its name→object
// index, so anything already placed keeps resolving, exporting and rendering — we only tidy the browse
// list. Pure + React-free so it unit-tests under the node config, like catalogFilter / catalogTree.
//
// Jetways (community request — Michael/ApfelFlieger, forum thread 29210, v0.1.2): the built-in
// "jetways" bundle scans as ~81 objects, but only the 20 horizontal "Jetway Footway" pieces
// (Jetway_footway_1..20) are usable placed on their own. The other ~61 are loose flexible-jetway
// parts — other Jetway_* segments plus the PBridge*/PBrucke* passenger bridges — that only line up
// assembled inside an airport's .tap and are noise in a POI browser, so we hide them. Keyed on the
// footway NAME family (not the curated `act` flag) so a future Jetway_footway_21 DLC piece stays shown.
import type { CatalogObject } from "../../core/project/types";

const JETWAY_FOOTWAY = /^jetway_footway_/i;

export function isBrowsable(o: CatalogObject): boolean {
  if (o.category === "jetways") return JETWAY_FOOTWAY.test(o.name);
  return true;
}
