// gate-autoheight-lights-anchor.ts — v3: does autoheight place airport lights, read with a FAN of the
// runway fixtures Juan can actually see at night.
//
//   npx tsx scripts/gate-autoheight-lights-anchor.ts [--install] [--catalog <catalog.json>] [--out <dir>]
//
// The buried-anchor half of chrispriv #151 is CLOSED (runs 1–3, 2026-07-20: xrefs land on the runway with
// the anchor at -1.0). What remains is #151.2: does `autoheight=true` reach the cultivation's LIGHT lists,
// or does it swallow them the way it swallowed plants? Five flights failed to read that, EVERY ONE on the
// instrument, never the question:
//
//   run 1 (day,   helipad_beacon) → nothing: airport lights are invisible in daylight
//   run 3 (day,   helipad_flood)  → nothing: same daylight problem, and I'd chased the fixture not the hour
//   run 4 (NIGHT, on the runway)  → "solo las luces de la pista": ours drowned in KDAG's real lighting
//   run 5 (NIGHT, dark desert)    → "ninguna luz aparte de las del aeropuerto": clean load, big circuits
//                                    flown, still nothing — so the helipad fixture itself is MUTE.
//
// The fix comes from what Juan reported at run 5: the runway's own lights "se ven tenues pero bien". Those
// are RUNWAY fixtures from this same library — empirically visible. I avoided them for fear of confusing
// them with the airport's lighting and picked a helipad beacon instead; but out in the desert there is no
// runway to confuse them with, so that fear cost four flights. v3 uses a FAN of the runway fixtures Juan
// sees, in the dark desert where nothing competes:
//
//   CONTROL (baked-asl)  the fan floating +20 m  → the guarantee: these are known to draw, so if the
//                        control is dark the site/night is wrong, not autoheight
//   AUTOHEIGHT           the same fan at z=0 AGL, with the -1.0 anchor
//     fan visible at ground  ⇒ autoheight places lights  → lift the guard
//     nothing               ⇒ it buries them (the plant failure) → the finding for Michael
//
// Why a script and not `npm run export`: the CLI runs resolveHeightsAgl, which REFUSES lights in
// autoheight — that refusal is the thing under test. planExport takes already-resolved objects and has no
// such guard. ⚠️ FLY AT NIGHT/DUSK — airport lights are invisible by day at any group_index.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planExport } from "../src/core/export/planExport";
import { shiftEastNorth } from "../src/core/geo/geo";
import { isSafePoiFolderName } from "../src/core/geo/poiName";
import { anchorAssetsDir } from "../src/main/anchorAsset";
import type { Catalog, LonLat, Project, ResolvedAirportLight, ResolvedObject } from "../src/core/project/types";

// ── The fixtures ────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ VERBATIM FROM THE SCAN. A name AFS4 can't resolve fails SILENTLY — nothing appears, no error — so a
// typo reads exactly like a failed gate. validateFixtures checks these against the install before writing.

/** A FAN of RUNWAY fixtures — the ones Juan confirms he sees on KDAG's real runway at night ("las de la
 *  pista se ven tenues pero bien"). That is the whole point after five blind flights: stop guessing a
 *  fixture and use the ones EMPIRICALLY known to draw.
 *
 *  Runs 1/3/4/5 flew `helipad_beacon` / `helipad_flood_light` and saw NOTHING even at night on a clean
 *  load — helipad fixtures are mute (a beacon needs its pad context; a floodlight lights a surface, it is
 *  not a point). I avoided the runway fixtures for fear they'd be confused with the airport's own lighting
 *  — but in the DESERT there is no runway to confuse them with, so that fear cost four flights. A fan, not
 *  one: if any single type is mute, the others still answer. Empty configuration = each fixture's own
 *  colour; never force a colour a runway light may reject. */
const LIGHT_TYPES = ["runway_edge_light", "papi_3_light", "runway_end_light"] as const;

/** 3 = visible 24 h, so the reading never hinges on the exact minute of dusk. (Still fly at night — even a
 *  24 h light is an emitter that washes out against a bright daytime sky; that is run 1/run 3.) */
const LIGHT_GROUP = 3;

// ── Where: the black desert beside the runway-26 threshold, where Juan spawns ──────────────────────────

