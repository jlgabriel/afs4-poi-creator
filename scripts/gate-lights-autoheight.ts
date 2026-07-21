// gate-lights-autoheight.ts — does autoheight place airport lights on the terrain, or bury them?
//
//   npx tsx scripts/gate-lights-autoheight.ts [--install] [--catalog <catalog.json>] [--out <dir>]
//
// ── The question (chrispriv #151.2) ────────────────────────────────────────────────────────────────────
//
// PCT blocks airport lights in autoheight mode (`unsupportedInAutoheight`) because it was never verified
// that autoheight REACHES the cultivation's light lists. The plant precedent is the fear: `autoheight=true`
// alone forces every plant to z=0 (sea level) and buries it 588 m under KDAG; only the always-present
// `pct_anchor` rescues it, snapping objects written at z=0 to the terrain (AGL). Two facts are now settled:
//   • autoheight PLACES XREFS correctly (in-sim gate 2026-07-19: the silo/crane land on the runway, anchor
//     buried at −1.0).
//   • bare airport lights RENDER in baked-asl (in-sim gate 2026-07-20: P3, lights-only, no witness/anchor,
//     was visible → the culling theory is dead).
// What remains: put airport lights through autoheight and see if the anchor reaches THEM too.
//
// ── Two probes (dark KDAG desert, night), each with a silo you can FIND ────────────────────────────────
//
//   A  CONTROL   baked-asl: silo + a LINE of lights at absolute ASL      → the 2026-07-20 proven shape
//   B  AUTOHEIGHT autoheight: silo + a TRIANGLE of lights at AGL + anchor → the question
//
// Both silos land on the ground (autoheight places xrefs — 2026-07-19), so the silo is the GROUND REFERENCE
// and the landmark that lets you find each probe (2026-07-20 taught us the lights alone are too small to
// find without one). Both light shapes float ~15 m above their silo IF placed — the height proven visible
// on 2026-07-20. The read is binary:
//
//   A (line + silo) lit           → night/site/fixture good (if dark, STOP — nothing else is readable).
//   B silo + TRIANGLE above it     → autoheight PLACES the lights → lift the guard. Lights work in autoheight.
//   B silo ALONE, no triangle      → autoheight BURIES the lights (the plant failure) → keep the guard; a
//                                    finding for IPACS (autoheight reaches xrefs but not airport lights).
//
// Since the culling theory is dead (2026-07-20), the silo in B is ONLY a landmark — it does not change
// whether the lights place; the always-present autoheight anchor is what places them. So B is an honest
// test of autoheight, not a witness experiment.
//
// ── Premises, VERIFIED (never inherited) ───────────────────────────────────────────────────────────────
//
//   • runway_edge_light + configuration "wr" + group 3 — byte-derived from the POI that rendered
//     (GOLDEN_LIGHTS_TOC, tests/unit/exportLights.test.ts); re-checked case-exact against the scan below.
//   • silo_00 — a real xref (validateWitness refuses to build otherwise). Placed on the terrain in both
//     probes; in B it also re-confirms autoheight-places-xrefs as a built-in sanity check.
//   • terrain 588 m ASL, site KDAG desert 200 m N of the runway-26 threshold — measured / confirmed clean.
//   • The autoheight anchor is written buried at −1.0 with autoheight_override=−1 by planExport/buildTsl
//     (ANCHOR_AGL_Z); this gate emits it natively, no rewrite.
//
// ⚠️ FLY AT NIGHT/DUSK (airport lights are invisible by day). Look NORTH from the 26 threshold: WEST silo =
//    A (line, control), EAST silo = B (triangle, autoheight). The finding is whether B's silo has a triangle.
//
// Why a script and not `npm run export`: the CLI's resolveHeightsAgl REFUSES lights in autoheight — that
// refusal is the thing under test. planExport takes already-resolved objects and has no such guard, so this
// builds the exact bytes a PCT with the guard lifted would ship.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planExport } from "../src/core/export/planExport";
import { shiftEastNorth } from "../src/core/geo/geo";
import { isSafePoiFolderName } from "../src/core/geo/poiName";
import { anchorAssetsDir } from "../src/main/anchorAsset";
import type { Catalog, Project, ResolvedAirportLight, ResolvedObject, ResolvedXref } from "../src/core/project/types";

