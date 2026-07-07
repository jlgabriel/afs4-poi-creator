import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HeightSpec, LonLat, PlacedXref } from "../../src/core/project/types";
import { NeedsElevationError } from "../../src/core/export/heights";
import { resolveHeights, type FetchLike } from "../../src/main/elevation";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-elev-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

let n = 0;
const obj = (height: HeightSpec, position: LonLat): PlacedXref => ({
  id: `o${n++}`,
  kind: "xref",
  name: "n",
  position,
  height,
  direction: 0,
  scale: 1,
});

interface Call {
  lats: number[];
  lons: number[];
}
/** A fetch stub that records each request and answers with `elevation(lat,lon)` per point (or fails). */
function makeFetch(opts: { elevation?: (lat: number, lon: number) => number; fail?: boolean } = {}) {
  const calls: Call[] = [];
  const impl: FetchLike = async (url) => {
    const u = new URL(url);
    const lats = (u.searchParams.get("latitude") ?? "").split(",").filter(Boolean).map(Number);
    const lons = (u.searchParams.get("longitude") ?? "").split(",").filter(Boolean).map(Number);
    calls.push({ lats, lons });
    if (opts.fail) return { ok: false, status: 500, json: async () => ({}) };
    const elevation = lats.map((la, i) => (opts.elevation ?? (() => 100))(la, lons[i]));
    return { ok: true, status: 200, json: async () => ({ elevation }) };
  };
  return { impl, calls };
}

describe("resolveHeights — asl fast path", () => {
  it("resolves asl objects with no network, even provider 'none'", async () => {
    const { impl, calls } = makeFetch();
    const out = await resolveHeights(
      [obj({ mode: "asl", value: 321 }, { lon: 11.85, lat: 48 })],
      "none",
      { fetchImpl: impl },
    );
    expect(out.map((o) => o.heightAsl)).toEqual([321]);
    expect("height" in out[0]).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("resolveHeights — provider 'none' with terrain objects", () => {
  it("throws NeedsElevationError listing the terrain-relative objects", async () => {
    const objs = [
      obj({ mode: "terrain" }, { lon: 11.85, lat: 48 }),
      obj({ mode: "asl", value: 5 }, { lon: 11.86, lat: 48 }),
    ];
    const err = await resolveHeights(objs, "none").catch((e) => e);
    expect(err).toBeInstanceOf(NeedsElevationError);
    expect((err as NeedsElevationError).points).toHaveLength(1);
  });
});

describe("resolveHeights — open-meteo lookup", () => {
  it("resolves terrain + terrain-offset against the fetched elevation, order preserved", async () => {
    const { impl } = makeFetch({ elevation: () => 500 });
    const out = await resolveHeights(
      [
        obj({ mode: "terrain" }, { lon: 11.85, lat: 48 }),
        obj({ mode: "asl", value: 42 }, { lon: 11.86, lat: 48 }),
        obj({ mode: "terrain-offset", offset: 5 }, { lon: 11.87, lat: 48 }),
      ],
      "open-meteo",
      { fetchImpl: impl },
    );
    expect(out.map((o) => o.heightAsl)).toEqual([500, 42, 505]);
  });

  it("dedupes coordinates onto the ~11 m grid (one fetched point for near-identical positions)", async () => {
    const { impl, calls } = makeFetch({ elevation: () => 300 });
    await resolveHeights(
      [
        obj({ mode: "terrain" }, { lon: 11.85001, lat: 48 }),
        obj({ mode: "terrain" }, { lon: 11.85004, lat: 48 }), // same 4-dp cell as above
      ],
      "open-meteo",
      { fetchImpl: impl },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].lats).toHaveLength(1);
  });

  it("batches unique points in groups of ≤100", async () => {
    const { impl, calls } = makeFetch({ elevation: () => 200 });
    const objs = Array.from({ length: 150 }, (_, i) =>
      obj({ mode: "terrain" }, { lon: 10 + i * 0.01, lat: 48 }),
    );
    const out = await resolveHeights(objs, "open-meteo", { fetchImpl: impl });
    expect(out).toHaveLength(150);
    expect(calls.map((c) => c.lats.length)).toEqual([100, 50]);
  });

  it("a failed request → NeedsElevationError (feeds the manual-base fallback)", async () => {
    const { impl } = makeFetch({ fail: true });
    const err = await resolveHeights(
      [obj({ mode: "terrain" }, { lon: 11.85, lat: 48 })],
      "open-meteo",
      { fetchImpl: impl },
    ).catch((e) => e);
    expect(err).toBeInstanceOf(NeedsElevationError);
  });
});

describe("resolveHeights — disk cache", () => {
  it("serves a repeat lookup from the userData cache without re-fetching (offline-safe)", async () => {
    const objs = [obj({ mode: "terrain" }, { lon: 11.85, lat: 48 })];
    const first = makeFetch({ elevation: () => 617 });
    const out1 = await resolveHeights(objs, "open-meteo", { fetchImpl: first.impl, cacheDir: tmp });
    expect(out1[0].heightAsl).toBe(617);
    expect(first.calls).toHaveLength(1);

    // Second run with a stub that would FAIL if called — must be answered entirely from disk cache.
    const second = makeFetch({ fail: true });
    const out2 = await resolveHeights(objs, "open-meteo", { fetchImpl: second.impl, cacheDir: tmp });
    expect(out2[0].heightAsl).toBe(617);
    expect(second.calls).toHaveLength(0);
  });
});
