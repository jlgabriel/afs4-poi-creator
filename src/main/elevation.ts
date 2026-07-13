// elevation.ts — main-process terrain-elevation resolution for HeightSpec "terrain"/"terrain-offset"
// (design §3.4 / R1). POI xref heights are absolute metres ASL (matrix V2), so before export every
// terrain-relative object must be turned into an ASL number. The arithmetic lives in the pure core
// (heights.ts `resolveHeight`); this module supplies the terrain elevation under each object by
// querying Open-Meteo — the source the V2 matrix confirmed matches the AFS4 mesh.
//
// Kept Electron-free (fs + fetch are injected/global, dirs passed in) so it unit-tests without a
// running app. Fetch lives in MAIN, not the renderer: it keeps the renderer's CSP `connect-src` at
// 'self' and centralizes batching/caching/provider-swap behind one seam (Fable review P1-6 / P2-9).
//
// Behaviour (Fable P2-9 pins): dedupe to a ~11 m grid, batch ≤100 points/request, ~10 s timeout, a
// descriptive User-Agent, a session+disk cache in userData (so repeat exports work offline). Any
// provider "none" or network/shape failure → throw NeedsElevationError{points}; ipc.ts maps that to
// the `needs-elevation` envelope and the UI asks for a manual base elevation instead.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { LonLat, PlacedObject, ResolvedObject } from "../core/project/types";
import { NeedsElevationError, resolveHeight } from "../core/export/heights";

const GRID_DECIMALS = 4; // 1e-4° ≈ 11 m — the dedupe/cache grid resolution
const BATCH = 100; // Open-Meteo elevation cap per request
const TIMEOUT_MS = 10_000;
const ENDPOINT = "https://api.open-meteo.com/v1/elevation";
const CACHE_FILE = "elevation-cache.json";
const REPO = "https://github.com/jlgabriel/afs4-poi-creator";

export type ElevationProvider = "open-meteo" | "none";

/** A minimal fetch surface — global `fetch` satisfies it, and tests inject a stub. */
export interface ElevResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<ElevResponse>;

export interface ResolveOptions {
  cacheDir?: string; // userData → disk elevation cache; omit to skip persistence (tests)
  fetchImpl?: FetchLike; // defaults to global fetch; injected in tests
  version?: string; // app version, for the User-Agent
}

interface GridPoint {
  lat: number;
  lon: number;
  key: string;
}

/** Snap a coordinate to the dedupe grid and derive its stable cache/lookup key. `|| 0` collapses a
 *  signed zero so "−0.0000" and "0.0000" never split into two grid cells. */
function snapToGrid(p: LonLat): GridPoint {
  const f = 10 ** GRID_DECIMALS;
  const lat = Math.round(p.lat * f) / f || 0;
  const lon = Math.round(p.lon * f) / f || 0;
  return { lat, lon, key: `${lat.toFixed(GRID_DECIMALS)},${lon.toFixed(GRID_DECIMALS)}` };
}

const keyOf = (p: LonLat): string => snapToGrid(p).key;

const cachePath = (dir: string): string => path.join(dir, CACHE_FILE);

/** Load the on-disk grid→elevation cache (userData). Corrupt/absent → an empty map. */
function loadCache(dir?: string): Map<string, number> {
  const m = new Map<string, number>();
  if (!dir || !existsSync(cachePath(dir))) return m;
  try {
    const raw: unknown = JSON.parse(readFileSync(cachePath(dir), "utf8"));
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) m.set(k, v);
      }
    }
  } catch {
    /* corrupt cache → treat as empty */
  }
  return m;
}

/** Persist the merged cache (best-effort — a failed write must not fail the export). */
function saveCache(dir: string | undefined, m: Map<string, number>): void {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(cachePath(dir), JSON.stringify(Object.fromEntries(m)), "utf8");
  } catch {
    /* cache is an optimisation, never load-bearing */
  }
}

/** One batched Open-Meteo call (≤100 points). Rejects on non-OK status, wrong length, or NaN — the
 *  caller turns any rejection into NeedsElevationError. */
async function fetchElevations(
  points: GridPoint[],
  doFetch: FetchLike,
  version?: string,
): Promise<number[]> {
  const latitude = points.map((p) => p.lat.toFixed(GRID_DECIMALS)).join(",");
  const longitude = points.map((p) => p.lon.toFixed(GRID_DECIMALS)).join(",");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(`${ENDPOINT}?latitude=${latitude}&longitude=${longitude}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": `PCT/${version ?? "0.0.0"} (+${REPO})` },
    });
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const data = (await res.json()) as { elevation?: unknown };
    const arr = data.elevation;
    if (!Array.isArray(arr) || arr.length !== points.length) {
      throw new Error("Open-Meteo: unexpected elevation payload");
    }
    const nums = arr.map(Number);
    if (nums.some((n) => !Number.isFinite(n))) throw new Error("Open-Meteo: non-finite elevation");
    return nums;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve every object's height to ASL metres, looking up terrain via `provider`. Objects already
 *  in `asl` mode never touch the network. Throws NeedsElevationError (listing the objects still
 *  needing terrain) when the provider is "none", the network/response fails, or — defensively — any
 *  terrain object is left unresolved, so a lookup miss can never silently become 0 m ASL. */
export async function resolveHeights(
  objects: PlacedObject[],
  provider: ElevationProvider,
  opts: ResolveOptions = {},
): Promise<ResolvedObject[]> {
  const needTerrain = objects.filter((o) => o.height.mode !== "asl");
  const elev = new Map<string, number>();

  if (needTerrain.length > 0) {
    if (provider === "none") throw new NeedsElevationError(needTerrain);

    // Unique grid points across the terrain-relative objects.
    const grid = new Map<string, GridPoint>();
    for (const o of needTerrain) {
      const g = snapToGrid(o.position);
      if (!grid.has(g.key)) grid.set(g.key, g);
    }

    // Reuse cached elevations; fetch only the misses.
    const cache = loadCache(opts.cacheDir);
    const toFetch: GridPoint[] = [];
    for (const g of grid.values()) {
      const hit = cache.get(g.key);
      if (hit !== undefined) elev.set(g.key, hit);
      else toFetch.push(g);
    }

    if (toFetch.length > 0) {
      const doFetch: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i));
      try {
        for (let i = 0; i < toFetch.length; i += BATCH) {
          const batch = toFetch.slice(i, i + BATCH);
          const got = await fetchElevations(batch, doFetch, opts.version);
          batch.forEach((g, j) => {
            elev.set(g.key, got[j]);
            cache.set(g.key, got[j]);
          });
        }
      } catch {
        throw new NeedsElevationError(needTerrain);
      }
      saveCache(opts.cacheDir, cache);
    }
  }

  const missing: PlacedObject[] = [];
  const resolved = objects.map((o): ResolvedObject => {
    const { height, ...rest } = o;
    const terrain = elev.get(keyOf(o.position)) ?? null;
    const h = resolveHeight(height, terrain);
    if (h === null) missing.push(o);
    return { ...rest, heightAsl: h ?? 0 } as ResolvedObject;
  });
  if (missing.length > 0) throw new NeedsElevationError(missing);
  return resolved;
}