// ── Fixtures (VERBATIM from the golden; re-checked against the scan below) ─────────────────────────────

const LIGHT_TYPE = "runway_edge_light";
const LIGHT_CONFIG = "wr"; // the golden's value, empirically rendered (2026-07-20). NOT "" (v3 flew dark)
const LIGHT_GROUP = 3; // 24 h visibility
const WITNESS_NAME = "silo_00"; // the landmark + ground reference in each probe

// ── Where ──────────────────────────────────────────────────────────────────────────────────────────────

const SPAWN_26 = { lon: -116.776615, lat: 34.851474 }; // KDAG runway-26 threshold (tm.log menu_location)
const DESERT_NORTH = 200; // metres N of the threshold: the dark desert Juan confirmed clean (run 5)
const LIGHTS_NORTH = DESERT_NORTH - 20; // lights sit just SOUTH of (in front of) their silo — one cluster
const A_EAST = -75; // CONTROL group, WEST
const B_EAST = 75; // AUTOHEIGHT group, EAST (150 m apart — distinct at a glance)

const TERRAIN_ASL = 588; // measured mesh terrain
const LIGHT_FLOAT = 15; // metres above terrain — the height proven visible on 2026-07-20

// Baked-asl (A) writes ABSOLUTE ASL. Autoheight (B) writes AGL and the sim adds the terrain: a light at
// AGL 15 lands at terrain+15 ≈ 603 (visible, same as A) if autoheight works, or 15 m ASL (buried 573 m) if
// it doesn't — so "works" and "buried" are ~588 m apart, unmistakable.
const A_SILO_ASL = TERRAIN_ASL; // 588 — on the ground
const A_LIGHT_ASL = TERRAIN_ASL + LIGHT_FLOAT; // 603 — floating 15 m (proven visible)
const B_SILO_AGL = 0; // on the terrain (autoheight adds it)
const B_LIGHT_AGL = LIGHT_FLOAT; // terrain + 15 if placed; buried if autoheight drops the light lists

// ── Probe construction ────────────────────────────────────────────────────────────────────────────────

let uid = 0;
const id = (): string => `gate-${String(++uid).padStart(4, "0")}`;

function lightAt(eastOff: number, northOff: number, heightAsl: number): ResolvedAirportLight {
  return {
    id: id(),
    kind: "airport_light",
    typeName: LIGHT_TYPE,
    position: shiftEastNorth(SPAWN_26, eastOff, northOff),
    heightAsl, // ASL for baked-asl; AGL for autoheight (the sim adds the terrain)
    orientation: 0,
    configuration: LIGHT_CONFIG,
    groupIndex: LIGHT_GROUP,
  };
}

function siloAt(eastOff: number, northOff: number, heightAsl: number): ResolvedXref {
  return {
    id: id(),
    kind: "xref",
    name: WITNESS_NAME,
    position: shiftEastNorth(SPAWN_26, eastOff, northOff),
    heightAsl,
    direction: 0,
    scale: 1,
  };
}

/** A — a straight E–W LINE of 4 lights just south of the control silo. */
function line(centreEast: number, z: number): ResolvedAirportLight[] {
  return [-1.5, -0.5, 0.5, 1.5].map((k) => lightAt(centreEast + k * 15, LIGHTS_NORTH, z));
}

