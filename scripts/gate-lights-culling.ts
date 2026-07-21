// gate-lights-culling.ts — is a lights-only baked-asl POI culled for want of a bounding volume?
//
//   npx tsx scripts/gate-lights-culling.ts [--install] [--catalog <catalog.json>] [--out <dir>]
//
// ── The question (Fable's desk analysis, 2026-07-20) ──────────────────────────────────────────────────
//
// Six night/desert flights placed PCT airport lights and saw NOTHING. The code says why a lights-only
// baked-asl POI is SUSPICIOUS: `computeAnchor` (plantAnchor.ts) emits the `pct_anchor` only when the POI
// has plants, and `airport_light` carries no bounding box (CatalogAirportLight, project/types.ts) — so a
// lights-only POI ships with ZERO bbox-bearing geometry and no anchor. If the sim sizes a cultivation's
// bounding volume from its bbox-bearing objects (the v0.4 plant-blink mechanism), that volume computes at
// height 0, and at KDAG's 588 m the frustum test rejects the whole cultivation — the lights never draw.
//
// That is a HYPOTHESIS the desk cannot close (the cull is a sim-side inference, not a code fact), and one
// datum argues against the GENERAL form of it: a v0.2 point-lights-only POI with no witness rendered at
// SCLL (~526 m, the same altitude band). So the effect, if real, is specific to `list_airport_light`.
// Only a flight decides. This gate is that flight — ONE night sortie, three probes, every outcome legible.
//
// ── The three probes (all baked-asl; the ONLY variable is what anchors the volume) ─────────────────────
//
//   P1  WITNESS  lights + a `silo_00` xref in the .toc   → the 2026-07-12 shape that RENDERED (control)
//   P2  FIX      lights + the `pct_anchor` in the .tsl   → EXACTLY what the proposed fix would ship
//   P3  TODAY    lights only, empty list_xref, no anchor → what PCT ships for a lights-only POI now
//
//   P1 lit  → night/site/format OK; the witness works (as it did in v0.2). P1 DARK → STOP, read nothing
//             else: the sim or the format moved since July, or the night/site is wrong.
//   P3 dark → the culling bug is CONFIRMED (with P1 lit ruling out every other cause).
//   P3 lit  → culling REFUTED; the six flights failed on something else (suspect v3's `configuration:""`).
//   P2 lit  → the fix works as shipped: emit the anchor for a bbox-less (lights/plants) cultivation.
//   P2 DARK while P1 lit → the .tsl anchor does NOT witness lights the way an in-.toc xref does; the fix
//             must add an in-.toc witness instead (an open design problem — PCT has no invisible xref).
//
// ── Premises, every one VERIFIED against the source (the gate-sheet lesson: never inherit a premise) ───
//
//   • runway_edge_light + configuration "wr" + group_index 3 — NOT guessed. Byte-derived from the POI that
//     rendered on 2026-07-12 (GOLDEN_LIGHTS_TOC, tests/unit/exportLights.test.ts). v3 used "" and flew
//     dark; the proven config is "wr". The fixture name is re-checked case-exact against the scan below.
//   • silo_00 — a real xref in the scan (validateWitness below refuses to build if it isn't). 22×22×32 m,
//     so placed on the 588 m terrain its bbox spans ~584–616 m ASL: it comfortably contains the lights.
//   • terrain 588 m ASL — measured (run 2 HUD: 2000 ft ALT − 70 ft GND = 1930 ft ≈ 588 m; KDAG published
//     1927 ft agrees). The lights sit at 588 + a 15 m float, so they are ABOVE the mesh ground: a dark
//     probe is CULLING, never a buried object (the Open-Meteo estimate is 584 — using the higher measured
//     mesh value plus the float guarantees the lights never sink below the terrain).
//   • site — KDAG desert, 200 m NORTH of the runway-26 threshold: the black spot Juan confirmed clean in
//     run 5 (his own runway lights "se ven tenues pero bien"; nothing else competes out there).
//
// ⚠️ FLY AT NIGHT/DUSK. Airport lights are invisible by day at any group_index (runs 1, 3 burned on this).
//    Look NORTH from the 26 threshold: three groups, WEST→EAST = P1 line+silo, P2 triangle, P3 square.
//
// Why a script and not `npm run export`: the probes need shapes and a forced anchor the UI can't place, and
// P2 must emit the fix's output before the fix exists. planExport is pure and takes resolved objects, so
// this builds the exact bytes a fixed PCT would — nothing here is a mock of the format.

