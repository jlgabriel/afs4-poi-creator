// poiName.ts — POI folder-name coordinate prefix. Port of afs4-pylon-race
// race-app/scenery_export.py (encode_lonlat / poi_dirname).
//
// AFS4 indexes a POI by the coordinates encoded in its folder name, e.g.
// "e01185n4838_munich". The prefix must match how the folder is named, so we replicate
// Python's round() EXACTLY — round-half-to-EVEN (banker's), NOT JS Math.round's
// round-half-up. (Design appendix: lon 11.875 → e01188.)

import type { LonLat } from "../project/types";

/** Python-compatible round-half-to-even, for the non-negative magnitudes used below. */
export function bankersRound(x: number): number {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1; // exactly .5 → nearest even
}

/** AFS4 POI coordinate prefix: e/w + |lon|·100 (5 digits) then n/s + |lat|·100 (4 digits).
 *  E.g. (11.85, 48.376) → "e01185n4838"; (174.73, -36.85) → "e17473s3685". */
export function encodeLonLat(lon: number, lat: number): string {
  const ew = lon >= 0 ? "e" : "w";
  const ns = lat >= 0 ? "n" : "s";
  const lonPart = String(bankersRound(Math.abs(lon) * 100)).padStart(5, "0");
  const latPart = String(bankersRound(Math.abs(lat) * 100)).padStart(4, "0");
  return `${ew}${lonPart}${ns}${latPart}`;
}

/** The scenery/poi/ folder name for a POI: "<coord>_<slug>". */
export function poiFolderName(ref: LonLat, poiName: string): string {
  return `${encodeLonLat(ref.lon, ref.lat)}_${poiName}`;
}

/** Simple average of points — the default POI anchor when the user sets none. */
export function centroid(points: LonLat[]): LonLat {
  if (points.length === 0) return { lon: 0, lat: 0 };
  let lon = 0;
  let lat = 0;
  for (const p of points) {
    lon += p.lon;
    lat += p.lat;
  }
  return { lon: lon / points.length, lat: lat / points.length };
}
