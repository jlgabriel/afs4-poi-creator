// cli/export.ts — M1b headless exporter. Reads a project.json, resolves object heights, builds
// the POI package (poi.tsl + poi.toc + README) via the pure core, writes it, and optionally
// installs it into the AFS4 user folder's scenery/poi/. This is what generates the POIs for the
// M1 in-sim verification matrix (design §6.2): the writers are golden-tested, the *format* is
// confirmed by flying to the result in the sim.
//
//   npm run export -- <project.json> [--install] [--afs4-dir <dir>]
//                     [--out <dir>] [--base-elevation <metres ASL>]
//
// Heights: objects with { "mode": "asl", "value": m } need nothing. Objects using "terrain" /
// "terrain-offset" need a ground elevation — pass --base-elevation (one value for the whole
// POI, the offline/manual path). The networked elevation lookup arrives with the Electron shell.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExportPlan, Project } from "../core/project/types";
import { planExport } from "../core/export/planExport";
import { NeedsElevationError, resolveHeightsFlat } from "../core/export/heights";
import { isSafePoiFolderName } from "../core/geo/poiName";

interface Args {
  project?: string;
  install: boolean;
  afs4Dir?: string;
  out: string;
  baseElevation: number | null;
  baseElevationRaw?: string; // kept only to quote the bad value back in the error
}

function parseArgs(argv: string[]): Args {
  const args: Args = { install: false, out: "build", baseElevation: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--install") args.install = true;
    else if (a === "--afs4-dir") args.afs4Dir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--base-elevation") {
      args.baseElevationRaw = argv[++i];
      args.baseElevation = Number(args.baseElevationRaw);
    } else if (!a.startsWith("--") && !args.project) args.project = a;
  }
  return args;
}

/** AFS4 user folder (the directory holding scenery/), per OS. Windows Documents redirection to
 *  OneDrive is a known gap (design R5); pass --afs4-dir if this default is wrong. */
function afs4UserDir(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Aerofly FS 4");
  }
  if (process.platform === "win32") return path.join(home, "Documents", "Aerofly FS 4");
  return path.join(home, "Aerofly FS 4");
}

function loadProject(file: string): Project {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (raw?.app !== "pct" || !Array.isArray(raw.objects)) {
    throw new Error(`not a PCT project (expected app:"pct" and an objects[] array)`);
  }
  if (typeof raw.poiName !== "string" || raw.poiName.length === 0) {
    throw new Error(`missing "poiName" (the folder slug, e.g. "munich_test")`);
  }
  return raw as Project;
}

function writePlan(plan: ExportPlan, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const f of plan.files) {
    const p = path.join(outDir, f.relPath);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, f.content, "utf8"); // keep \n line endings — AFS4 text files use LF
  }
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project) {
    console.error(
      "Usage: npm run export -- <project.json> [--install] [--afs4-dir <dir>] [--out <dir>] [--base-elevation <m>]",
    );
    return 2;
  }
  // `Number("584m")` / a missing value → NaN, which sailed straight through resolveHeightsFlat and got
  // emitted as the literal text "NaN" in the .toc's position — a POI the sim silently won't place, and the
  // headless path the in-sim gate probes are built with. Fail loudly instead.
  if (args.baseElevation !== null && !Number.isFinite(args.baseElevation)) {
    console.error(
      `ERROR: --base-elevation expects a number in metres ASL, got ${JSON.stringify(args.baseElevationRaw ?? "")}.`,
    );
    return 2;
  }

  let project: Project;
  try {
    project = loadProject(args.project);
  } catch (e) {
    console.error(`ERROR reading ${args.project}: ${(e as Error).message}`);
    return 1;
  }

  let resolved;
  try {
    resolved = resolveHeightsFlat(project.objects, args.baseElevation);
  } catch (e) {
    if (e instanceof NeedsElevationError) {
      console.error(`ERROR: ${e.points.length} object(s) use a terrain-relative height but no elevation was given.`);
      console.error(`       Pass --base-elevation <metres ASL> (ground height at the POI), or set those`);
      console.error(`       objects to { "mode": "asl", "value": <m> } in the project.`);
      return 1;
    }
    throw e;
  }

  const plan = planExport(project, resolved);
  for (const w of plan.warnings) console.warn(`WARNING: ${w}`);

  // Guard the folder name before it is ever used as a path to write into or delete.
  if (!isSafePoiFolderName(plan.folderName)) {
    console.error(`ERROR: unsafe POI folder name "${plan.folderName}".`);
    console.error(`       poiName must be a lowercase slug [a-z0-9_]+ and the reference coordinates valid.`);
    return 1;
  }

  const outDir = path.resolve(args.out, plan.folderName);
  writePlan(plan, outDir);
  console.log(`Built POI: ${outDir}`);
  console.log(`  ${resolved.length} object(s) → folder ${plan.folderName}`);
  for (const f of plan.files) console.log(`    ${f.relPath}`);

  if (args.install) {
    const userDir = args.afs4Dir ? path.resolve(args.afs4Dir) : afs4UserDir();
    if (!existsSync(userDir)) {
      console.error(`\nERROR: AFS4 user folder not found at ${userDir}. Pass --afs4-dir <path>.`);
      return 1;
    }
    const poiRoot = path.join(userDir, "scenery", "poi");
    const dest = path.join(poiRoot, plan.folderName); // folderName already validated → safe
    mkdirSync(poiRoot, { recursive: true });
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(outDir, dest, { recursive: true });
    console.log(`\nInstalled POI to: ${dest}`);
    console.log(`Restart Aerofly FS 4, then fly to the POI area.`);
  } else {
    console.log(`\nTo install into AFS4: re-run with --install`);
  }

  return 0;
}

process.exit(main());
