// gate-autoheight-lights-anchor.ts — build the three probe POIs for docs/GATE_AUTOHEIGHT_LIGHTS_ANCHOR.md.
//
//   npx tsx scripts/gate-autoheight-lights-anchor.ts [--install] [--catalog <catalog.json>] [--out <dir>]
//
// Two questions, three probes, one flight (see the sheet for the reasoning and how to read the result):
//
//   A — lights, anchor at 0.1 (the value flown 2026-07-19)   → isolates LIGHTS
//   B — no lights, anchor buried at -1.0                     → isolates the BURIED ANCHOR
//   C — lights + buried anchor                               → what production would ship
//
// Why this script exists rather than `npm run export`: the CLI runs resolveHeightsAgl, which REFUSES
// lights in autoheight — that refusal is the thing under test. planExport itself takes already-resolved
// objects and has no such guard, so building the ResolvedObject[] here bypasses exactly one check and
// nothing else. The emitted bytes are what PCT would emit with the guard lifted.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planExport } from "../src/core/export/planExport";
import { shiftEastNorth } from "../src/core/geo/geo";
import { isSafePoiFolderName } from "../src/core/geo/poiName";
import { anchorAssetsDir } from "../src/main/anchorAsset";
import type {
  Catalog,
  LonLat,
  Project,
  ResolvedAirportLight,
  ResolvedObject,
  ResolvedXref,
} from "../src/core/project/types";

// ── What the probes are made of ───────────────────────────────────────────────────────────────────
//
// ⚠️ VERBATIM FROM THE SCAN. A name AFS4 can't resolve fails SILENTLY — nothing appears, no error — and
// the case is real (`mobile_LightTower`). These are checked against the scanned catalog before anything
// is written, and the failure prints candidates; never "fix" a mismatch by editing from memory.

/** Tall and thin: the vertical ruler the +30 m light is read against. Chosen because its top sits
 *  almost exactly at LIGHT_AGL, so the light reads as a LEVEL MATCH with the tip rather than an
 *  estimated proportion. The actual height is read from the scanned catalog at build time and
 *  printed — never hardcoded here, both because scanned dimensions are IPACS-derived data that
 *  stays out of the repo, and because a number baked into a comment silently goes stale. */
const TALL_XREF = "powerline_30m";
/** Low and compact, unmistakable beside the tall one: a shipping container, base at the origin. A
 *  horizontal box next to a vertical needle — no chance of mistaking one for the other at a glance.
 *  ⚠️ LOWERCASE. `Container_Blue` / `_Red` / `_Yellow` / `_White` are DIFFERENT objects, roughly half
 *  the height. The case IS the object here — see validateNames, which catches exactly this. */
const LOW_XREF = "container";
/** The airport-light fixture (CatalogAirportLight.typeName, no "al_" prefix).
 *
 *  NOT a runway light. The probes sit on runway 08/26, which HAS real edge and centreline lighting —
 *  a `runway_edge_light` of ours would be read against KDAG's own, and "is that mine or the airport's?"
 *  is not a question a gate should have to answer. No helipad on 08/26 ⇒ a helipad fixture there is ours.
 *
 *  ⚠️ Run 1 (2026-07-20) used `helipad_beacon` and saw NOTHING — an unreadable result, not a negative
 *  one. Its `.tmb` is 3304 B, among the smallest in the library: essentially a bare light point, and
 *  invisible in daylight. "No light" then means either "not placed" (the finding) or "placed but not
 *  drawable" (nothing at all), which is exactly the ambiguity PROBE D now removes. This fixture is
 *  ~2.2× the mesh and still cannot be confused with anything on a runway; `papi_3_light` (13072 B) is
 *  the next step up, at the cost of resembling real threshold PAPIs. */
const LIGHT_TYPE = "helipad_flood_light";
/** Colour letters, 0–2 of [bgrwy]; "" = the fixture's own default. Independent of type_name — any
 *  fixture takes any valid configuration (schemas.ts CONFIGURATION_RE). */
const LIGHT_CONFIG = "w";
/** Night-visibility group. 3 = visible 24 h — so "I see nothing" can't mean "wrong time of day".
 *  The default is 0 (night only), which would make the gate's central negative reading ambiguous. */
const LIGHT_GROUP = 3;

// ── Where ─────────────────────────────────────────────────────────────────────────────────────────

