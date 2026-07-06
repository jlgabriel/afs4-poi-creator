// cli/scan.ts — M0 headless scanner. Walks an AFS4 install's scenery/xref/**/*.tmi, builds
// the catalog, writes catalog.json, and prints the per-bundle table plus the M0 acceptance
// checks (911 objects, ACT cross-check, geo parity, ≥95% categorized).
//
//   npm run scan -- --install "<AFS4 install dir>" [--user "<user dir>"] [--out catalog.json]

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildCatalog, type TmiSource } from "../core/catalog/buildCatalog";
import { encodeLonLat } from "../core/geo/poiName";

interface Args {
  install?: string;
  user?: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: "catalog.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--install") args.install = argv[++i];
    else if (a === "--user") args.user = argv[++i];
    else if (a === "--out") args.out = argv[++i];
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

  const { catalog, warnings } = buildCatalog(sources, {
    installDir: args.install,
    userXrefDir: args.user ?? null,
    scannedAt: new Date().toISOString(),
  });

  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, JSON.stringify(catalog, null, 2));

  // ---- report -----------------------------------------------------------------
  console.log(`Found ${catalog.bundles.length} .tmi index file(s).\n`);
  console.log("Per-bundle counts:");
  for (const b of [...catalog.bundles].sort((a, c) => c.count - a.count)) {
    console.log(`  ${b.bundle.padEnd(18)} ${b.count}`);
  }
  console.log(`  ${"TOTAL".padEnd(18)} ${catalog.xref.length}\n`);

  const byName = new Map(catalog.xref.map((o) => [o.name, o]));
  const fallbacks = catalog.xref.filter((o) => o.category.startsWith("other/"));
  const nonFallbackPct = catalog.xref.length
    ? (1 - fallbacks.length / catalog.xref.length) * 100
    : 0;

  const tower = byName.get("tower00_small_plates_ds_00_08_08");
  const checks: Array<[string, boolean, string]> = [
    ["exactly 911 objects", catalog.xref.length === 911, `got ${catalog.xref.length}`],
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
