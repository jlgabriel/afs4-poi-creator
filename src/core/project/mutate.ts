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
  AirportPad,
  AirportParking,
  AirportRunway,
  AirportRunwayEnd,
  HeightMode,
  HeightSpec,
  LonLat,
  ParkingType,
  PlacedAirportLight,
  PlacedLight,
  PlacedObject,
  PlacedPlant,
  PlacedXref,
  PoiShift,
  Project,
  ProjectAirport,
  Vec3,
} from "./types";
import { DEFAULT_PARKING_SIZE_M, DEFAULT_RUNWAY_WIDTH_M, parkingsOf, runwaysOf } from "./airport";

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

/** A fresh placed plant (v0.4). `naturalHeight` is the height decoded from the texture's own filename
 *  (CatalogPlant.naturalHeight) — the caller has it in hand from the catalog.
 *
 *  Two defaults worth their reasoning:
 *
 *  • `height: { mode: "terrain" }` — a tree stands ON the ground. (Contrast createLight, which floats
 *    its default 3 m up.) This is the mode the whole app already resolves to ASL at export.
 *
 *  • `heightRange: [naturalHeight, naturalHeight]` — NOT the bible's `[0, 0]`. The bible shows `[0 0]`
 *    as the plant element's default, but that same template shows `position [0.000000 0.000000]`, which
 *    is plainly a placeholder rather than a working value — so `[0 0]` may well mean "a plant 0 metres
 *    tall", i.e. invisible. We never have to find out: the natural height is right there in the
 *    filename, so writing it explicitly is correct under every reading of the field. If height_range
 *    scales, this reproduces the texture's own size; if it's ignored, so is this. The in-sim gate (P2)
 *    settles what `[0 0]` means, but nothing PCT emits depends on the answer. */