/** KDAG runway 08/26 centre, ON the asphalt: OSM way 24019997 (surface=asphalt, 1951 × 46 m, 90° true).
 *  NOT the airport's dataset coordinate (34.85369873, -116.7870026) — that is the administrative
 *  reference point, 247 m NORTH of the runway on open dirt. Terrain here is ~584 m ASL, which is the
 *  point: at sea level AGL and ASL coincide and the gate would read the same either way. */
const RUNWAY_CENTRE: LonLat = { lon: -116.7871683, lat: 34.8514739 };

/** Metres east of the runway centre for each probe. ~440 m apart, all inside the runway's ±968 m, so
 *  every probe sits on asphalt and no two can be mistaken for each other. Taking off from 26 (east
 *  threshold, heading 270) they pass in the order C, B, A, D — so the baked-asl control D is seen LAST,
 *  furthest and highest. That is deliberate: the control flies at a visibility DISADVANTAGE, so if D
 *  shows its lights and C doesn't, the difference cannot be explained by viewing conditions. */
const PROBE_EAST = { A: -440, B: 0, C: 440, D: -880 };

/** Ground elevation at KDAG, metres ASL — needed only by the baked-asl control, whose heights are
 *  absolute rather than AGL. Not a guess: the 2026-07-12 lights gate flew a height-614 probe here and
 *  it floated +30 m over 584 m terrain, which is the same fixture-at-+30 m reading this probe repeats.
 *  If D comes out buried or floating as a whole, this number moved — that is a finding about the
 *  terrain, not about lights. */
const TERRAIN_ASL = 584;

/** Metres between objects within a probe, laid out ACROSS the runway (north–south).
 *
 *  ACROSS, not along: the KDAG spawn is the 08/26 threshold, so the flight path runs down the runway
 *  and a line of probes ALONG it foreshortens into one another — the same way that nearly cost the N2
 *  plant gate its reading. Perpendicular, all four are separate in one pass and none hides another.
 *  15 m puts the outermost pair at ±22.5 m, inside the runway's 46 m width, so every probe stays on
 *  asphalt while still being close enough to compare heights without parallax. */
const SPACING = 15;

/** The AGL height of the raised light — the probe's positive signal. Read against TALL_XREF's tip. */
const LIGHT_AGL = 30;

// ── Probe construction ────────────────────────────────────────────────────────────────────────────

const at = (east: number, north: number): LonLat => shiftEastNorth(RUNWAY_CENTRE, east, north);

/** Lane 0..3 → metres north of the runway centreline: -22.5, -7.5, +7.5, +22.5. */
const lane = (i: number): number => (i - 1.5) * SPACING;

let uid = 0;
const id = (): string => `gate-${String(++uid).padStart(4, "0")}`;

function xref(name: string, east: number, laneIdx: number, aglZ: number): ResolvedXref {
  return {
    id: id(),
    kind: "xref",
    name,
    position: at(east, lane(laneIdx)),
    heightAsl: aglZ,
    direction: 0,
    scale: 1,
  };
}

function light(east: number, laneIdx: number, aglZ: number): ResolvedAirportLight {
  return {
    id: id(),
    kind: "airport_light",
    typeName: LIGHT_TYPE,
    position: at(east, lane(laneIdx)),
    heightAsl: aglZ,
    orientation: 0,
    configuration: LIGHT_CONFIG,
    groupIndex: LIGHT_GROUP,
  };
}

/** The four-object line: tall xref at ground, a light beside it at +30 m, a low xref at ground, a light
 *  beside THAT at ground. Every reading is a comparison with an adjacent object, never a judgement of
 *  absolute height. `withLights: false` drops the two lights (probe B). */
function probeObjects(east: number, withLights: boolean, base = 0): ResolvedObject[] {
  // Lanes across the runway, south to north. The xrefs keep lanes 0 and 2 whether or not the lights
  // are present, so probe B (no lights) frames identically to A and C.
  //
  // `base` is what makes the same four objects serve both modes: 0 for autoheight (the z IS the AGL
  // height, the sim adds the terrain) and TERRAIN_ASL for the baked-asl control (the z is absolute).
  // Identical geometry either way, so D and C differ in ONE thing — the height mode.
  const objects: ResolvedObject[] = [xref(TALL_XREF, east, 0, base)];
  if (withLights) objects.push(light(east, 1, base + LIGHT_AGL));
  objects.push(xref(LOW_XREF, east, 2, base));
  if (withLights) objects.push(light(east, 3, base));
  return objects;
}