import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { planExport } from "../src/core/export/planExport";
import { buildTsl } from "../src/core/export/tslWriter";
import { ANCHOR_ASSETS, type Anchor } from "../src/core/export/plantAnchor";
import { shiftEastNorth } from "../src/core/geo/geo";
import { centroid, isSafePoiFolderName } from "../src/core/geo/poiName";
import { anchorAssetsDir } from "../src/main/anchorAsset";
import type { Catalog, Project, ResolvedAirportLight, ResolvedObject, ResolvedXref } from "../src/core/project/types";

// ── Fixtures (VERBATIM from the golden; re-checked against the scan below) ─────────────────────────────
//
// ⚠️ A name AFS4 can't resolve fails SILENTLY — nothing appears, no error — so a typo reads exactly like a
// culled gate. validateFixtures / validateWitness check these against the install before writing a byte.

/** The one runway fixture proven to render: the 2026-07-12 golden is a `runway_edge_light` with
 *  configuration "wr" at group_index 3. Using the SAME three values keeps the fixture out of the set of
 *  variables — the only thing that changes across P1/P2/P3 is what anchors the cultivation's volume. */
const LIGHT_TYPE = "runway_edge_light";
const LIGHT_CONFIG = "wr"; // white/red runway-edge colours — the golden's value, empirically rendered
const LIGHT_GROUP = 3; // 24 h visibility, so the reading never hinges on the exact minute of dusk

/** The witness object for P1: a real, bbox-bearing xref. silo_00 is the one the v0.2 POI carried, so P1 is
 *  a faithful replica of the shape that rendered. Any bbox-bearing xref would witness the volume; this one
 *  keeps the control honest. */
const WITNESS_NAME = "silo_00";

// ── Where: the black desert north of the runway-26 threshold, where the sim drops Juan ─────────────────

/** KDAG runway 26 threshold (tm.log menu_location, every run) — anchoring the probes here puts them in
 *  view the moment Juan looks north. */
const SPAWN_26 = { lon: -116.776615, lat: 34.851474 };

/** Metres NORTH of the threshold: open desert that carries no lights of its own, clear of the runway. */
const DESERT_NORTH = 200;

/** Metres EAST between the three probe centres. 120 m keeps the groups distinct at a glance while all
 *  three stay in one northward look. WEST→EAST: P1 (−120) · P2 (0) · P3 (+120). */
const PROBE_EAST = 120;

/** Ground elevation, metres ASL — MEASURED (run 2 HUD, KDAG published field elevation agrees). */
const TERRAIN_ASL = 588;

/** Metres the lights float above the mesh terrain. Above ground ON PURPOSE: it guarantees a dark probe is
 *  CULLING and not a buried object, and lights hanging over black desert are unmistakably ours. 15 m clears
 *  the ~4 m Open-Meteo-vs-mesh error with margin and still sits inside silo_00's ~32 m bbox (P1). It is far
 *  too small to let P3 escape a cull that (in theory) sits hundreds of metres low, and it is IDENTICAL
 *  across the three probes, so it is not a variable. */
const LIGHT_FLOAT = 15;

const LIGHT_Z = TERRAIN_ASL + LIGHT_FLOAT; // 603 m ASL

// ── Probe construction ────────────────────────────────────────────────────────────────────────────────

let uid = 0;
const id = (): string => `gate-${String(++uid).padStart(4, "0")}`;

/** One runway_edge_light at (eastOff, northOff) metres from the threshold, floating at LIGHT_Z. */
function lightAt(eastOff: number, northOff: number): ResolvedAirportLight {
  return {
    id: id(),
    kind: "airport_light",
    typeName: LIGHT_TYPE,
    position: shiftEastNorth(SPAWN_26, eastOff, northOff),
    heightAsl: LIGHT_Z,
    orientation: 0,
    configuration: LIGHT_CONFIG,
    groupIndex: LIGHT_GROUP,
  };
}

// Three UNMISTAKABLE gestalts — a line, a triangle, a square — so Juan never has to tell two identical
// groups apart by position (the in-sim-verification lesson). The arrangement can't affect culling (lights
// carry no bbox however they sit), so a distinct shape per probe costs the experiment nothing.

/** P1 — a straight E–W LINE of 4 lights, 20 m apart (a ~60 m bar). */
function line(centreEast: number): ResolvedAirportLight[] {
  return [-1.5, -0.5, 0.5, 1.5].map((k) => lightAt(centreEast + k * 20, DESERT_NORTH));
}

/** P2 — a TRIANGLE of 3 lights, apex to the north (~36 m base, ~30 m tall). */
function triangle(centreEast: number): ResolvedAirportLight[] {
  return [
    lightAt(centreEast, DESERT_NORTH + 18), // apex
    lightAt(centreEast - 18, DESERT_NORTH - 12), // base SW
    lightAt(centreEast + 18, DESERT_NORTH - 12), // base SE
  ];
}

