// mutate.ts — pure project mutations (design §1.3, §3.6).
//
// Every editor edit funnels through one of these `(Project, …) => Project` functions. They are
// PURE and IMMUTABLE: the input project is never touched, a fresh object is returned, and
// `modifiedAt` is bumped only when something actually changed (a no-op on a missing id returns the
// same reference, so the store's undo stack stays clean). The store is what wraps these with
// undo-snapshots + the 500 ms debounced autosave; keeping the transforms pure makes them trivially
// testable and replayable. The one impure seam is id minting (createXref / duplicateObject), which
// accepts an override so tests stay deterministic.

import type { HeightSpec, LonLat, PlacedXref, PoiShift, Project } from "./types";

const nowIso = (): string => new Date().toISOString();

/** Wrap a compass angle into [0, 360). Shared with footprint semantics (clockwise, 0 = North). */
const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

/** A random object id. Uses the Web Crypto API present in both Node ≥19 and the browser renderer,
 *  so the pure core needs no Node-only import. */
const randomId = (): string => globalThis.crypto.randomUUID();

// ── Factories ────────────────────────────────────────────────────────────────

/** A fresh placed xref with sensible defaults (terrain height, direction 0, scale 1). `overrides`
 *  can pin any field — pass `{ id }` in tests for determinism. Direction is normalised. */
export function createXref(
  name: string,
  position: LonLat,
  overrides: Partial<PlacedXref> = {},
): PlacedXref {
  const base: PlacedXref = {
    id: overrides.id ?? randomId(),
    kind: "xref",
    name,
    position: overrides.position ?? position,
    height: overrides.height ?? { mode: "terrain" },
    direction: overrides.direction !== undefined ? norm360(overrides.direction) : 0,
    scale: overrides.scale ?? 1,
  };
  if (overrides.label !== undefined && overrides.label !== "") base.label = overrides.label;
  if (overrides.locked) base.locked = true;
  return base;
}

/** A fresh empty project with M1 defaults. Used by the first-run wizard and New Project. */
export function createProject(params: {
  name: string;
  poiName?: string;
  camera: Project["camera"];
  reference?: LonLat | null;
  now?: string;
}): Project {
  const now = params.now ?? nowIso();
  return {
    schemaVersion: 1,
    app: "pct",
    name: params.name,
    poiName: params.poiName ?? "",
    createdAt: now,
    modifiedAt: now,
    reference: params.reference ?? null,
    camera: params.camera,
    objects: [],
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Apply `patch` to the object with `id`, bumping modifiedAt. If no object matches, return the
 *  project unchanged (same reference) so callers/undo can detect the no-op. */
function updateOne(
  project: Project,
  id: string,
  patch: (o: PlacedXref) => PlacedXref,
  now: string,
): Project {
  let hit = false;
  const objects = project.objects.map((o) => {
    if (o.id !== id) return o;
    hit = true;
    return patch(o);
  });
  return hit ? { ...project, objects, modifiedAt: now } : project;
}

// ── Object mutations ─────────────────────────────────────────────────────────

export function addObject(project: Project, xref: PlacedXref, now = nowIso()): Project {
  return { ...project, objects: [...project.objects, xref], modifiedAt: now };
}

export function removeObject(project: Project, id: string, now = nowIso()): Project {
  const objects = project.objects.filter((o) => o.id !== id);
  return objects.length === project.objects.length
    ? project
    : { ...project, objects, modifiedAt: now };
}

export function duplicateObject(
  project: Project,
  id: string,
  overrides: Partial<PlacedXref> = {},
  now = nowIso(),
): Project {
  const src = project.objects.find((o) => o.id === id);
  if (!src) return project;
  const copy: PlacedXref = { ...src, ...overrides, id: overrides.id ?? randomId() };
  return { ...project, objects: [...project.objects, copy], modifiedAt: now };
}

export function moveObject(project: Project, id: string, position: LonLat, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, position }), now);
}

/** Set absolute heading; the value is normalised to [0, 360) (clockwise, 0 = North). */
export function rotateObject(project: Project, id: string, direction: number, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, direction: norm360(direction) }), now);
}

export function scaleObject(project: Project, id: string, scale: number, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, scale }), now);
}

export function setHeight(project: Project, id: string, height: HeightSpec, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, height }), now);
}

/** Set or clear the optional note. An empty/undefined label removes the field. */
export function setLabel(project: Project, id: string, label: string | undefined, now = nowIso()): Project {
  return updateOne(
    project,
    id,
    (o) => {
      const next = { ...o };
      if (label === undefined || label === "") delete next.label;
      else next.label = label;
      return next;
    },
    now,
  );
}

/** Lock (ignore drags) or unlock. Unlocked objects drop the field entirely (default = unlocked). */
export function setLocked(project: Project, id: string, locked: boolean, now = nowIso()): Project {
  return updateOne(
    project,
    id,
    (o) => {
      const next = { ...o };
      if (locked) next.locked = true;
      else delete next.locked;
      return next;
    },
    now,
  );
}

// ── Project-level mutations ──────────────────────────────────────────────────

export function setReference(project: Project, reference: LonLat | null, now = nowIso()): Project {
  return { ...project, reference, modifiedAt: now };
}

export function renameProject(project: Project, name: string, now = nowIso()): Project {
  return { ...project, name, modifiedAt: now };
}

export function setPoiName(project: Project, poiName: string, now = nowIso()): Project {
  return { ...project, poiName, modifiedAt: now };
}

/** Set the global export shift (metres, east/north). Applied to every object's position at export
 *  (planExport); stored on the document so a Save/reopen remembers it. */
export function setShift(project: Project, shift: PoiShift, now = nowIso()): Project {
  return { ...project, shift, modifiedAt: now };
}

/** Persist the last map view. View state, but it lives in the document, so it bumps modifiedAt;
 *  the store decides whether a pan/zoom belongs on the undo stack (design §3.6). */
export function setCamera(project: Project, camera: Project["camera"], now = nowIso()): Project {
  return { ...project, camera, modifiedAt: now };
}