/** What the raised light should look like against the ruler, computed from the scan rather than
 *  asserted. `bbMax[2]` is metres ABOVE the placement point — the visible top — which is not `size.z`
 *  whenever a model extends below its origin. Warns if the two are far enough apart that "level with
 *  the tip" stops being the right thing to look for. */
function rulerReading(cat: Catalog): string {
  const ruler = cat.xref.find((o) => o.name === TALL_XREF);
  if (!ruler) return `${TALL_XREF}: not in the catalog (validated separately)`;
  const top = ruler.bbMax[2];
  const delta = LIGHT_AGL - top;
  const how =
    Math.abs(delta) <= 1
      ? `level with its tip (${delta >= 0 ? "+" : ""}${delta.toFixed(2)} m) — read it as a match`
      : `${Math.abs(delta).toFixed(2)} m ${delta > 0 ? "ABOVE" : "BELOW"} its tip — NOT a level match, ` +
        `read the gap instead, or pick a ruler nearer ${LIGHT_AGL} m`;
  return `${TALL_XREF} top ${top.toFixed(2)} m AGL; the +${LIGHT_AGL} m light should sit ${how}`;
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
    reference: null, // centroid of the probe's own objects
    camera: { lon: RUNWAY_CENTRE.lon, lat: RUNWAY_CENTRE.lat, zoom: 15 },
    objects: [], // unused: planExport reads the RESOLVED array, this is only carried for the folder name
    heightMode,
  };
}

/** Rewrite the anchor's AGL z in a generated `.tsl`. Probe A must fly the anchor at the value the
 *  2026-07-19 gate proved (0.1) so that probe changes exactly ONE thing from that gate: the lights.
 *  Throws unless it matched exactly once — the .tsl carries the anchor and nothing else, so a second
 *  match (or none) means the format moved and this rewrite is no longer safe to trust. */
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

// ── Catalog validation ────────────────────────────────────────────────────────────────────────────

function loadCatalog(file: string): Catalog {
  if (!existsSync(file)) {
    throw new Error(
      `Catalog not found: ${file}\n` +
        `Generate one first:\n` +
        `  npm run scan -- --install "<AFS4 install dir>" --out "${file}"`,
    );
  }
  return JSON.parse(readFileSync(file, "utf8")) as Catalog;
}

/** The install's airport-light fixture names, derived exactly as core/catalog/airportLights.ts does:
 *  the `.tmb` basename minus the `al_` prefix, dropping the `*_model` visible-mesh helpers. Reads
 *  DIRECTORY ENTRIES ONLY — PCT never opens a `.tmb` (opaque IPACS binary) and neither does this. */
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

/** Fail loudly, with candidates, when a probe name isn't in the scan. This is the whole reason the
 *  script reads the catalog at all: in the sim a bad name produces silence, not an error, and a
 *  silent probe reads exactly like a failed gate. */