/** P3 — a SQUARE of 4 lights (~30 m side). */
function square(centreEast: number): ResolvedAirportLight[] {
  return [
    lightAt(centreEast - 15, DESERT_NORTH - 15),
    lightAt(centreEast + 15, DESERT_NORTH - 15),
    lightAt(centreEast + 15, DESERT_NORTH + 15),
    lightAt(centreEast - 15, DESERT_NORTH + 15),
  ];
}

/** The P1 witness: silo_00 on the ground, ~40 m north of (behind) the light line. On the terrain its 32 m
 *  bbox rises through the lights' altitude, giving the cultivation the bounding volume the lights lack. */
function siloWitness(centreEast: number): ResolvedXref {
  return {
    id: id(),
    kind: "xref",
    name: WITNESS_NAME,
    position: shiftEastNorth(SPAWN_26, centreEast, DESERT_NORTH + 40),
    heightAsl: TERRAIN_ASL,
    direction: 0,
    scale: 1,
  };
}

function project(poiName: string, name: string): Project {
  const now = "2026-07-20T00:00:00.000Z";
  return {
    schemaVersion: 1,
    app: "pct",
    name,
    poiName,
    createdAt: now,
    modifiedAt: now,
    reference: null, // folder anchored at the centroid of the probe's own objects
    camera: { lon: SPAWN_26.lon, lat: SPAWN_26.lat, zoom: 15 },
    objects: [], // unused: planExport reads the RESOLVED array; carried only for the folder name
    heightMode: "baked-asl", // the whole experiment is baked-asl — autoheight blocks lights upstream
  };
}

interface Probe {
  poiName: string;
  title: string;
  objects: ResolvedObject[];
  /** P2 only: inject the `pct_anchor` the proposed fix would emit for a bbox-less cultivation. */
  forceAnchor: boolean;
  reads: string;
}