export function createPlant(
  group: string,
  species: string,
  naturalHeight: number,
  position: LonLat,
  overrides: Partial<PlacedPlant> = {},
): PlacedPlant {
  const base: PlacedPlant = {
    id: overrides.id ?? randomId(),
    kind: "plant",
    group: overrides.group ?? group,
    species: overrides.species ?? species,
    position: overrides.position ?? position,
    height: overrides.height ?? { mode: "terrain" },
    heightRange: overrides.heightRange ?? [naturalHeight, naturalHeight],
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

// ── Plant field setters (v0.4; kind-guarded → no-op on the wrong kind) ─────────────────────────────

/** The plant's `height_range` — how TALL it grows, which is a different axis from `height` (where its
 *  base sits). v0.4 places one plant at a time, so the editor always sends MIN = MAX: a range would
 *  randomise, and a precision tool wants the number the user typed. The pair is kept in the model
 *  because it IS the field's shape, and a future scatter/forest brush is exactly where MIN ≠ MAX earns
 *  its keep. */
export function setPlantHeightRange(
  project: Project,
  id: string,
  heightRange: [number, number],
  now = nowIso(),
): Project {
  return updateOne(project, id, (o) => (o.kind === "plant" ? { ...o, heightRange } : o), now);
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

/** Set the export height mode (types.ts HeightMode). The default "baked-asl" is stored as ABSENT — same
 *  rule as setShift's zero — so a project that never touched the toggle stays byte-identical on save and
 *  the existing goldens don't move. A no-op (setting the mode it already has) returns the same reference. */
export function setHeightMode(project: Project, mode: HeightMode, now = nowIso()): Project {
  const current = project.heightMode ?? "baked-asl";
  if (current === mode) return project;
  const next = { ...project, modifiedAt: now };
  if (mode === "autoheight") next.heightMode = "autoheight";
  else delete next.heightMode;
  return next;
}

/** Persist the last map view. View state, but it lives in the document, so it bumps modifiedAt;
 *  the store decides whether a pan/zoom belongs on the undo stack (design §3.6). */
export function setCamera(project: Project, camera: Project["camera"], now = nowIso()): Project {
  return { ...project, camera, modifiedAt: now };
}

// ── The airport block (v1.2, forum #170) ─────────────────────────────────────
//
// Four mutations rather than one setter because they have different sources: the DIALOG writes the whole
// block, while the MAP drags the pad and turns it. Splitting them keeps the map from having to know an
// identity it never shows, and keeps a drag from being able to clobber a code the user just typed.

/** Keep `airport.pad` equal to `pads[0]` (types.ts explains why the mirror exists). EVERY writer below
 *  funnels through here, so no path can produce a block whose mirror has drifted — an older PCT reading
 *  a stale mirror would put the helipad somewhere the user moved it away from. */
function withPadMirror(airport: ProjectAirport): ProjectAirport {
  const first = airport.pads[0];
  if (first === undefined) {
    if (airport.pad === undefined) return airport;
    const next = { ...airport };
    delete next.pad;
    return next;
  }
  return airport.pad === first ? airport : { ...airport, pad: first };
}

/** Adopt (or drop, with `null`) the whole airport block. The dialog's writer: identity plus pads in one
 *  commit, because the user typed them together. Absent ≡ "this project is POI-only" — the same
 *  absent-means-default rule `shift` and `heightMode` follow, so a project that never opened the
 *  heliport dialog stays byte-identical on save. */
export function setAirport(project: Project, airport: ProjectAirport | null, now = nowIso()): Project {
  if (airport === null) {
    if (project.airport === undefined) return project;
    const next = { ...project, modifiedAt: now };
    delete next.airport;
    return next;
  }
  return { ...project, airport: withPadMirror(airport), modifiedAt: now };
}

/** The airport's OWN point (types.ts ProjectAirport.position), independent of any pad. `null` clears it,
 *  which puts the block back on "follow the first pad" — the v1.2/v1.3 behaviour. */
export function setAirportPosition(project: Project, position: LonLat | null, now = nowIso()): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  if (position === null) {
    if (airport.position === undefined) return project;
    const next = { ...airport };
    delete next.position;
    return { ...project, airport: next, modifiedAt: now };
  }
  return { ...project, airport: { ...airport, position }, modifiedAt: now };
}

/** IATA code (forum #220). Empty string clears it — the `.wad` row is written either way, just blank. */
export function setAirportIata(project: Project, iata: string, now = nowIso()): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  if ((airport.iata ?? "") === iata) return project;
  if (iata === "") {
    const next = { ...airport };
    delete next.iata;
    return { ...project, airport: next, modifiedAt: now };
  }
  return { ...project, airport: { ...airport, iata }, modifiedAt: now };
}

/** A fresh pad, unnamed and facing true north. Unnamed is not a placeholder: the writer renders it as
 *  "FATO/TLOF", the literal v1.2/v1.3 always emitted, so a one-pad project's files do not move. */
function newPad(position: LonLat, radius: number, id = randomId()): AirportPad {
  return { id, name: "", position, heading: 0, radius };
}

/** Put the FIRST pad AT `position`, creating the airport block if the project has none. The one mutation
 *  allowed to bring the block into being from a map gesture, and it is deliberate: in v1.3 the pad is
 *  placed from the catalog like any other object (forum #173), so "click the map" is the user asking
 *  for it in as many words.
 *
 *  It still invents no IDENTITY — icao, name and country come in empty and the install refuses until
 *  they are filled, which is the rule heliportTemplate exists to keep. `updatePad` below stays a no-op
 *  on a padless project on purpose: a DRAG is not a request for an airport.
 *
 *  ⚠️ Placing again MOVES the first pad rather than adding a second — the v1.3 behaviour, kept because
 *  the v1.3 UI is still the one calling this and it has exactly one pad card. `addAirportPad` is the
 *  mutation that grows the list, and it is what the reworked AIRPORT menu (forum #219/#221, where
 *  HELICOPTER is repeatable) will call instead. */
export function placeAirportPad(
  project: Project,
  position: LonLat,
  defaultRadius: number,
  now = nowIso(),
): Project {
  const airport = project.airport;
  if (airport === undefined) {
    const pad = newPad(position, defaultRadius);
    return {
      ...project,
      airport: { icao: "", name: "", country: "", pads: [pad], pad },
      modifiedAt: now,
    };
  }
  if (airport.pads.length === 0) return addAirportPad(project, position, defaultRadius, now);
  return moveAirportPad(project, position, now);
}

/** APPEND a pad (forum #221 — "this element can now be used as often as desired"; his SCLC ships three).
 *  Creates the airport block when there is none, same rule as placeAirportPad. */
export function addAirportPad(
  project: Project,
  position: LonLat,
  defaultRadius: number,
  now = nowIso(),
  id?: string,
): Project {
  const pad = newPad(position, defaultRadius, id);
  const airport = project.airport;
  const next: ProjectAirport =
    airport === undefined
      ? { icao: "", name: "", country: "", pads: [pad] }
      : { ...airport, pads: [...airport.pads, pad] };
  return { ...project, airport: withPadMirror(next), modifiedAt: now };
}

/** Drop a pad by id. A pad-less airport stays a valid block — his "(1) DATA" example is an airport with
 *  no pads — so this never deletes the airport itself. */
export function removeAirportPad(project: Project, padId: string, now = nowIso()): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const pads = airport.pads.filter((p) => p.id !== padId);
  if (pads.length === airport.pads.length) return project;
  return { ...project, airport: withPadMirror({ ...airport, pads }), modifiedAt: now };
}

