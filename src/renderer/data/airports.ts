// airports.ts (renderer) — the bundled sim-airport list, parsed once at module load and handed to the
// store as reference data. The pinned snapshot lives OUTSIDE src (data/aerofly-data/, shipped with the
// app) so the pure core never imports it; this renderer module is the single place the raw JSON meets
// the validator. Vite inlines both JSONs into the renderer bundle at build time (~0.5 MB), and the
// dev/preview servers allow the repo-root data/ dir, so it works offline in every mode. See
// data/aerofly-data/SOURCE.md for provenance, license, and the required attribution.
import { parseAirportCoordinates } from "../../core/airports/airports";
import type { Airport } from "../../core/airports/types";
import rawCoordinates from "../../../data/aerofly-data/airport-coordinates.json";
import rawCoreList from "../../../data/aerofly-data/airport-list.json";

// airport-list.json = the core ICAOs (excludes community/WIP). In today's snapshot it equals the
// coordinates set, so filtering is a no-op that future-proofs a manual refresh adding community
// entries — the picker stays core-only (Frank #19 / Juan #20).
const coreIcaos: ReadonlySet<string> = new Set(
  (Array.isArray(rawCoreList) ? rawCoreList : []).filter((x): x is string => typeof x === "string"),
);

/** The sim airports for the TopBar search — validated + core-only, computed once at import. */
export const AIRPORTS: Airport[] = parseAirportCoordinates(rawCoordinates, coreIcaos);