const PROBES: Probe[] = [
  {
    poiName: "gate_light_witness",
    title: "P1 WITNESS — lights + silo_00 in the .toc (the v0.2 shape that rendered)",
    objects: [...line(-PROBE_EAST), siloWitness(-PROBE_EAST)],
    forceAnchor: false, // the silo IS the witness; v0.2 carried no pct_anchor
    reads:
      "WEST: a LINE of 4 lights with a big silo ~40 m behind it. Replicates the 2026-07-12 POI that " +
      "rendered. MUST BE LIT. If dark, STOP — night/site wrong or the sim/format moved since July.",
  },
  {
    poiName: "gate_light_anchor",
    title: "P2 FIX — lights + pct_anchor in the .tsl (exactly what the proposed fix would ship)",
    objects: triangle(0),
    forceAnchor: true,
    reads:
      "CENTER: a TRIANGLE of 3 lights carrying the pct_anchor. LIT ⇒ the fix works as-is. DARK while " +
      "P1 is lit ⇒ the .tsl anchor doesn't witness lights; the fix must add an in-.toc xref instead.",
  },
  {
    poiName: "gate_light_bare",
    title: "P3 TODAY — lights only, empty list_xref, no anchor (what PCT ships now)",
    objects: square(PROBE_EAST),
    forceAnchor: false,
    reads:
      "EAST: a SQUARE of 4 lights, bare. DARK ⇒ the culling bug is CONFIRMED. LIT ⇒ culling refuted; " +
      "the six flights failed on something else (suspect v3's empty configuration).",
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
 *  is ever opened (opaque IPACS binary). The CLI scan omits lights, so a CLI catalog has none. */
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

/** Verify LIGHT_TYPE resolves case-exact, printing the fixture list if not. A bad name is SILENT in the
 *  sim, and a silent probe reads exactly like a culled one — so refuse to build on a miss. */
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

/** Verify the P1 witness xref resolves case-exact against the scan, and return its size for the log. */
function validateWitness(cat: Catalog): { size: string } {
  const hit = cat.xref.find((x) => x.name === WITNESS_NAME);
  if (hit) return { size: `${hit.size.x}×${hit.size.y}×${hit.size.z} m` };

  const near = cat.xref.filter((x) => x.name.toLowerCase() === WITNESS_NAME.toLowerCase());
  const hint =
    near.length > 0 ? ` — WRONG CASE, scan has ${JSON.stringify(near[0].name)}` : ` not in the scan (${cat.xref.length} xrefs)`;
  throw new Error(
    `Witness xref ${JSON.stringify(WITNESS_NAME)}${hint}.\n` +
      `  P1 needs ONE bbox-bearing xref as its witness — pick any silo/tower/tank present in your scan.`,
  );
}

// ── The fix's output, reproduced for P2 ───────────────────────────────────────────────────────────────

/** Rebuild a probe's .tsl carrying the `pct_anchor`, EXACTLY as the proposed fix would: the fix widens
 *  `computeAnchor` (plantAnchor.ts) to `o.kind !== "xref"`, so a lights-only baked-asl POI gets an anchor
 *  at the centroid / mean ASL of its bbox-less objects. buildTsl writes that anchor absolute (baked-asl),
 *  and the POI newly ships the two ANCHOR_ASSETS — the byte shape a fixed PCT would produce. */
function withForcedAnchor(files: { relPath: string; content: string }[], objects: ResolvedObject[]): { relPath: string; content: string }[] {
  const bbless = objects.filter((o) => o.kind !== "xref"); // the fix anchors lights (and plants), not xrefs
  const anchor: Anchor = {
    position: centroid(bbless.map((o) => o.position)),
    heightAsl: bbless.reduce((sum, o) => sum + o.heightAsl, 0) / bbless.length,
  };
  const tocRel = files.find((f) => f.relPath.endsWith(".toc"))!.relPath;
  const tocFileName = tocRel.replace(/\.toc$/, "");
  return files.map((f) =>
    f.relPath.endsWith(".tsl") ? { ...f, content: buildTsl({ tocFileName, anchor, autoheight: false }) } : f,
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
  console.log(`  witness verified case-exact: ${WITNESS_NAME} (${witness.size})\n`);
  console.log(`Site: KDAG desert, ${DESERT_NORTH} m NORTH of the runway-26 threshold → ${site.lat.toFixed(6)}, ${site.lon.toFixed(6)}`);
  console.log(`Lights at ${LIGHT_Z} m ASL (${TERRAIN_ASL} m terrain + ${LIGHT_FLOAT} m float — above ground, so a dark probe is culling, not burial)`);
  console.log(`⚠️  FLY AT NIGHT/DUSK. Look NORTH from the 26 threshold. WEST→EAST: P1 line+silo · P2 triangle · P3 square.\n`);

  const assetsDir = anchorAssetsDir({ env: process.env, packaged: false, resourcesPath: undefined, appPath: process.cwd() });

  // Sweep this gate's previous probe folders first. A folder name encodes its coordinates, so a moved
  // probe is orphaned rather than replaced — fly two generations at once and the gate's point is gone.
  if (install) {
    const poiRoot = path.join(afs4UserDir(), "scenery", "poi");
    if (existsSync(poiRoot)) {
      const stale = readdirSync(poiRoot).filter((n) => /_gate_light_/.test(n));
      for (const n of stale) rmSync(path.join(poiRoot, n), { recursive: true, force: true });
      if (stale.length > 0) console.log(`Removed ${stale.length} probe folder(s) from previous runs\n`);
    }
  }

  for (const probe of PROBES) {
    const plan = planExport(project(probe.poiName, probe.title), probe.objects);

    if (!isSafePoiFolderName(plan.folderName)) {
      console.error(`ERROR: unsafe POI folder name "${plan.folderName}"`);
      return 1;
    }

    const files = probe.forceAnchor ? withForcedAnchor(plan.files, probe.objects) : plan.files;
    const assets = probe.forceAnchor ? [...ANCHOR_ASSETS] : plan.assets;

    const outDir = path.join(outRoot, plan.folderName);
    mkdirSync(outDir, { recursive: true });
    for (const f of files) writeFileSync(path.join(outDir, f.relPath), f.content, "utf8"); // LF, like AFS4
    for (const name of assets) copyFileSync(path.join(assetsDir, name), path.join(outDir, name));

    const anchorLine =
      files
        .find((f) => f.relPath.endsWith(".tsl"))!
        .content.split("\n")
        .find((l) => l.includes("vector3_float64"))
        ?.trim() ?? "none (no anchor)";

    console.log(`${probe.title}`);
    console.log(`  folder : ${plan.folderName}`);
    console.log(
      `  objects: ${probe.objects
        .map((o) => (o.kind === "airport_light" ? o.typeName : o.kind === "xref" ? `${o.name} (witness)` : o.kind))
        .join(", ")}`,
    );
    console.log(`  anchor : ${anchorLine}`);
    console.log(`  assets : ${assets.length > 0 ? assets.join(", ") : "none"}`);
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
          `  WEST   = P1: a LINE of lights + a silo. MUST be lit (control) — dark ⇒ stop, night/site/format wrong.\n` +
          `  CENTER = P2: a TRIANGLE of lights (the fix). Lit ⇒ the fix works.\n` +
          `  EAST   = P3: a SQUARE of lights (today's output). Dark ⇒ the culling bug is confirmed.\n` +
          `  The finding is P2 vs P3, once P1 confirms the night/site.`
      : `Built in ${outRoot}. Re-run with --install to install into AFS4.`,
  );
  return 0;
}

process.exit(main());
