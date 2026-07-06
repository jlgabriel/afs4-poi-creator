// tmiParser.ts — a scanned `.tmi` index → typed object entries.
// Tolerant by contract: a malformed entry is skipped with a warning, never aborting the
// whole bundle, and a whole-file grammar failure yields an empty result, not a throw
// (M0 acceptance #4).

import { parseTm, findAll, child, vec3 } from "../tm/tmParser";
import type { Vec3 } from "../project/types";

export interface TmiEntry {
  name: string;
  bbMin: Vec3;
  bbMax: Vec3;
  bsCenter: Vec3;
  bsRadius: number;
}

export interface TmiParseResult {
  bundle: string; // filename from tmxglscene_info, e.g. "xref_buildings"
  entries: TmiEntry[];
  warnings: string[];
}

export function parseTmi(text: string): TmiParseResult {
  const warnings: string[] = [];

  let root;
  try {
    root = parseTm(text);
  } catch (err) {
    warnings.push(`tmi parse failed: ${(err as Error).message}`);
    return { bundle: "?", entries: [], warnings };
  }

  const infos = findAll(root, "tmxglscene_info");
  const bundle = infos.length > 0 ? (child(infos[0], "filename")?.value ?? "?") : "?";

  const entries: TmiEntry[] = [];
  for (const e of findAll(root, "tmxglscene_info_entry")) {
    try {
      const nameNode = child(e, "name");
      if (!nameNode || nameNode.value === "") {
        warnings.push("entry missing 'name' — skipped");
        continue;
      }
      const bbMinNode = child(e, "bb_min");
      const bbMaxNode = child(e, "bb_max");
      if (!bbMinNode || !bbMaxNode) {
        warnings.push(`entry '${nameNode.value}' missing bb_min/bb_max — skipped`);
        continue;
      }
      const bsCenterNode = child(e, "bs_center");
      const bsRadiusNode = child(e, "bs_radius");
      entries.push({
        name: nameNode.value,
        bbMin: vec3(bbMinNode),
        bbMax: vec3(bbMaxNode),
        bsCenter: bsCenterNode ? vec3(bsCenterNode) : [0, 0, 0],
        bsRadius: bsRadiusNode ? Number(bsRadiusNode.value) || 0 : 0,
      });
    } catch (err) {
      const name = child(e, "name")?.value ?? "?";
      warnings.push(`entry '${name}' malformed (${(err as Error).message}) — skipped`);
    }
  }

  return { bundle, entries, warnings };
}