/** Apply `patch` to one pad. A project with no airport block has no pad to move, so this returns the
 *  same reference and the map's drag is a silent no-op rather than an invented airport — PCT never picks
 *  an identity (see heliportTemplate), and creating one from a drag would do exactly that.
 *
 *  `padId` undefined targets the FIRST pad, which is what every v1.3 caller means: that UI knows one. */
function updatePad(
  project: Project,
  patch: (pad: AirportPad) => AirportPad,
  now: string,
  padId?: string,
): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const i = padId === undefined ? 0 : airport.pads.findIndex((p) => p.id === padId);
  const current = i < 0 ? undefined : airport.pads[i];
  if (current === undefined) return project;
  const pad = patch(current);
  if (pad === current) return project;
  const pads = [...airport.pads];
  pads[i] = pad;
  return { ...project, airport: withPadMirror({ ...airport, pads }), modifiedAt: now };
}

/** Drag a pad to a new centre. */
export function moveAirportPad(project: Project, position: LonLat, now = nowIso(), padId?: string): Project {
  return updatePad(project, (pad) => ({ ...pad, position }), now, padId);
}

/** Turn a pad. `heading` is TRUE compass degrees, normalised into [0, 360) like every other facing
 *  in the model — the sim's `heading` field is true (gate 2026-07-31), so it is written verbatim and
 *  what the user sees on the map is what the file gets. */
export function rotateAirportPad(project: Project, heading: number, now = nowIso(), padId?: string): Project {
  const h = norm360(heading);
  return updatePad(project, (pad) => (pad.heading === h ? pad : { ...pad, heading: h }), now, padId);
}

/** Resize a pad. Metres — the sim shows the diameter, so radius 10 reads as "Size 66 ft / 20 m".
 *  Non-positive is refused rather than clamped: it comes from a number field, and a silently corrected
 *  value is how you end up not noticing you typed one. */
export function setAirportPadRadius(
  project: Project,
  radius: number,
  now = nowIso(),
  padId?: string,
): Project {
  if (!(Number.isFinite(radius) && radius > 0)) return project;
  return updatePad(project, (pad) => (pad.radius === radius ? pad : { ...pad, radius }), now, padId);
}

/** Name a pad (forum #221 — "the name can be freely assigned"; it is what LOCATION shows). Empty is
 *  legal and means unnamed, which the writer renders as "FATO/TLOF". */
export function setAirportPadName(project: Project, name: string, now = nowIso(), padId?: string): Project {
  return updatePad(project, (pad) => (pad.name === name ? pad : { ...pad, name }), now, padId);
}

// ── Runways (v1.4, forum #217 submenu (4)) ─────────────────────────────────────────────────────────
//
// A runway is a PAIR: the format has no single-ended one, so every mutation below addresses an end by
// index (0 or 1) rather than letting the list grow. Same no-mirror, required-id rules as the stands.

/** A fresh end: no displaced threshold, no lights, usable both ways — the defaults every runway end in
 *  ApfelFlieger's files carries. */
function newRunwayEnd(endpoint: LonLat, identifier: string): AirportRunwayEnd {
  return {
    endpoint,
    threshold: endpoint,
    identifier,
    appltsys: "none",
    papi: "none",
    reil: "none",
    approach: true,
    takeoff: true,
  };
}

/** A runway between two points. `identifiers` is a pair of strings ("08"/"26"); both may be empty, which
 *  is legal — his 0001 sample leaves the second blank. Creates the airport block when there is none, the
 *  same rule the pad and the stand follow, and invents no identity either. */
export function addAirportRunway(
  project: Project,
  endpoint1: LonLat,
  endpoint2: LonLat,
  opts: { width?: number; identifiers?: [string, string]; id?: string } = {},
  now = nowIso(),
): Project {
  const [id1, id2] = opts.identifiers ?? ["", ""];
  const runway: AirportRunway = {
    id: opts.id ?? randomId(),
    ends: [newRunwayEnd(endpoint1, id1), newRunwayEnd(endpoint2, id2)],
    width: opts.width ?? DEFAULT_RUNWAY_WIDTH_M,
  };
  const airport = project.airport;
  const next: ProjectAirport =
    airport === undefined
      ? { icao: "", name: "", country: "", pads: [], runways: [runway] }
      : { ...airport, runways: [...runwaysOf(airport), runway] };
  return { ...project, airport: next, modifiedAt: now };
}

