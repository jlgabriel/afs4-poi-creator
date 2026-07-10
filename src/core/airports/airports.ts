// airports.ts — pure parse + search over the bundled airport list. No DOM, no JSON import (the
// renderer imports the bundled file and feeds the raw value in), so this unit-tests under node.
//
// Tolerant by contract, like catalog/tmiParser: a malformed row is skipped, never throwing — the
// dataset is pinned and verified, but treat it as untrusted (a hand-edited refresh could be broken)
// so one bad row can't blank the whole picker.

import type { Airport } from "./types";

/** Parse the raw `[ICAO, name, lat, lon]` tuple array (fboes/aerofly-data `airport-coordinates.json`)
 *  into validated `Airport`s. Rows failing validation are skipped. Optionally keep only ICAOs present
 *  in `coreIcaos` (the `airport-list.json` set) to exclude community/WIP airports — Frank #19 + Juan
 *  #20 agreed the picker stays core-only. In today's snapshot the two sets are identical, so the
 *  filter is a no-op that future-proofs a refresh that adds community entries. */
export function parseAirportCoordinates(raw: unknown, coreIcaos?: ReadonlySet<string>): Airport[] {
  if (!Array.isArray(raw)) return [];
  const out: Airport[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [icao, name, lat, lon] = row as unknown[];
    if (typeof icao !== "string" || icao === "") continue;
    if (typeof name !== "string") continue;
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) continue;
    if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) continue;
    if (coreIcaos && !coreIcaos.has(icao)) continue;
    out.push({ icao, name, lat, lon });
  }
  return out;
}

/** Rank airports for a typeahead query. Case-insensitive; tiers, highest first:
 *    1. ICAO exact      ("LFPG" → LFPG)
 *    2. ICAO prefix     ("LFP"  → LFPG, LFPO, …)
 *    3. name substring  ("charles" → LFPG)
 *  A blank query returns nothing (the dropdown stays closed). 7845 rows is tiny — a full linear scan
 *  per keystroke is well under a millisecond, so there is no index to keep in sync. */
export function searchAirports(airports: Airport[], query: string, limit = 20): Airport[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const exact: Airport[] = [];
  const prefix: Airport[] = [];
  const nameHit: Airport[] = [];
  for (const a of airports) {
    const icao = a.icao.toLowerCase();
    if (icao === q) exact.push(a);
    else if (icao.startsWith(q)) prefix.push(a);
    else if (a.name.toLowerCase().includes(q)) nameHit.push(a);
  }
  return [...exact, ...prefix, ...nameHit].slice(0, limit);
}
