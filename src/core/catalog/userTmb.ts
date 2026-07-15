// userTmb.ts — a user's plain-text `.tmb` → the geometries it defines (internal name + bounding
// box), the raw material the registrar turns into a generated `.tmi` (design B2). PURE: text in,
// typed geometries out — the filesystem/classification shell lives in main (scan.ts).
//
// User `.tmb` come in two classes (verified against the real pylon/box files, 2026-07-15):
//   • AC3D-exported community objects = PLAIN TEXT in the same <[type][name][value]> grammar PCT
//     already parses. First byte '<'. Name + real bbox are derivable here.
//   • IPACS-compiled objects = OPAQUE BINARY (first byte 0xB5, not '<'). Nothing is derivable; the
//     caller falls back to a filename-only placeholder. This module never sees them (the scan shell
//     classifies by first byte and only passes text-class files here) but degrades safely if it does.
//
// Resolution key = the INTERNAL geometry name, the string a POI `.toc` and the generated `.tmi` both
// reference. The in-sim gate settled this over the earlier file-basename hypothesis. Tolerant by
// contract (mirrors tmiParser): a parse failure, or a geometry with no derivable bbox, degrades with
// a warning to "nothing here" (empty geometries) — which the caller treats as the opaque tier — and
// never throws out of parseUserTmb.

import { parseTm, findAll, child, vec3List, type TmNode } from "../tm/tmParser";
import type { Vec3 } from "../project/types";

/** One registerable geometry found in a plain-text `.tmb`: its exact internal name plus its
 *  axis-aligned bounding box (model-local metres, z up). Structurally a `TmiEntrySpec`, so the
 *  registrar can hand `geometries` straight to `buildTmi` with no mapping. */
export interface UserTmbGeometry {
  name: string;
  bbMin: Vec3;
  bbMax: Vec3;
}

export interface UserTmbResult {
  geometries: UserTmbGeometry[]; // registerable geometries; [] ⇒ caller degrades to the opaque tier
  warnings: string[];
}

// Row-major identity; AC3D exports it as exact integers, so an exact compare is right (and any float
// noise or malformed matrix reads as non-identity → we reject it rather than emit an offset bbox).
const IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** True if `head` — after an optional BOM and leading whitespace — begins with '<', the plain-text
 *  AFS4 grammar. Compiled `.tmb` are binary (first byte 0xB5 in the real IPACS files) → false. The
 *  scan shell calls this on a small head so it never decodes a multi-MB binary in full. */
export function isTextTmb(head: string): boolean {
  let i = head.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < head.length && (head[i] === " " || head[i] === "\t" || head[i] === "\r" || head[i] === "\n")) i++;
  return head[i] === "<";
}

function isIdentityMatrix(node: TmNode | undefined): boolean {
  if (!node) return true; // no matrix child ⇒ no transform
  const parts = node.value.trim().split(/\s+/).map(Number);
  return parts.length === 16 && parts.every((v, i) => v === IDENTITY_4X4[i]);
}

function bboxOf(points: Vec3[]): { bbMin: Vec3; bbMax: Vec3 } {
  const bbMin: Vec3 = [points[0][0], points[0][1], points[0][2]];
  const bbMax: Vec3 = [points[0][0], points[0][1], points[0][2]];
  for (const p of points) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < bbMin[k]) bbMin[k] = p[k];
      if (p[k] > bbMax[k]) bbMax[k] = p[k];
    }
  }
  return { bbMin, bbMax };
}

/** Parse a plain-text `.tmb` into its registerable geometries. v1 derives the bbox from
 *  `mesh_collision.point_list` only (every real community object carries it; the patch-vertex
 *  fallback is a deliberate future add). A geometry is skipped — with a warning, never a throw —
 *  when its name is empty, its matrix is non-identity (the bbox would be offset), or no bbox is
 *  derivable. `geometries: []` is the signal to the caller to degrade this file to the opaque tier. */
export function parseUserTmb(text: string): UserTmbResult {
  const warnings: string[] = [];
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // tolerate a leading BOM

  let root: TmNode;
  try {
    root = parseTm(clean);
  } catch (err) {
    warnings.push(`.tmb parse failed: ${(err as Error).message}`);
    return { geometries: [], warnings };
  }

  // Exact type match: reference/virtual geometry lists are `list_tmxglgeometry_reference`/`_virtual`,
  // so findAll never picks up a non-drawable placeholder here.
  const geomNodes = findAll(root, "tmxglgeometry");
  if (geomNodes.length === 0) {
    warnings.push("no tmxglgeometry — not a renderable .tmb");
    return { geometries: [], warnings };
  }

  const geometries: UserTmbGeometry[] = [];
  for (const g of geomNodes) {
    const name = child(g, "name")?.value ?? "";
    if (name === "") {
      warnings.push("geometry with empty name skipped (not registerable)");
      continue;
    }
    if (!isIdentityMatrix(child(g, "matrix"))) {
      warnings.push(`geometry '${name}': matrix is not identity — not registerable in v1 (bbox would be offset)`);
      continue;
    }
    const mesh = child(g, "mesh_collision");
    const pointNode = mesh ? child(mesh, "point_list") : undefined;
    if (!pointNode) {
      warnings.push(`geometry '${name}': no mesh_collision/point_list — bbox not derivable, skipped`);
      continue;
    }
    let points: Vec3[];
    try {
      points = vec3List(pointNode);
    } catch (err) {
      warnings.push(`geometry '${name}': ${(err as Error).message} — skipped`);
      continue;
    }
    if (points.length === 0) {
      warnings.push(`geometry '${name}': empty point_list — bbox not derivable, skipped`);
      continue;
    }
    geometries.push({ name, ...bboxOf(points) });
  }

  return { geometries, warnings };
}
