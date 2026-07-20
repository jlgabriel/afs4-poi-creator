// gate-autoheight-lights-anchor.ts — v2: does autoheight place airport lights, read in the DARK DESERT.
//
//   npx tsx scripts/gate-autoheight-lights-anchor.ts [--install] [--catalog <catalog.json>] [--out <dir>]
//
// The buried-anchor half of chrispriv #151 is CLOSED (runs 1–3, 2026-07-20: xrefs land on the runway with
// the anchor at -1.0). What remains is #151.2: does `autoheight=true` reach the cultivation's LIGHT lists,
// or does it swallow them the way it swallowed plants? This is the instrument to read that, rebuilt after
// three unreadable flights — each of which failed on the INSTRUMENT, never the question:
//
//   run 1 (day, helipad_beacon)  → nothing: airport lights don't show in daylight (emitters, not day geometry)
//   run 3 (day, helipad_flood)   → nothing: same daylight problem, and I'd chased the fixture, not the hour
//   run 4 (NIGHT, on the runway) → "solo las luces normales de la pista": our two lights drowned in KDAG's
//                                   real edge/centreline lighting. Right hour, wrong SITE.
//
// v2 fixes both remaining instrument faults:
//   • SITE  → 150 m NORTH of the runway, in the open desert. At night the desert is BLACK and has no lights
//             of its own, so anything that glows there is unambiguously ours (the v0.2 lights gate, the one
//             that ever read lights, put them in this same desert and saw "una luz flotando como un ovni").
//   • FIXTURE → back to `helipad_beacon`, a point beacon confirmed visible at night in that v0.2 gate.
//             `helipad_flood_light` was a mistake: a floodlight lights a SURFACE, it is not a bright point.
//
// Why a script and not `npm run export`: the CLI runs resolveHeightsAgl, which REFUSES lights in autoheight
// — that refusal is the thing under test. planExport takes already-resolved objects and has no such guard,
// so building the ResolvedObject[] here bypasses exactly one check. The bytes are what PCT would emit with
// the guard lifted. ⚠️ FLY AT NIGHT/DUSK — airport lights are invisible by day at any group_index.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planExport } from "../src/core/export/planExport";
import { shiftEastNorth } from "../src/core/geo/geo";
import { isSafePoiFolderName } from "../src/core/geo/poiName";
import { anchorAssetsDir } from "../src/main/anchorAsset";
import type { Catalog, LonLat, Project, ResolvedAirportLight, ResolvedObject } from "../src/core/project/types";

// ── The fixture ─────────────────────────────────────────────────────────────────────────────────────
//
// ⚠️ VERBATIM FROM THE SCAN. A name AFS4 can't resolve fails SILENTLY — nothing appears, no error — so a
// typo reads exactly like a failed gate. validateNames checks this against the install before writing.

/** `helipad_beacon`: a POINT beacon, confirmed visible at NIGHT in the v0.2 lights gate (2026-07-12).
 *  No helipad exists near KDAG 08/26, so a helipad beacon out here is unmistakably ours — and unlike a
 *  runway light it can't be read against the airport's own lighting. Run 4's `helipad_flood_light` was
 *  wrong twice over: a floodlight illuminates a surface (no bright point to see), and it sat among the
 *  runway's real lights. If this beacon still doesn't read, `papi_2_light` is the next point source. */
const LIGHT_TYPE = "helipad_beacon";

/** Colour letters (schemas.ts CONFIGURATION_RE `^[bgrwy]{0,2}$`). A SECOND signal on top of position, in
 *  case the beacon honours configuration: control = red, autoheight = green. If the beacon ignores colour,
 *  the two groups are still told apart by where they are (see DESERT_* below), so this can't mislead. */
const CONTROL_COLOUR = "r";
const AUTOHEIGHT_COLOUR = "g";

/** 3 = visible 24 h, so the reading never hinges on the exact minute of dusk. (Still fly at night — even a
 *  24 h light is an emitter that washes out against a bright daytime sky; that is run 1/run 3.) */
const LIGHT_GROUP = 3;

// ── Where: the black desert north of the runway ───────────────────────────────────────────────────────

/** KDAG runway 08/26 centre (OSM way 24019997). The probes are placed relative to this, but NOT on it. */
const RUNWAY_CENTRE: LonLat = { lon: -116.7871683, lat: 34.8514739 };

/** Metres NORTH of the runway centreline for both probes. 150 m clears the runway's 46 m width and its
 *  edge lighting by a wide margin, out onto open desert that carries no lights of its own at night — the
 *  whole reason run 4 was unreadable is gone. Close enough to see from the runway; far enough to be black
 *  behind it. */
const DESERT_NORTH = 150;

/** Metres EAST between the two probes' groups. 80 m keeps the control and the autoheight group clearly
 *  separate — the primary way to tell them apart if the beacon ignores colour. Control sits WEST (left as
 *  you look north), autoheight EAST (right). */
const GROUP_EAST = 80;

/** Ground elevation, metres ASL — MEASURED from run 2's HUD (ALT 2000 ft, GND 70 ft ⇒ 1930 ft = 588 m;
 *  KDAG's published field elevation 1927 ft agrees). Used only by the baked-asl control, whose z is
 *  absolute. If the control comes out buried or sky-high as a whole, this number moved — a finding about
 *  the terrain, not about lights. */
const TERRAIN_ASL = 588;

/** Metres the control beacon floats above the terrain. Airborne ON PURPOSE: a light hanging over black
 *  desert is unmistakable, and it frees the control from depending on TERRAIN_ASL being exact — 20 m of
 *  float reads as "up there" whether the ground is 585 m or 591 m. */
const CONTROL_FLOAT = 20;