/** Drop a runway by id. */
export function removeAirportRunway(project: Project, runwayId: string, now = nowIso()): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const current = runwaysOf(airport);
  const runways = current.filter((r) => r.id !== runwayId);
  if (runways.length === current.length) return project;
  return { ...project, airport: { ...airport, runways }, modifiedAt: now };
}

function updateRunway(
  project: Project,
  runwayId: string,
  patch: (runway: AirportRunway) => AirportRunway,
  now: string,
): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const current = runwaysOf(airport);
  const i = current.findIndex((r) => r.id === runwayId);
  const found = i < 0 ? undefined : current[i];
  if (found === undefined) return project;
  const runway = patch(found);
  if (runway === found) return project;
  const runways = [...current];
  runways[i] = runway;
  return { ...project, airport: { ...airport, runways }, modifiedAt: now };
}

function patchEnd(
  runway: AirportRunway,
  end: 0 | 1,
  patch: (e: AirportRunwayEnd) => AirportRunwayEnd,
): AirportRunway {
  const current = runway.ends[end];
  const next = patch(current);
  if (next === current) return runway;
  const ends: [AirportRunwayEnd, AirportRunwayEnd] = [runway.ends[0], runway.ends[1]];
  ends[end] = next;
  return { ...runway, ends };
}

/** Widen or narrow a runway. Metres, refused rather than clamped when non-positive. */
export function setAirportRunwayWidth(
  project: Project,
  runwayId: string,
  width: number,
  now = nowIso(),
): Project {
  if (!(Number.isFinite(width) && width > 0)) return project;
  return updateRunway(project, runwayId, (r) => (r.width === width ? r : { ...r, width }), now);
}

/** Drag one END of the runway.
 *
 *  ★ The threshold FOLLOWS when it was not displaced. "ENDPOINT = THRESHOLD = NO EXTENSION" is his own
 *  note, so the two being equal is the normal state and means "there is no displacement here" — dragging
 *  the pavement end must not silently invent one. A threshold the user HAS moved stays where they put it. */
export function moveAirportRunwayEnd(
  project: Project,
  runwayId: string,
  end: 0 | 1,
  endpoint: LonLat,
  now = nowIso(),
): Project {
  return updateRunway(
    project,
    runwayId,
    (r) =>
      patchEnd(r, end, (e) => {
        const undisplaced = e.threshold.lon === e.endpoint.lon && e.threshold.lat === e.endpoint.lat;
        return { ...e, endpoint, threshold: undisplaced ? endpoint : e.threshold };
      }),
    now,
  );
}

/** Everything else about one end, in one patch: identifier, the three lighting rows, approach/takeoff and
 *  a DISPLACED threshold. `endpoint` is deliberately not patchable here — it has the rule above. */
export function updateAirportRunwayEnd(
  project: Project,
  runwayId: string,
  end: 0 | 1,
  patch: Partial<Omit<AirportRunwayEnd, "endpoint">>,
  now = nowIso(),
): Project {
  return updateRunway(
    project,
    runwayId,
    (r) =>
      patchEnd(r, end, (e) => {
        const next = { ...e, ...patch };
        return (Object.keys(patch) as (keyof typeof patch)[]).every((k) => e[k] === patch[k]) ? e : next;
      }),
    now,
  );
}

// ── Parking positions (v1.4, forum #232) ───────────────────────────────────────────────────────────
//
// The same shape as the pad mutations above, with two deliberate differences:
//
//   • NO MIRROR. `parkings` has no compatibility twin to keep in step (types.ts), so these write the
//     field directly instead of funnelling through withPadMirror.
//   • THE ID IS REQUIRED. `updatePad` lets it default to the first pad because the v1.3 UI knows exactly
//     one; there has never been a one-parking UI, so defaulting here would only hide a caller that forgot
//     which stand it meant.

/** A fresh stand: unnamed, facing true north, sized from its type (airport.ts DEFAULT_PARKING_SIZE_M). */
function newParking(position: LonLat, type: ParkingType, id = randomId()): AirportParking {
  return { id, name: "", position, heading: 0, size: DEFAULT_PARKING_SIZE_M[type], type };
}

