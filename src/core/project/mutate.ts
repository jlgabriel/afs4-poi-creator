// mutate.ts — pure project mutations (design §1.3, §3.6).
//
// Every editor edit funnels through one of these `(Project, …) => Project` functions. They are
// PURE and IMMUTABLE: the input project is never touched, a fresh object is returned, and
// `modifiedAt` is bumped only when something actually changed (a no-op on a missing id returns the
// same reference, so the store's undo stack stays clean). The store is what wraps these with
// undo-snapshots + the 500 ms debounced autosave; keeping the transforms pure makes them trivially
// testable and replayable. The one impure seam is id minting (createXref / duplicateObject), which
// accepts an override so tests stay deterministic.

import type {
  HeightSpec,
  LonLat,
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedXref,
  PoiShift,
  Project,
  Vec3,
} from "./types";

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

/** A fresh airport light with sensible defaults (terrain height, orientation 0, the fixture's own
 *  default colour, night group 0). `typeName` is a CatalogAirportLight name (no "al_"). */
export function createAirportLight(
  typeName: string,
  position: LonLat,
  overrides: Partial<PlacedAirportLight> = {},
): PlacedAirportLight {
  const base: PlacedAirportLight = {
    id: overrides.id ?? randomId(),
    kind: "airport_light",
    typeName,
    position: overrides.position ?? position,
    height: overrides.height ?? { mode: "terrain" },
    orientation: overrides.orientation !== undefined ? norm360(overrides.orientation) : 0,
    configuration: overrides.configuration ?? "",
    groupIndex: overrides.groupIndex ?? 0,
  };
  if (overrides.label !== undefined && overrides.label !== "") base.label = overrides.label;
  if (overrides.locked) base.locked = true;
  return base;
}

/** A fresh parametric point light. Defaults to steady white at a middling intensity, lifted +3 m off
 *  the terrain so a point light isn't buried at ground level (unlike a fixture that sits on it). */
export function createLight(
  position: LonLat,
  overrides: Partial<PlacedLight> = {},
): PlacedLight {
  const base: PlacedLight = {
    id: overrides.id ?? randomId(),
    kind: "light",
    position: overrides.position ?? position,
    height: overrides.height ?? { mode: "terrain-offset", offset: 3 },
    color: overrides.color ?? [1, 1, 1],
    intensity: overrides.intensity ?? 1000,
    flashing: overrides.flashing ?? [0, 0, 0, 0],
    groupIndex: overrides.groupIndex ?? 0,
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

/** Apply `patch` to the object with `id`, bumping modifiedAt. If no object matches — OR the patch
 *  returns the SAME reference (a kind-specific mutation that doesn't apply to this object's kind, e.g.
 *  scaling a light) — return the project unchanged (same reference) so callers/undo detect the no-op. */
function updateOne(
  project: Project,
  id: string,
  patch: (o: PlacedObject) => PlacedObject,
  now: string,
): Project {
  let changed = false;
  const objects = project.objects.map((o) => {
    if (o.id !== id) return o;
    const next = patch(o);
    if (next !== o) changed = true;
    return next;
  });
  return changed ? { ...project, objects, modifiedAt: now } : project;
}

// ── Object mutations ─────────────────────────────────────────────────────────

export function addObject(project: Project, obj: PlacedObject, now = nowIso()): Project {
  return { ...project, objects: [...project.objects, obj], modifiedAt: now };
}

export function removeObject(project: Project, id: string, now = nowIso()): Project {
  const objects = project.objects.filter((o) => o.id !== id);
  return objects.length === project.objects.length
    ? project
    : { ...project, objects, modifiedAt: now };
}

/** Copy an object with a fresh id, appended. `overrides` is limited to the kind-agnostic fields a
 *  duplicate actually re-pins (a new id + an offset position); the copy keeps the source's kind and
 *  every kind-specific field. */
export function duplicateObject(
  project: Project,
  id: string,
  overrides: { id?: string; position?: LonLat } = {},
  now = nowIso(),
): Project {
  const src = project.objects.find((o) => o.id === id);
  if (!src) return project;
  const copy: PlacedObject = { ...src, ...overrides, id: overrides.id ?? randomId() };
  return { ...project, objects: [...project.objects, copy], modifiedAt: now };
}

export function moveObject(project: Project, id: string, position: LonLat, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, position }), now);
}

/** Set absolute heading, normalised to [0, 360). Drives the xref `direction` and the airport-light
 *  `orientation` (both raw model rotations); a point light has no rotation, so it's a no-op there. One
 *  function so the map's single rotate-handle path stays kind-agnostic. */
export function rotateObject(project: Project, id: string, deg: number, now = nowIso()): Project {
  return updateOne(
    project,
    id,
    (o) =>
      o.kind === "xref"
        ? { ...o, direction: norm360(deg) }
        : o.kind === "airport_light"
          ? { ...o, orientation: norm360(deg) }
          : o,
    now,
  );
}

/** The smallest scale that survives the trip to the `.toc`. The schema only demands a POSITIVE scale, but
 *  tocWriter emits `scale_factor` with 4 decimals — so anything under 0.00005 rounds to the literal text
 *  "0", i.e. a project that loads fine but exports an object scaled to nothing. Clamp the DATA, not the
 *  emit: then the Inspector shows what actually gets written, instead of a number the export quietly lies
 *  about. */
export const SCALE_MIN = 0.0001;

/** Uniform scale — xref only (lights have no scale); a no-op for the light kinds. */
export function scaleObject(project: Project, id: string, scale: number, now = nowIso()): Project {
  const clamped = Math.max(SCALE_MIN, scale);
  return updateOne(project, id, (o) => (o.kind === "xref" ? { ...o, scale: clamped } : o), now);
}

export function setHeight(project: Project, id: string, height: HeightSpec, now = nowIso()): Project {
  return updateOne(project, id, (o) => ({ ...o, height }), now);
}

// ── Airport-light / light field setters (v0.2; kind-guarded → no-op on the wrong kind) ─────────────

export function setAirportLightType(project: Project, id: string, typeName: string, now = nowIso()): Project {
  return updateOne(project, id, (o) => (o.kind === "airport_light" ? { ...o, typeName } : o), now);
}

/** Colour letters (0–2 of b/g/r/w/y). Empty = the fixture's own default colour. */
export function setConfiguration(project: Project, id: string, configuration: string, now = nowIso()): Project {
  return updateOne(project, id, (o) => (o.kind === "airport_light" ? { ...o, configuration } : o), now);
}

export function setLightColor(project: Project, id: string, color: Vec3, now = nowIso()): Project {
  return updateOne(project, id, (o) => (o.kind === "light" ? { ...o, color } : o), now);
}

export function setIntensity(project: Project, id: string, intensity: number, now = nowIso()): Project {
  return updateOne(project, id, (o) => (o.kind === "light" ? { ...o, intensity } : o), now);
}

export function setFlashing(
  project: Project,
  id: string,
  flashing: [number, number, number, number],
  now = nowIso(),
): Project {
  return updateOne(project, id, (o) => (o.kind === "light" ? { ...o, flashing } : o), now);
}

/** Night-visibility group — carried by both light kinds. */
export function setGroupIndex(project: Project, id: string, groupIndex: number, now = nowIso()): Project {
  return updateOne(
    project,
    id,
    (o) => (o.kind === "airport_light" || o.kind === "light" ? { ...o, groupIndex } : o),
    now,
  );
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