/** KDAG runway 26 threshold — where the sim drops Juan in (tm.log menu_location, every run). Anchoring the
 *  probes here, not at the distant runway centre, puts them in view the moment he looks around — run 2's
 *  probes sat ~960 m away at mid-runway, a needless handicap even though run 5 proved distance wasn't the
 *  failure. */
const SPAWN_26: LonLat = { lon: -116.776615, lat: 34.851474 };

/** Metres NORTH of the threshold for both groups: out onto open desert that carries no lights of its own
 *  at night, clear of the runway's real edge/end/PAPI lights so nothing competes with or masks ours. */
const DESERT_NORTH = 200;

/** Metres EAST between the two groups. 120 m keeps the control and the autoheight fan clearly apart — the
 *  way to tell them apart at a glance. Control sits WEST (left as you look north), autoheight EAST. */
const GROUP_EAST = 120;

/** Metres between fixtures within one fan (3 lights in a short row, so a mute type shows as one dark slot
 *  between two lit ones rather than an ambiguous absence). */
const FIXTURE_EAST = 20;

/** Ground elevation, metres ASL — MEASURED from run 2's HUD (ALT 2000 ft, GND 70 ft ⇒ 1930 ft = 588 m;
 *  KDAG's published field elevation 1927 ft agrees). Used only by the baked-asl control, whose z is
 *  absolute. */
const TERRAIN_ASL = 588;

/** Metres the control fan floats above the terrain. Airborne ON PURPOSE: lights hanging over black desert
 *  are unmistakably ours (the runway's real ones are on the ground), and 20 m of float frees the control
 *  from TERRAIN_ASL being exact. The autoheight fan needs no margin — its z is AGL, the sim adds the
 *  ground, which is the mode under test. */
const CONTROL_FLOAT = 20;

// ── Probe construction ────────────────────────────────────────────────────────────────────────────────

let uid = 0;
const id = (): string => `gate-${String(++uid).padStart(4, "0")}`;

/** One airport light `east` metres from the threshold (always DESERT_NORTH north of it), at absolute/AGL z.
 *  Empty configuration ⇒ the fixture's own default colour. */
function light(typeName: string, east: number, z: number): ResolvedAirportLight {
  return {
    id: id(),
    kind: "airport_light",
    typeName,
    position: shiftEastNorth(SPAWN_26, east, DESERT_NORTH),
    heightAsl: z, // ASL for the baked-asl control; AGL for autoheight (the sim adds the terrain)
    orientation: 0,
    configuration: "",
    groupIndex: LIGHT_GROUP,
  };
}

/** The fan: one of each LIGHT_TYPE in a short east–west row centred on `eastCentre`, all at height `z`. */
function fan(eastCentre: number, z: number): ResolvedAirportLight[] {
  const mid = (LIGHT_TYPES.length - 1) / 2;
  return LIGHT_TYPES.map((t, i) => light(t, eastCentre + (i - mid) * FIXTURE_EAST, z));
}

function project(poiName: string, name: string, heightMode: Project["heightMode"]): Project {
  const now = "2026-07-20T00:00:00.000Z";
  return {
    schemaVersion: 1,
    app: "pct",
    name,
    poiName,
    createdAt: now,
    modifiedAt: now,
    reference: null, // centroid of the probe's own lights
    camera: { lon: SPAWN_26.lon, lat: SPAWN_26.lat, zoom: 15 },
    objects: [], // unused: planExport reads the RESOLVED array; carried only for the folder name
    heightMode,
  };
}

/** Force the anchor's AGL z in a generated autoheight `.tsl` to the production value. Throws unless it
 *  matched exactly once — the .tsl carries the anchor and nothing else, so a different count means the
 *  format moved and this rewrite is no longer safe. */
function setAnchorZ(tsl: string, z: string): string {
  const re = /(<\[vector3_float64\]\[position\]\[-?[\d.]+ -?[\d.]+ )(-?[\d.]+)(\]>)/g;
  const hits = [...tsl.matchAll(re)];
  if (hits.length !== 1) {
    throw new Error(
      `setAnchorZ: expected exactly 1 anchor position in the .tsl, found ${hits.length}. ` +
        `The .tsl format changed — re-read tslWriter.anchorObjects before trusting this probe.`,
    );
  }
  return tsl.replace(re, `$1${z}$3`);
}