/** APPEND a parking position ("any number of parking positions can be created" — forum #232). Creates the
 *  airport block when the project has none, the same rule placeAirportPad follows and for the same reason:
 *  placing one from the catalog is the user asking for the airport in as many words. It still invents no
 *  identity — icao/name/country come in empty and the install refuses until they are filled. */
export function addAirportParking(
  project: Project,
  position: LonLat,
  type: ParkingType,
  now = nowIso(),
  id?: string,
): Project {
  const parking = newParking(position, type, id);
  const airport = project.airport;
  const next: ProjectAirport =
    airport === undefined
      ? { icao: "", name: "", country: "", pads: [], parkings: [parking] }
      : { ...airport, parkings: [...parkingsOf(airport), parking] };
  return { ...project, airport: next, modifiedAt: now };
}

/** Drop a stand by id. Removing the last one leaves `parkings: []` rather than deleting the key: the
 *  difference is invisible to the writers (both emit no block) and keeping it avoids a save that silently
 *  reverts the file to its pre-v1.4 shape. */
export function removeAirportParking(project: Project, parkingId: string, now = nowIso()): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const current = parkingsOf(airport);
  const parkings = current.filter((p) => p.id !== parkingId);
  if (parkings.length === current.length) return project;
  return { ...project, airport: { ...airport, parkings }, modifiedAt: now };
}

/** Apply `patch` to one stand. No airport, or no stand with that id → the same project reference, so a
 *  drag on something that is no longer there is a no-op rather than an invented block. */
function updateParking(
  project: Project,
  parkingId: string,
  patch: (parking: AirportParking) => AirportParking,
  now: string,
): Project {
  const airport = project.airport;
  if (airport === undefined) return project;
  const current = parkingsOf(airport);
  const i = current.findIndex((p) => p.id === parkingId);
  const found = i < 0 ? undefined : current[i];
  if (found === undefined) return project;
  const parking = patch(found);
  if (parking === found) return project;
  const parkings = [...current];
  parkings[i] = parking;
  return { ...project, airport: { ...airport, parkings }, modifiedAt: now };
}

/** Drag a stand to a new centre. */
export function moveAirportParking(
  project: Project,
  parkingId: string,
  position: LonLat,
  now = nowIso(),
): Project {
  return updateParking(project, parkingId, (p) => ({ ...p, position }), now);
}

/** Turn a stand. TRUE compass degrees, normalised into [0, 360) like every other facing in the model —
 *  ApfelFlieger's own files carry NEGATIVE headings (-195, -100, -200) and the `.wad` conversion takes
 *  them unchanged, so this normalisation changes the number the user sees, never the rotation written. */
export function rotateAirportParking(
  project: Project,
  parkingId: string,
  heading: number,
  now = nowIso(),
): Project {
  const h = norm360(heading);
  return updateParking(project, parkingId, (p) => (p.heading === h ? p : { ...p, heading: h }), now);
}

/** Resize a stand. Metres, and a RADIUS — the sim shows the diameter, so 7.5 reads as "15 m". Non-positive
 *  is refused rather than clamped, exactly as for a pad radius. */
export function setAirportParkingSize(
  project: Project,
  parkingId: string,
  size: number,
  now = nowIso(),
): Project {
  if (!(Number.isFinite(size) && size > 0)) return project;
  return updateParking(project, parkingId, (p) => (p.size === size ? p : { ...p, size }), now);
}

/** Name a stand. Shown in LOCATION; empty means unnamed and the writer emits "Parking". */
export function setAirportParkingName(
  project: Project,
  parkingId: string,
  name: string,
  now = nowIso(),
): Project {
  return updateParking(project, parkingId, (p) => (p.name === name ? p : { ...p, name }), now);
}

/** Change what a stand is for. The SIZE follows only when the user had left it on the previous type's
 *  default: switching GA → Jet on an untouched 7.5 m stand should give the 40 m one his note documents,
 *  but a size someone typed is theirs and survives the switch. */
export function setAirportParkingType(
  project: Project,
  parkingId: string,
  type: ParkingType,
  now = nowIso(),
): Project {
  return updateParking(
    project,
    parkingId,
    (p) =>
      p.type === type
        ? p
        : {
            ...p,
            type,
            size: p.size === DEFAULT_PARKING_SIZE_M[p.type] ? DEFAULT_PARKING_SIZE_M[type] : p.size,
          },
    now,
  );
}