function validateNames(cat: Catalog): { fixtureCount: number; fixtureSource: string } {
  const problems: string[] = [];

  for (const [label, name] of [["TALL_XREF", TALL_XREF], ["LOW_XREF", LOW_XREF]] as const) {
    if (cat.xref.some((o) => o.name === name)) continue;
    const near = cat.xref.filter((o) => o.name.toLowerCase() === name.toLowerCase());
    problems.push(
      near.length > 0
        ? `${label} = ${JSON.stringify(name)} — WRONG CASE. The scan has ${JSON.stringify(near[0].name)}.`
        : `${label} = ${JSON.stringify(name)} is not in the scan.`,
    );
  }

  // Lights come from the install, not the catalog: `src/cli/scan.ts` never calls buildAirportLights (only
  // the Electron main-process scan does), so a CLI-made catalog always has airportLights: []. Enumerate
  // the library the same way main/scan.ts does — FILENAMES ONLY, no bytes read from the opaque .tmb.
  const fixtures =
    cat.airportLights.length > 0
      ? cat.airportLights.map((l) => l.typeName)
      : installFixtureNames(cat.installDir);

  if (fixtures.length === 0) {
    problems.push(
      `Could not enumerate any airport-light fixture under ${cat.installDir} — LIGHT_TYPE is UNVERIFIED. ` +
        `A name AFS4 can't resolve fails silently, so do not fly this.`,
    );
  } else if (!fixtures.includes(LIGHT_TYPE)) {
    const near = fixtures.filter((f) => f.toLowerCase() === LIGHT_TYPE.toLowerCase());
    problems.push(
      near.length > 0
        ? `LIGHT_TYPE = ${JSON.stringify(LIGHT_TYPE)} — WRONG CASE. The install has ${JSON.stringify(near[0])}.`
        : `LIGHT_TYPE = ${JSON.stringify(LIGHT_TYPE)} is not in the install (${fixtures.length} fixtures found).`,
    );
  }

  if (problems.length === 0) {
    return {
      fixtureCount: fixtures.length,
      fixtureSource: cat.airportLights.length > 0 ? "catalog" : "install (the CLI scan omits lights)",
    };
  }

  // Rank on bbMax[2] — metres ABOVE the placement point — not size.z. They differ whenever the model
  // extends below its origin, and then size.z lies: FloodLight02 is size.z 44.17 but only 32.33 m tall.
  // A ruler you misjudge by 12 m is worse than no ruler.
  const top = (o: { bbMax: [number, number, number] }): number => o.bbMax[2];
  const tallest = [...cat.xref].sort((a, b) => top(b) - top(a)).slice(0, 12);
  const squat = [...cat.xref]
    .filter((o) => top(o) > 1 && top(o) < 5 && o.size.x < 15 && o.size.y < 15)
    .sort((a, b) => top(a) - top(b))
    .slice(0, 12);
  const dim = (o: (typeof tallest)[number]): string =>
    `    ${o.name}  (${o.size.x} × ${o.size.y} m, top at ${top(o).toFixed(2)} m above the base, ${o.category})`;

  throw new Error(
    [
      `Probe names don't match the scan:`,
      ...problems.map((p) => `  • ${p}`),
      ``,
      `  Tallest objects in the scan (candidates for TALL_XREF):`,
      ...tallest.map(dim),
      ``,
      `  Low, compact objects (candidates for LOW_XREF):`,
      ...squat.map(dim),
      ``,
      `  Airport-light fixtures (${cat.airportLights.length}):`,
      ...cat.airportLights.map((l) => `    ${l.typeName}  (${l.displayName}, ${l.category})`),
      ``,
      `Copy names VERBATIM from this list into the constants at the top of this script.`,
    ].join("\n"),
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────────────────────────

function afs4UserDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Aerofly FS 4");
  if (process.platform === "win32") return path.join(home, "Documents", "Aerofly FS 4");
  return path.join(home, "Aerofly FS 4");
}

interface Probe {
  key: "A" | "B" | "C" | "D";
  poiName: string;
  title: string;
  /** AGL z to force into the .tsl anchor, or null for a probe that carries no anchor (baked-asl). */
  anchorZ: string | null;
  withLights: boolean;
  heightMode: Project["heightMode"];
  /** Absolute base for the object z. 0 = AGL (autoheight); TERRAIN_ASL = absolute (baked-asl). */
  base: number;
  isolates: string;
}

const PROBES: Probe[] = [
  { key: "A", poiName: "gate_a_lights_anchor01", title: "Gate A — lights, anchor 0.1 (flown value)", anchorZ: "0.1", withLights: true, heightMode: "autoheight", base: 0, isolates: "lights" },
  { key: "B", poiName: "gate_b_buried_anchor", title: "Gate B — xrefs only, anchor buried", anchorZ: "-1.0", withLights: false, heightMode: "autoheight", base: 0, isolates: "the buried anchor" },
  { key: "C", poiName: "gate_c_both", title: "Gate C — lights + buried anchor (production shape)", anchorZ: "-1.0", withLights: true, heightMode: "autoheight", base: 0, isolates: "both together" },
  // The CANARY. Run 1 saw no lights anywhere, which could not be read: "not placed" and "placed but
  // not visible" look identical. D flies the SAME two fixtures at the SAME heights down the baked-asl
  // path — the one already proven to place lights (gate 2026-07-12) — so it produces the signal the
  // autoheight probes are being read for the absence of. No anchor: baked-asl only ships one for plants.
  { key: "D", poiName: "gate_d_bakedasl_control", title: "Gate D — CONTROL: same lights, baked ASL", anchorZ: null, withLights: true, heightMode: "baked-asl", base: TERRAIN_ASL, isolates: "whether these fixtures are visible AT ALL" },
];

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
  let fixtures: { fixtureCount: number; fixtureSource: string };
  try {
    cat = loadCatalog(catalogFile);
    fixtures = validateNames(cat);
  } catch (e) {
    console.error(`\nERROR: ${(e as Error).message}\n`);
    return 1;
  }

  console.log(`Catalog: ${catalogFile}`);
  console.log(`  scanned ${cat.scannedAt} from ${cat.installDir}`);
  console.log(`  ${cat.xref.length} xref`);
  console.log(`  ${fixtures.fixtureCount} airport-light fixtures, from the ${fixtures.fixtureSource}`);
  console.log(`  all three probe names verified present, case-exact\n`);
  console.log(`Site: KDAG runway 08/26 centre ${RUNWAY_CENTRE.lat}, ${RUNWAY_CENTRE.lon} (on asphalt)`);
  console.log(`Probe objects: ${TALL_XREF} / ${LOW_XREF} / light ${LIGHT_TYPE} (group ${LIGHT_GROUP}, 24 h)`);
  console.log(`What to look for: ${rulerReading(cat)}\n`);

  const assetsDir = anchorAssetsDir({
    env: process.env,
    packaged: false,
    resourcesPath: undefined,
    appPath: process.cwd(),
  });

  // Sweep the previous run's probes first. A POI folder name encodes its coordinates, so moving a probe
  // RENAMES it and the old one is orphaned — you then fly two generations at once and the gate's whole
  // point (one probe, one variable) is gone. This bit already cost the plant gate a flight.
  if (install) {
    const poiRoot = path.join(afs4UserDir(), "scenery", "poi");
    if (existsSync(poiRoot)) {
      const stale = readdirSync(poiRoot).filter((n) => /_gate_[a-d]_/.test(n));
      for (const n of stale) rmSync(path.join(poiRoot, n), { recursive: true, force: true });
      if (stale.length > 0) console.log(`Removed ${stale.length} probe folder(s) from the previous run\n`);
    }
  }

  for (const probe of PROBES) {
    const resolved = probeObjects(PROBE_EAST[probe.key], probe.withLights, probe.base);
    const plan = planExport(project(probe.poiName, probe.title, probe.heightMode), resolved);

    if (!isSafePoiFolderName(plan.folderName)) {
      console.error(`ERROR: unsafe POI folder name "${plan.folderName}"`);
      return 1;
    }

    // The .tsl PCT would emit carries ANCHOR_AGL_Z (currently -1.0). Probe A must fly 0.1 instead.
    // anchorZ null = a baked-asl probe with no plants, whose .tsl carries no anchor object at all.
    const files = plan.files.map((f) =>
      f.relPath.endsWith(".tsl") && probe.anchorZ !== null
        ? { ...f, content: setAnchorZ(f.content, probe.anchorZ) }
        : f,
    );

    const outDir = path.join(outRoot, plan.folderName);
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(path.join(outDir, f.relPath), f.content, "utf8"); // LF, like AFS4
    for (const name of plan.assets) copyFileSync(path.join(assetsDir, name), path.join(outDir, name));

    // Echo the anchor line actually emitted — the sheet asks you to confirm A carries 0.1 and B/C -1.0
    // BEFORE flying, and this is the cheapest place to catch a probe that isn't testing what you think.
    const anchorLine =
      files
        .find((f) => f.relPath.endsWith(".tsl"))!
        .content.split("\n")
        .find((l) => l.includes("vector3_float64"))
        ?.trim() ?? "none (baked-asl carries no anchor without plants)";

    console.log(`${probe.title}`);
    console.log(`  isolates : ${probe.isolates}`);
    console.log(`  mode     : ${probe.heightMode}${probe.base ? ` (z absolute, ground ${probe.base} m ASL)` : " (z is AGL)"}`);
    console.log(`  folder   : ${plan.folderName}`);
    console.log(`  objects  : ${resolved.length} (${probe.withLights ? "2 xref + 2 lights" : "2 xref, no lights"})`);
    console.log(`  anchor   : ${anchorLine}`);
    for (const w of plan.warnings) console.log(`  WARNING  : ${w}`);

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
      ? `Restart Aerofly FS 4, then start at KDAG runway 08/26.\nRead docs/GATE_AUTOHEIGHT_LIGHTS_ANCHOR.md before flying — the pre-flight check is 30 seconds.`
      : `Built in ${outRoot}. Re-run with --install to install into AFS4.`,
  );
  return 0;
}

process.exit(main());