// ── The two probes ──────────────────────────────────────────────────────────────────────────────────

interface LightProbe {
  poiName: string;
  title: string;
  heightMode: Project["heightMode"];
  /** AGL z forced into the .tsl anchor, or null for a baked-asl probe that carries no anchor. */
  anchorZ: string | null;
  lights: ResolvedAirportLight[];
  reads: string;
}

const PROBES: LightProbe[] = [
  {
    poiName: "gate_light_ctrl",
    title: "CONTROL — baked-asl, the runway fan floating +20 m (the guarantee)",
    heightMode: "baked-asl",
    anchorZ: null, // baked-asl ships an anchor only for plants; this has none
    lights: fan(-GROUP_EAST / 2, TERRAIN_ASL + CONTROL_FLOAT),
    reads: `${LIGHT_TYPES.length} lights floating ~${CONTROL_FLOAT} m over the desert — the WEST group. These are runway fixtures, known to draw; if this group is dark the night/site is wrong, not autoheight.`,
  },
  {
    poiName: "gate_light_ah",
    title: "AUTOHEIGHT — the same fan at z=0 AGL, with the anchor",
    heightMode: "autoheight",
    anchorZ: "-1.0", // the buried anchor confirmed in runs 1–3
    lights: fan(GROUP_EAST / 2, 0),
    reads: `${LIGHT_TYPES.length} lights AT GROUND — the EAST group. Same as the control ⇒ autoheight places lights; NOTHING ⇒ it buries them (the plant failure).`,
  },
];

// ── Catalog validation ────────────────────────────────────────────────────────────────────────────────

function loadCatalog(file: string): Catalog {
  if (!existsSync(file)) {
    throw new Error(
      `Catalog not found: ${file}\n  Generate one first:\n` +
        `  npm run scan -- --install "<AFS4 install dir>" --out "${file}"`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as Catalog;
}

/** The install's airport-light fixture names, derived exactly as core/catalog/airportLights.ts does: the
 *  `.tmb` basename minus `al_`, dropping the `*_model` helpers. Reads DIRECTORY ENTRIES ONLY — no `.tmb`
 *  is ever opened (it is opaque IPACS binary). The CLI scan omits lights, so a CLI catalog has none. */
function installFixtureNames(installDir: string): string[] {
  const dir = path.join(installDir, "airport_lights");
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && e.name.endsWith(".tmb")) {
        const base = path.basename(e.name, ".tmb");
        if (base.endsWith("_model")) continue;
        names.push(base.startsWith("al_") ? base.slice(3) : base);
      }
    }
  };
  walk(dir);
  return names;
}

/** Verify every LIGHT_TYPE resolves, case-exact, and print the fixture list if any doesn't. In the sim a
 *  bad name is SILENT, and a silent probe reads exactly like a failed gate — so refuse to build on a miss. */