/** The two AGL heights the autoheight probe writes: one AT the ground, one well above it. If autoheight
 *  reaches the lights, the sim grounds z=0 onto the desert and lifts z=30 to 30 m — a low light and a high
 *  light, stacked. If it swallows them (the plant failure), z=0 lands at 0 m ASL = 588 m underground and
 *  BOTH vanish. So the autoheight group shows 2 lights or 0 — never a confusing in-between. */
const AH_LOW = 0;
const AH_HIGH = 30;

// ── Probe construction ────────────────────────────────────────────────────────────────────────────────

let uid = 0;
const id = (): string => `gate-${String(++uid).padStart(4, "0")}`;

/** One beacon `east` metres from the runway centre (always DESERT_NORTH north of it), at absolute/AGL z. */
function beacon(east: number, z: number, colour: string): ResolvedAirportLight {
  return {
    id: id(),
    kind: "airport_light",
    typeName: LIGHT_TYPE,
    position: shiftEastNorth(RUNWAY_CENTRE, east, DESERT_NORTH),
    heightAsl: z, // ASL for the baked-asl control; AGL for autoheight (the sim adds the terrain)
    orientation: 0,
    configuration: colour,
    groupIndex: LIGHT_GROUP,
  };
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
    camera: { lon: RUNWAY_CENTRE.lon, lat: RUNWAY_CENTRE.lat, zoom: 15 },
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
    title: "CONTROL — baked-asl beacon, floating (the guarantee)",
    heightMode: "baked-asl",
    anchorZ: null, // baked-asl ships an anchor only for plants; this has none
    lights: [beacon(-GROUP_EAST / 2, TERRAIN_ASL + CONTROL_FLOAT, CONTROL_COLOUR)],
    reads: `1 ${CONTROL_COLOUR === "r" ? "RED" : CONTROL_COLOUR} light, floating ~${CONTROL_FLOAT} m over the desert — the WEST group. Proves the beacon emits and you're looking at the right spot.`,
  },
  {
    poiName: "gate_light_ah",
    title: "AUTOHEIGHT — two beacons, z=0 and z=30 AGL, with the anchor",
    heightMode: "autoheight",
    anchorZ: "-1.0", // the buried anchor confirmed in runs 1–3
    lights: [
      beacon(GROUP_EAST / 2, AH_LOW, AUTOHEIGHT_COLOUR),
      beacon(GROUP_EAST / 2, AH_HIGH, AUTOHEIGHT_COLOUR),
    ],
    reads: `2 ${AUTOHEIGHT_COLOUR === "g" ? "GREEN" : AUTOHEIGHT_COLOUR} lights (one at ground, one ~${AH_HIGH} m up) if autoheight reaches the lights — the EAST group. NONE if it buries them (the plant failure).`,
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

/** Verify LIGHT_TYPE resolves, case-exact, and print the fixture list if not. In the sim a bad name is
 *  SILENT, and a silent probe reads exactly like a failed gate — so this refuses to build on a mismatch. */
function validateFixture(cat: Catalog): { count: number; source: string } {
  const fixtures =
    cat.airportLights.length > 0 ? cat.airportLights.map((l) => l.typeName) : installFixtureNames(cat.installDir);

  if (fixtures.includes(LIGHT_TYPE)) {
    return { count: fixtures.length, source: cat.airportLights.length > 0 ? "catalog" : "install (CLI scan omits lights)" };
  }

  const near = fixtures.filter((f) => f.toLowerCase() === LIGHT_TYPE.toLowerCase());
  const why =
    fixtures.length === 0
      ? `no airport-light fixtures found under ${cat.installDir}`
      : near.length > 0
        ? `LIGHT_TYPE = ${JSON.stringify(LIGHT_TYPE)} — WRONG CASE. The install has ${JSON.stringify(near[0])}.`
        : `LIGHT_TYPE = ${JSON.stringify(LIGHT_TYPE)} is not in the install (${fixtures.length} fixtures).`;

  throw new Error(
    [`Fixture doesn't match the scan:`, `  • ${why}`, ``, `  Airport-light fixtures found:`, ...fixtures.map((f) => `    ${f}`)].join("\n"),
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
    fixture = validateFixture(cat);
  } catch (e) {
    console.error(`\nERROR: ${(e as Error).message}\n`);
    return 1;
  }

  const site = shiftEastNorth(RUNWAY_CENTRE, 0, DESERT_NORTH);
  console.log(`Catalog: ${catalogFile}`);
  console.log(`  ${fixture.count} airport-light fixtures, from the ${fixture.source}; ${LIGHT_TYPE} verified case-exact\n`);
  console.log(`Site: KDAG desert, ${DESERT_NORTH} m NORTH of the runway centre → ${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}`);
  console.log(`⚠️  FLY AT NIGHT/DUSK. Look NORTH from the runway toward the black desert.\n`);

  const assetsDir = anchorAssetsDir({ env: process.env, packaged: false, resourcesPath: undefined, appPath: process.cwd() });

  // Sweep EVERY previous probe folder first (runs 1–4 put `_gate_a..d_` on the runway; this run writes
  // `_gate_light_*`). A folder name encodes its coordinates, so a moved probe is orphaned rather than
  // replaced — fly two generations at once and the gate's whole point is gone. This already cost a flight.
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
    console.log(`  lights : ${probe.lights.length} × ${LIGHT_TYPE}`);
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
      ? `Restart Aerofly FS 4, start at KDAG (26 or 08), and look NORTH — AT NIGHT.\n` +
          `  WEST group  = 1 light floating (the control). If you don't see even this, the fixture/site is still wrong.\n` +
          `  EAST group  = 2 lights (low + high) ⇒ autoheight places lights; 0 lights ⇒ it buries them (finding).`
      : `Built in ${outRoot}. Re-run with --install to install into AFS4.`,
  );
  return 0;
}

process.exit(main());