/** B — a TRIANGLE of 3 lights just south of the autoheight silo (apex north). */
function triangle(centreEast: number, z: number): ResolvedAirportLight[] {
  return [
    lightAt(centreEast, LIGHTS_NORTH + 15, z), // apex
    lightAt(centreEast - 15, LIGHTS_NORTH - 10, z), // base SW
    lightAt(centreEast + 15, LIGHTS_NORTH - 10, z), // base SE
  ];
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
    reference: null,
    camera: { lon: SPAWN_26.lon, lat: SPAWN_26.lat, zoom: 15 },
    objects: [], // unused: planExport reads the RESOLVED array; carried only for the folder name
    heightMode,
  };
}

interface Probe {
  poiName: string;
  title: string;
  heightMode: Project["heightMode"];
  objects: ResolvedObject[];
  reads: string;
}

const PROBES: Probe[] = [
  {
    poiName: "gate_light_baked",
    title: "A CONTROL — baked-asl: silo + a LINE of lights at absolute ASL (2026-07-20 proven shape)",
    heightMode: "baked-asl",
    objects: [siloAt(A_EAST, DESERT_NORTH, A_SILO_ASL), ...line(A_EAST, A_LIGHT_ASL)],
    reads:
      "WEST: a silo with a LINE of 4 lights floating ~15 m above it. Baked-asl, known to render. Confirms " +
      "night/site/fixture — if this is dark, STOP, nothing else is readable.",
  },
  {
    poiName: "gate_light_autoheight",
    title: "B AUTOHEIGHT — autoheight: silo + a TRIANGLE of lights at AGL + the buried anchor (the question)",
    heightMode: "autoheight",
    objects: [siloAt(B_EAST, DESERT_NORTH, B_SILO_AGL), ...triangle(B_EAST, B_LIGHT_AGL)],
    reads:
      "EAST: a silo ON THE GROUND. A TRIANGLE of lights ~15 m above it ⇒ autoheight PLACES the lights → " +
      "lift the guard. The silo ALONE, no triangle ⇒ autoheight BURIES them (the plant failure).",
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

/** Airport-light fixture names from the install, derived as core/catalog/airportLights.ts does — reads
 *  DIRECTORY ENTRIES ONLY, no `.tmb` is opened. The CLI scan omits lights, so a CLI catalog has none. */
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

/** Verify LIGHT_TYPE resolves case-exact. A bad name is SILENT in the sim, indistinguishable from a buried
 *  probe — so refuse to build on a miss. */
function validateFixture(cat: Catalog): { count: number; source: string } {
  const fixtures =
    cat.airportLights.length > 0 ? cat.airportLights.map((l) => l.typeName) : installFixtureNames(cat.installDir);

  if (fixtures.includes(LIGHT_TYPE)) {
    return { count: fixtures.length, source: cat.airportLights.length > 0 ? "catalog" : "install (CLI scan omits lights)" };
  }
  const near = fixtures.filter((f) => f.toLowerCase() === LIGHT_TYPE.toLowerCase());
  const hint =
    near.length > 0 ? `${JSON.stringify(LIGHT_TYPE)} — WRONG CASE, install has ${JSON.stringify(near[0])}` : `${JSON.stringify(LIGHT_TYPE)} not in the install`;
  throw new Error(
    [`Light fixture doesn't match the scan:`, `  • ${hint}`, ``, `  Airport-light fixtures found:`, ...fixtures.map((f) => `    ${f}`)].join("\n"),
  );
}

/** Verify the silo landmark resolves case-exact against the scan, and return its size for the log. */
function validateWitness(cat: Catalog): { size: string } {
  const hit = cat.xref.find((x) => x.name === WITNESS_NAME);
  if (hit) return { size: `${hit.size.x}×${hit.size.y}×${hit.size.z} m` };
  const near = cat.xref.filter((x) => x.name.toLowerCase() === WITNESS_NAME.toLowerCase());
  const hint =
    near.length > 0 ? ` — WRONG CASE, scan has ${JSON.stringify(near[0].name)}` : ` not in the scan (${cat.xref.length} xrefs)`;
  throw new Error(`Landmark xref ${JSON.stringify(WITNESS_NAME)}${hint}.\n  Pick any silo/tower present in your scan.`);
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
  let witness: { size: string };
  try {
    cat = loadCatalog(catalogFile);
    fixture = validateFixture(cat);
    witness = validateWitness(cat);
  } catch (e) {
    console.error(`\nERROR: ${(e as Error).message}\n`);
    return 1;
  }

  const site = shiftEastNorth(SPAWN_26, 0, DESERT_NORTH);
  console.log(`Catalog: ${catalogFile}`);
  console.log(`  ${fixture.count} airport-light fixtures, from the ${fixture.source}`);
  console.log(`  fixture verified case-exact: ${LIGHT_TYPE} (configuration "${LIGHT_CONFIG}", group ${LIGHT_GROUP})`);
  console.log(`  landmark verified case-exact: ${WITNESS_NAME} (${witness.size})\n`);
  console.log(`Site: KDAG desert, ${DESERT_NORTH} m NORTH of the runway-26 threshold → ${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}`);
  console.log(`⚠️  FLY AT NIGHT/DUSK. Look NORTH: WEST silo = A (line, baked control) · EAST silo = B (triangle, autoheight).\n`);

  const assetsDir = anchorAssetsDir({ env: process.env, packaged: false, resourcesPath: undefined, appPath: process.cwd() });

  // Sweep this family's previous probe folders first (today's culling probes AND any prior autoheight run):
  // a folder name encodes coordinates, so a moved probe is orphaned rather than replaced.
  if (install) {
    const poiRoot = path.join(afs4UserDir(), "scenery", "poi");
    if (existsSync(poiRoot)) {
      const stale = readdirSync(poiRoot).filter((n) => /_gate_light_/.test(n));
      for (const n of stale) rmSync(path.join(poiRoot, n), { recursive: true, force: true });
      if (stale.length > 0) console.log(`Removed ${stale.length} probe folder(s) from previous runs\n`);
    }
  }

  for (const probe of PROBES) {
    const plan = planExport(project(probe.poiName, probe.title, probe.heightMode), probe.objects);

    if (!isSafePoiFolderName(plan.folderName)) {
      console.error(`ERROR: unsafe POI folder name "${plan.folderName}"`);
      return 1;
    }

    const outDir = path.join(outRoot, plan.folderName);
    mkdirSync(outDir, { recursive: true });
    for (const f of plan.files) writeFileSync(path.join(outDir, f.relPath), f.content, "utf8"); // LF, like AFS4
    for (const name of plan.assets) copyFileSync(path.join(assetsDir, name), path.join(outDir, name));

    const anchorLine =
      plan.files
        .find((f) => f.relPath.endsWith(".tsl"))!
        .content.split("\n")
        .find((l) => l.includes("vector3_float64"))
        ?.trim() ?? "none (no anchor)";

    console.log(`${probe.title}`);
    console.log(`  mode   : ${probe.heightMode}`);
    console.log(`  folder : ${plan.folderName}`);
    console.log(
      `  objects: ${probe.objects
        .map((o) => (o.kind === "airport_light" ? o.typeName : o.kind === "xref" ? `${o.name} (silo)` : o.kind))
        .join(", ")}`,
    );
    console.log(`  anchor : ${anchorLine}`);
    console.log(`  assets : ${plan.assets.length > 0 ? plan.assets.join(", ") : "none"}`);
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
      ? `Restart Aerofly FS 4, start at KDAG runway 26, and look NORTH — AT NIGHT.\n` +
          `  WEST  = A: a silo with a LINE of lights above it. Must be lit (control) — dark ⇒ stop.\n` +
          `  EAST  = B: a silo on the ground. Does it have a TRIANGLE of lights above it?\n` +
          `    triangle present ⇒ autoheight places lights (lift the guard); silo alone ⇒ it buries them.`
      : `Built in ${outRoot}. Re-run with --install to install into AFS4.`,
  );
  return 0;
}

process.exit(main());