function validateFixtures(cat: Catalog): { count: number; source: string } {
  const fixtures =
    cat.airportLights.length > 0 ? cat.airportLights.map((l) => l.typeName) : installFixtureNames(cat.installDir);

  const missing = LIGHT_TYPES.filter((t) => !fixtures.includes(t));
  if (missing.length === 0) {
    return { count: fixtures.length, source: cat.airportLights.length > 0 ? "catalog" : "install (CLI scan omits lights)" };
  }

  const detail = missing.map((t) => {
    const near = fixtures.filter((f) => f.toLowerCase() === t.toLowerCase());
    return near.length > 0 ? `${JSON.stringify(t)} — WRONG CASE, install has ${JSON.stringify(near[0])}` : `${JSON.stringify(t)} not in the install`;
  });

  throw new Error(
    [`Fixture(s) don't match the scan:`, ...detail.map((d) => `  • ${d}`), ``, `  Airport-light fixtures found:`, ...fixtures.map((f) => `    ${f}`)].join("\n"),
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────────────

function afs4UserDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Aerofly FS 4");
  if (process.platform === "win32") return path.join(home, "Documents", "Aerofly FS 4");
  return path.join(home, "Aerofly FS 4");
}

function main(): number {
  const argv = process.argv.slice(2);
  const install = argv.includes("--install");
  const argOf = (flag: string, dflt: string): string => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const catalogFile = path.resolve(argOf("--catalog", "catalog.json"));
  const outRoot = path.resolve(argOf("--out", path.join("build", "gate")));

  let cat: Catalog;
  let fixture: { count: number; source: string };
  try {
    cat = loadCatalog(catalogFile);
    fixture = validateFixtures(cat);
  } catch (e) {
    console.error(`\nERROR: ${(e as Error).message}\n`);
    return 1;
  }

  const site = shiftEastNorth(SPAWN_26, 0, DESERT_NORTH);
  console.log(`Catalog: ${catalogFile}`);
  console.log(`  ${fixture.count} airport-light fixtures, from the ${fixture.source}`);
  console.log(`  fan verified case-exact: ${LIGHT_TYPES.join(", ")}\n`);
  console.log(`Site: KDAG desert, ${DESERT_NORTH} m NORTH of the runway-26 threshold → ${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}`);
  console.log(`⚠️  FLY AT NIGHT/DUSK. Look NORTH from the 26 threshold toward the black desert.\n`);

  const assetsDir = anchorAssetsDir({ env: process.env, packaged: false, resourcesPath: undefined, appPath: process.cwd() });

  // Sweep EVERY previous probe folder first. A folder name encodes its coordinates, so a moved probe is
  // orphaned rather than replaced — fly two generations at once and the gate's whole point is gone.
  if (install) {
    const poiRoot = path.join(afs4UserDir(), "scenery", "poi");
    if (existsSync(poiRoot)) {
      const stale = readdirSync(poiRoot).filter((n) => /_gate_/.test(n));
      for (const n of stale) rmSync(path.join(poiRoot, n), { recursive: true, force: true });
      if (stale.length > 0) console.log(`Removed ${stale.length} probe folder(s) from previous runs\n`);
    }
  }

  for (const probe of PROBES) {
    const resolved: ResolvedObject[] = probe.lights;
    const plan = planExport(project(probe.poiName, probe.title, probe.heightMode), resolved);

    if (!isSafePoiFolderName(plan.folderName)) {
      console.error(`ERROR: unsafe POI folder name "${plan.folderName}"`);
      return 1;
    }

    const files = plan.files.map((f) =>
      f.relPath.endsWith(".tsl") && probe.anchorZ !== null ? { ...f, content: setAnchorZ(f.content, probe.anchorZ) } : f,
    );

    const outDir = path.join(outRoot, plan.folderName);
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(path.join(outDir, f.relPath), f.content, "utf8"); // LF, like AFS4
    for (const name of plan.assets) copyFileSync(path.join(assetsDir, name), path.join(outDir, name));

    const anchorLine =
      files
        .find((f) => f.relPath.endsWith(".tsl"))!
        .content.split("\n")
        .find((l) => l.includes("vector3_float64"))
        ?.trim() ?? "none (baked-asl, no anchor)";

    console.log(`${probe.title}`);
    console.log(`  mode   : ${probe.heightMode}`);
    console.log(`  folder : ${plan.folderName}`);
    console.log(`  lights : ${probe.lights.map((l) => l.typeName).join(", ")}`);
    console.log(`  anchor : ${anchorLine}`);
    console.log(`  expect : ${probe.reads}`);
    for (const w of plan.warnings) console.log(`  WARNING: ${w}`);

    if (install) {
      const poiRoot = path.join(afs4UserDir(), "scenery", "poi");
      if (!existsSync(path.dirname(poiRoot))) {
        console.error(`\nERROR: AFS4 user folder not found at ${afs4UserDir()}`);
        return 1;
      }
      const dest = path.join(poiRoot, plan.folderName);
      mkdirSync(poiRoot, { recursive: true });
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      cpSync(outDir, dest, { recursive: true });
      console.log(`  installed: ${dest}`);
    }
    console.log();
  }

  console.log(
    install
      ? `Restart Aerofly FS 4, start at KDAG 26, and look NORTH — AT NIGHT.\n` +
          `  WEST group = the fan floating ~${CONTROL_FLOAT} m (control). Dark here ⇒ site/night wrong, not autoheight.\n` +
          `  EAST group = the same fan at ground ⇒ autoheight places lights; nothing ⇒ it buries them (finding).`
      : `Built in ${outRoot}. Re-run with --install to install into AFS4.`,
  );
  return 0;
}

process.exit(main());
