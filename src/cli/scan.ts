// cli/scan.ts — M0 headless scanner. Walks an AFS4 install's scenery/xref/**/*.tmi, builds
// the catalog, writes catalog.json, and prints the per-bundle table plus the M0 acceptance
// checks (911 objects, ACT cross-check, geo parity, ≥95% categorized).
//
//   npm run scan -- --install "<AFS4 install dir>" [--user "<user dir>"] [--out catalog.json]
//                    [--xref-table "<xref_table.csv>"]   (optional official-CSV overlay — see
//                    docs/XREF_TABLE_CSV_DECISION.md; lets you verify the overlay without the app)

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type TmiSource } from "../core/catalog/buildCatalog";
import { buildPlants } from "../core/catalog/plants";
import { loadXrefTable } from "../main/xrefTableSource";
import { findTtx, resolvePlantsDir } from "../main/afs4Paths";
import { encodeLonLat } from "../core/geo/poiName";

interface Args {
  install?: string;
  user?: string;
  out: string;
  xrefTable?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: "catalog.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--install") args.install = argv[++i];
    else if (a === "--user") args.user = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--xref-table") args.xrefTable = argv[++i];
  }
  return args;
}

function findTmi(root: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) findTmi(full, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".tmi")) out.push(full);
  }
  return out;
}

/** Resolve an install root (or a scenery/xref dir) to the directory that holds the .tmi. */
function resolveXrefDir(installArg: string): string | null {
  const candidates = [path.join(installArg, "scenery", "xref"), path.join(installArg, "xref")];
  if (path.basename(installArg).toLowerCase() === "xref") candidates.unshift(installArg);
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isDirectory()) return c;
  }
  if (existsSync(installArg) && findTmi(installArg).length > 0) return installArg;
  return null;
}

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (!args.install) {
    console.error('Usage: npm run scan -- --install "<AFS4 install dir>" [--user <dir>] [--out catalog.json]');
    return 2;
  }

  const xrefDir = resolveXrefDir(args.install);
  if (!xrefDir) {
    console.error(`ERROR: no scenery/xref with .tmi files found under: ${args.install}`);
    return 1;
  }
  console.log(`Scanning XREF: ${xrefDir}\n`);

  const sources: TmiSource[] = findTmi(xrefDir).map((p) => ({
    path: p,
    source: "install" as const,
    text: readFileSync(p, "utf8"),
  }));

  if (args.user) {
    const userXref = resolveXrefDir(args.user);
    if (userXref) {
      for (const p of findTmi(userXref)) {
        sources.push({ path: p, source: "user", text: readFileSync(p, "utf8") });
      }
    }
  }

  // Optional official-CSV overlay. Only loaded when --xref-table is given (the CLI never auto-discovers
  // it) so the M0 acceptance run below stays on the pure-heuristic path by default.
  const load = args.xrefTable ? loadXrefTable([args.xrefTable]) : { table: null, path: null, warnings: [] };
  for (const w of load.warnings) console.warn(`  WARN ${w}`);

  // v0.4 plants: filenames only — `scenery/plants` holds 41 `.ttx` textures and no geometry.
  const plantsDir = resolvePlantsDir(args.install);
  const { plants, warnings: plantWarnings } = buildPlants(
    plantsDir ? findTtx(plantsDir).map((p) => ({ base: path.basename(p, ".ttx") })) : [],
  );

  const { catalog, warnings } = buildCatalog(
    sources,
    {
      installDir: args.install,
      userXrefDir: args.user ?? null,
      scannedAt: new Date().toISOString(),
    },
    [],
    load.table,
    [],
    plants,
  );
  warnings.push(...plantWarnings);

  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, JSON.stringify(catalog, null, 2));

  // ---- report -----------------------------------------------------------------
  console.log(`Found ${catalog.bundles.length} .tmi index file(s).\n`);
  console.log("Per-bundle counts:");
  for (const b of [...catalog.bundles].sort((a, c) => c.count - a.count)) {
    console.log(`  ${b.bundle.padEnd(18)} ${b.count}`);
  }
  console.log(`  ${"TOTAL".padEnd(18)} ${catalog.xref.length}\n`);

  if (catalog.xrefTable) {
    const { matched, rows } = catalog.xrefTable;
    const pct = catalog.xref.length ? ((matched / catalog.xref.length) * 100).toFixed(1) : "0.0";
    console.log(`Official overlay: ${matched}/${catalog.xref.length} scanned objects matched (${pct}%), ${rows} rows in table.\n`);
  }

  const byName = new Map(catalog.xref.map((o) => [o.name, o]));
  const fallbacks = catalog.xref.filter((o) => o.category.startsWith("other/"));
  const nonFallbackPct = catalog.xref.length
    ? (1 - fallbacks.length / catalog.xref.length) * 100
    : 0;

  // v0.4 acceptance: the install ships 41 plant textures and the format bible's plant list has the
  // same 41 group/species pairs. Asserting the count here catches BOTH a scanner regression and an
  // install whose library moved — and it is the only automated check that the two sources still agree.
  const plantGroups = [...new Set(catalog.plants.map((p) => p.group))].sort();
  const tower = byName.get("tower00_small_plates_ds_00_08_08");
  const checks: Array<[string, boolean, string]> = [
    ["exactly 911 objects", catalog.xref.length === 911, `got ${catalog.xref.length}`],
    [
      "exactly 41 plants in 6 groups (matches the bible's list)",
      catalog.plants.length === 41 && plantGroups.length === 6,
      `got ${catalog.plants.length} in ${plantGroups.length}: ${plantGroups.join(", ")}`,
    ],
    [
      "ACT tower cross-check 8.19 x 25.90 m",
      !!tower && Math.abs(tower.size.x - 8.19) < 0.01 && Math.abs(tower.size.z - 25.9) < 0.01,
      tower ? `x=${tower.size.x} y=${tower.size.y} z=${tower.size.z}` : "tower not found",
    ],
    [
      "≥95% categorized (outside other/*)",
      nonFallbackPct >= 95,
      `${nonFallbackPct.toFixed(1)}% (${fallbacks.length} in fallback)`,
    ],
  ];
  for (const [lonlat, want] of [
    [[11.85, 48.376], "e01185n4838"],
    [[-119.88, 39.68], "w11988n3968"],
    [[174.73, -36.85], "e17473s3685"],
  ] as Array<[[number, number], string]>) {
    const got = encodeLonLat(lonlat[0], lonlat[1]);
    checks.push([`encodeLonLat(${lonlat[0]}, ${lonlat[1]})`, got === want, `got ${got}, want ${want}`]);
  }

  console.log("Checks:");
  let allOk = true;
  for (const [label, ok, detail] of checks) {
    console.log(`  [${ok ? "PASS" : "FAIL"}]  ${label}  (${detail})`);
    allOk = allOk && ok;
  }

  if (fallbacks.length > 0) {
    console.log(`\nFallback (other/*) — ${fallbacks.length} object(s) to tune prefix rules:`);
    const byBundle = new Map<string, string[]>();
    for (const o of fallbacks) {
      const list = byBundle.get(o.bundle) ?? [];
      list.push(o.name);
      byBundle.set(o.bundle, list);
    }
    for (const [bundle, names] of byBundle) {
      console.log(`  ${bundle} (${names.length}): ${names.slice(0, 40).join(", ")}${names.length > 40 ? " …" : ""}`);
    }
  }

  console.log(`\nWrote ${args.out}`);
  console.log(allOk ? "\n==> ALL CHECKS PASS" : "\n==> SOME CHECKS FAILED");
  return allOk ? 0 : 1;
}

process.exit(main());
