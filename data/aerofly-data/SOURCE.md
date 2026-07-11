# Pinned snapshot — fboes/aerofly-data (AFS4 airports)

Source: **https://github.com/fboes/aerofly-data** (static REST API at https://fboes.github.io/aerofly-data/data/)
Fetched: **2026-07-11** (initial snapshot 2026-07-10; see the Refresh log at the bottom)
License: **MIT** (the dataset) + underlying airport data is **Public Domain** (OurAirports).
Bundling **explicitly OK'd by Frank Boës (@Armitage)** on the Aerofly forum, thread 29210 (#19), 2026-07-09.

Attribution required in-app (Settings → About + `THIRD_PARTY_NOTICES.md`):
> Airport data © fboes/aerofly-data (MIT), derived from OurAirports (Public Domain).

## Files here

| File | What | Bytes | Rows |
|---|---|---|---|
| `airport-coordinates.json` | **The one we use.** Array of `[ICAO, name, lat, lon]` tuples. AFS4's airports (the 7845 with an actual AFS4 scenery file). No elevation. | 507 KB | 7845 |
| `airport-list.json` | Array of core ICAO strings (excludes community/WIP). Used only to FILTER out community airports if a future refresh adds them. | 78 KB | 7845 |

**Tuple order (critical):** `[0]=ICAO, [1]=name, [2]=LAT, [3]=LON`. Map centering needs `{ lon: t[3], lat: t[2] }`.
This is NOT GeoJSON order — the sibling `airports.geojson` uses `[lon, lat, elev]`. Don't mix them up.

## Core vs community (Frank's guidance — stick to core)

- `airport-coordinates.json` is documented as "including community"; `airport-list.json` / `airports.geojson` exclude community.
- **In THIS snapshot the two ICAO sets are identical (7845 == 7845, zero difference)** — no community airports present today, so `airport-coordinates.json` IS the core set as-is.
- Future-proofing: if a background REST refresh ever adds community entries, keep only `coords.filter(t => new Set(airport-list.json).has(t[0]))`. Frank (#19) + Juan (#20) agreed: keep WIP community airports OUT of the picker.

## Not bundled (on purpose)

- `airports.geojson` (4.2 MB) — GeoJSON with elevation in the 3rd coordinate, but Frank says the precision is questionable, and we do NOT need elevation to center the map. Elevation stays a separate track (IPACS DEM via Jan). 8513 features = the 7845 with scenery (`fileSize>0`) + 668 extra `private_airfield`s with no AFS4 scenery.

## Refresh

Re-download from `https://fboes.github.io/aerofly-data/data/<file>` (background-refresh is optional per Frank #19; the offline snapshot is the source of truth).

### Refresh log

- **2026-07-11** — refreshed from upstream (Frank announced a new airport file on the forum). Row counts unchanged (7845 == 7845; core/coords sets still identical). 43 coordinate rows changed: **1 ICAO re-code** `KPBI` → `KDJT` (same position; upstream relabelled Palm Beach Intl as "President Donald J. Trump International Airport", inherited from OurAirports) + **42 in-place corrections** of existing airports (e.g. EDDB Berlin Brandenburg, EDDM Munich no longer pointing at the closed Riem field, several relocated Chinese airports, FAHS corrected from "Non-Existent Airport", plus coord-precision fixes). `airport-list.json` changed only `KPBI` → `KDJT`.
