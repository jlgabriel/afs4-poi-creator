// xrefTable.ts — the official IPACS `xref_table.csv` → an in-memory lookup, PCT's optional catalog
// overlay (design: docs/XREF_TABLE_CSV_DECISION.md — build-but-disabled until forum #114 settles
// packaging/licence). PURE: text in, typed index out — no filesystem. The loader (main/xrefTableSource)
// owns the read; buildCatalog owns the merge.
//
// The table is metadata only (166 KB of text, zero model/texture bytes) and STRICTLY ADDITIVE: it
// improves displayName / taxonomy / footprint for the ~551 scanned objects it matches and never adds
// objects PCT didn't scan (the "scan your own install" posture stays intact — the merge in buildCatalog
// only consults a scanned entry, never iterates the table).
//
// CSV shape (verified against the real 753-row table, separator ';'):
//   name internal ; display name ; main cat ; sub cat ; type cat ; length ; width ; height ; offset
//     ; <shape vertices…> ; <shape-truescale vertices…>
// `name internal` is LOWERCASE while a scan yields mixed case (A320_aca) → lookup is case-insensitive.
// After the 9 scalar fields, the remaining ';' fields are "x y" vertices forming TWO closed rings:
// first `shape` (normalised ±1), then `shape truescale` (metres); each ring's last vertex repeats its
// first to close. We store the rings OPEN (without the repeat).
//
// Tolerant by contract (mirrors tmiParser/userTmb): a row is dropped only when it has no name or fewer
// than the 9 scalar fields; everything else degrades to a warning + safe default (footprint alone is
// dropped on a malformed vertex run) so one bad cell never costs a row its official name/taxonomy.
// parseXrefTable never throws.

import type { Vec3 } from "../project/types";

/** One official object row. `size`/`offset` are model metadata (not merged into the catalog in this
 *  phase — the bbox stays authoritative from the `.tmi`); `footprint` (truescale, metres) is the real
 *  polygon the `.tmi` cannot provide — the footprint-glyph feature (#86-2). Rings are stored OPEN. */
export interface XrefTableEntry {
  name: string; // as in the CSV (lowercase); the lookup key is name.toLowerCase()
  displayName: string; // official IPACS label — no heuristic can reproduce these (car_00→"Car 00")
  taxonomy: { main: string; sub: string; type: string }; // 3-level, e.g. Aircraft / Airliner / A320
  size: { length: number; width: number; height: number }; // metres, from the CSV (may be NaN if absent)
  offset: Vec3; // model offset (x y z), metres
  footprintUnit?: [number, number][]; // `shape` ring, normalised ±1 (open)
  footprint?: [number, number][]; // `shape truescale` ring, model-local metres x/y (open)
}

/** The parsed table: a case-insensitive name→row index plus counters and any warnings. Built at scan
 *  time and discarded after the catalog is enriched — never serialised (only CatalogObject is cached). */
export interface XrefTable {
  byName: Map<string, XrefTableEntry>; // key = name.toLowerCase()
  rows: number; // rows accepted into byName
  warnings: string[];
}

const SCALAR_FIELDS = 9; // name, display, main, sub, type, length, width, height, offset

/** Parse "x y z" into a Vec3. Returns ok:false (offset [0,0,0]) on anything but three finite numbers. */
function parseOffset(field: string): { offset: Vec3; ok: boolean } {
  const parts = field.trim().split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return { offset: [0, 0, 0], ok: false };
  return { offset: [parts[0], parts[1], parts[2]], ok: true };
}

/** Split the vertex fields (everything after `offset`) into the CSV's rings. A ring closes when a
 *  vertex repeats the ring's first vertex (the repeat is dropped → open ring). ok:false means a vertex
 *  wasn't a clean "x y" pair or the last ring never closed → the caller drops the footprint entirely. */
function parseRings(vertFields: string[]): { rings: [number, number][][]; ok: boolean } {
  const rings: [number, number][][] = [];
  let cur: [number, number][] = [];
  let firstTok: string | null = null;
  for (const raw of vertFields) {
    const tok = raw.trim();
    if (tok === "") continue; // tolerate a trailing empty field (line-ending ';' or padding)
    if (firstTok !== null && tok === firstTok) {
      rings.push(cur); // closing vertex — finish this ring, drop the repeat
      cur = [];
      firstTok = null;
      continue;
    }
    const parts = tok.split(/\s+/);
    if (parts.length !== 2) return { rings, ok: false };
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) return { rings, ok: false };
    if (firstTok === null) firstTok = tok;
    cur.push([x, y]);
  }
  return { rings, ok: cur.length === 0 }; // a leftover open ring = the last ring never closed
}

/** Parse the official `xref_table.csv` text into a case-insensitive lookup. Never throws. */
export function parseXrefTable(csv: string): XrefTable {
  const warnings: string[] = [];
  const byName = new Map<string, XrefTableEntry>();
  const clean = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv; // tolerate a leading BOM
  const lines = clean.split(/\r?\n/);

  let start = 0;
  if (lines.length > 0 && /name\s*internal/i.test(lines[0])) {
    start = 1; // header row
  } else {
    warnings.push("xref_table: header row not recognised — parsing best-effort from line 1");
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue; // blank/trailing line
    const f = line.split(";");
    if (f.length < SCALAR_FIELDS) {
      warnings.push(`xref_table line ${i + 1}: ${f.length} field(s), need ${SCALAR_FIELDS} — skipped`);
      continue;
    }
    const name = f[0].trim();
    if (name === "") {
      warnings.push(`xref_table line ${i + 1}: empty name — skipped`);
      continue;
    }
    const key = name.toLowerCase();
    if (byName.has(key)) {
      warnings.push(`xref_table line ${i + 1}: duplicate name '${name}' — keeping first`);
      continue;
    }

    const displayName = f[1].trim() || name; // never empty — fall back to the raw name
    if (f[1].trim() === "") warnings.push(`xref_table line ${i + 1}: empty display name — using '${name}'`);

    const length = Number(f[5]);
    const width = Number(f[6]);
    const height = Number(f[7]);
    if ([length, width, height].some((n) => Number.isNaN(n))) {
      warnings.push(`xref_table line ${i + 1} ('${name}'): non-numeric size — kept, size is NaN`);
    }

    const { offset, ok: offsetOk } = parseOffset(f[8]);
    if (!offsetOk) warnings.push(`xref_table line ${i + 1} ('${name}'): malformed offset — using 0 0 0`);

    const entry: XrefTableEntry = {
      name,
      displayName,
      taxonomy: { main: f[2].trim(), sub: f[3].trim(), type: f[4].trim() },
      size: { length, width, height },
      offset,
    };

    const { rings, ok: ringsOk } = parseRings(f.slice(SCALAR_FIELDS));
    if (!ringsOk) {
      warnings.push(`xref_table line ${i + 1} ('${name}'): malformed footprint vertices — footprint dropped`);
    } else {
      if (rings[0]) entry.footprintUnit = rings[0];
      if (rings[1]) entry.footprint = rings[1];
    }

    byName.set(key, entry);
  }

  return { byName, rows: byName.size, warnings };
}

/** Case-insensitive lookup of a scanned object name in the table. Null when there is no table (overlay
 *  disabled) or no match — the caller then keeps the heuristic name/category. */
export function lookupXref(table: XrefTable | null | undefined, scannedName: string): XrefTableEntry | null {
  if (!table) return null;
  return table.byName.get(scannedName.toLowerCase()) ?? null;
}
