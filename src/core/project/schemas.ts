// schemas.ts — runtime validators (zod v4) + schemaVersion migration for every file PCT reads.
//
// project.json is UNTRUSTED input — people share them on the forum — so we validate the shape on
// load rather than trust it. Unknown fields are PRESERVED (z.looseObject) so a file written by a
// newer PCT round-trips through an older build without silent data loss (design §2, line 108:
// "unknown fields are preserved (forward compat)"). Version handling is centralised in migrate*():
// identity for v1 today, but the seam is where M3 slots real step-migrations in. These mirror the
// hand-written interfaces in types.ts — parse*() is annotated to return those exact types, so tsc
// flags any drift between the validators and the model.

import { z } from "zod";
import type { LonLat, Project, Settings } from "./types";
import type { FootprintOverrides } from "../catalog/footprints";
import { isValidPhotoKey } from "../catalog/photoKey";

export const CURRENT_PROJECT_VERSION = 1;
export const CURRENT_SETTINGS_VERSION = 1;

/** POI folder slug (the suffix after the coord prefix). Mirrors the slug half of
 *  isSafePoiFolderName in geo/poiName.ts — keep the two in sync. */
export const POI_SLUG_RE = /^[a-z0-9_]+$/;

/** A placed object's `name` is a catalog object id. Every scanned/.tmi name is `[A-Za-z0-9_]` (verified:
 *  837/837 in categories.data.ts), so we allow that plus `.`/`-` as headroom and reject the rest. This
 *  stops an untrusted, forum-shared project.json from smuggling a `]` (or a newline) into the value —
 *  the TM grammar has NO escape, so that would truncate and corrupt the emitted `poi.toc` written into
 *  the user's scenery/poi/ (Fable A — the C2 class, but via a foreign project.json rather than
 *  project.name). tocWriter runs the name through `sanitizeValue` as well, as defence in depth. */
export const XREF_NAME_RE = /^[A-Za-z0-9_.-]+$/;

/** Thrown when a file's schemaVersion is one this build cannot (yet) read. */
export class UnsupportedSchemaVersionError extends Error {
  constructor(
    readonly kind: "project" | "settings",
    readonly found: unknown,
  ) {
    super(`Unsupported ${kind} schemaVersion: ${JSON.stringify(found)}`);
    this.name = "UnsupportedSchemaVersionError";
  }
}

// ── Geometry primitives ──────────────────────────────────────────────────────

export const zLonLat = z.object({
  lon: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
});

/** Clamp a coordinate into the exact WGS84 ranges `zLonLat` enforces on load, so a mistyped inspector
 *  value (a slipped decimal → lat 481.3) can never produce a project the loader later rejects (Fable
 *  C1). Assumes finite inputs — the numeric field's `Number.isFinite` gate filters NaN/±Infinity first;
 *  `firstProjectError` is the save-time net for anything that still slips through. */
export function clampLonLat(p: LonLat): LonLat {
  return {
    lon: Math.min(180, Math.max(-180, p.lon)),
    lat: Math.min(90, Math.max(-90, p.lat)),
  };
}

export const zVec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const zHeightSpec = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("terrain") }),
  z.object({ mode: z.literal("terrain-offset"), offset: z.number().finite() }),
  z.object({ mode: z.literal("asl"), value: z.number().finite() }),
]);

/** Optional global export shift (metres, east/north). See Project.shift / types.ts PoiShift. */
export const zShift = z.object({
  east: z.number().finite(),
  north: z.number().finite(),
});

// ── Project model ────────────────────────────────────────────────────────────

export const zPlacedXref = z.looseObject({
  id: z.string().min(1),
  kind: z.literal("xref"),
  name: z.string().min(1).regex(XREF_NAME_RE, "must be a catalog object id (letters, digits, _ . -)"),
  position: zLonLat,
  height: zHeightSpec,
  direction: z.number().finite(),
  scale: z.number().finite().positive(),
  label: z.string().optional(),
  locked: z.boolean().optional(),
});

/** An airport-light `configuration`: 0–2 colour letters from [bgrwy]. Empty = the fixture's own
 *  default colour (valid — used in the in-sim gate). 1 letter = all-around, 2 = a direction + its
 *  opposite (format bible). Upper bound of 2 mirrors the grammar; the UI constrains further. */
export const CONFIGURATION_RE = /^[bgrwy]{0,2}$/;

// v0.2 lights. Permissive-on-load / constrained-at-the-editor: e.g. `color` accepts the whole 0..1
// continuum in case the in-sim gate later proves continuous RGB, while the Inspector offers only the
// valid corners for now. These validate the two new placed kinds; they wire into zProject.objects
// (as a discriminated union on `kind`) when the lights UI slice flips Project.objects to PlacedObject.
export const zPlacedAirportLight = z.looseObject({
  id: z.string().min(1),
  kind: z.literal("airport_light"),
  typeName: z.string().min(1).regex(XREF_NAME_RE, "must be an airport-light type name"),
  position: zLonLat,
  height: zHeightSpec,
  orientation: z.number().finite(),
  configuration: z.string().regex(CONFIGURATION_RE, "0–2 colour letters from b/g/r/w/y"),
  groupIndex: z.number().int().nonnegative(),
  label: z.string().optional(),
  locked: z.boolean().optional(),
});

const zUnit = z.number().finite().min(0).max(1);
const zNonNeg = z.number().finite().nonnegative();

export const zPlacedLight = z.looseObject({
  id: z.string().min(1),
  kind: z.literal("light"),
  position: zLonLat,
  height: zHeightSpec,
  color: z.tuple([zUnit, zUnit, zUnit]),
  intensity: zNonNeg,
  flashing: z.tuple([zNonNeg, zNonNeg, zNonNeg, zNonNeg]),
  groupIndex: z.number().int().nonnegative(),
  label: z.string().optional(),
  locked: z.boolean().optional(),
});

// v0.4 plants. `group`/`species` are catalog-derived slugs, so they get the same XREF_NAME_RE gate as
// an xref name and for the same reason: a forum-shared project.json must not smuggle a `]` into a
// value the TM grammar cannot escape (tocWriter's sanitizeValue is the second line of defence).
// `heightRange` is validated as a plain non-negative pair, NOT as min ≤ max — what the sim does with
// an inverted range is unknown until the in-sim gate reports, and rejecting a file on an unverified
// rule would lock people out of their own projects over a guess. The editor constrains; the loader
// stays permissive (the same split as `color` above).
export const zPlacedPlant = z.looseObject({
  id: z.string().min(1),
  kind: z.literal("plant"),
  group: z.string().min(1).regex(XREF_NAME_RE, "must be a plant group name"),
  species: z.string().min(1).regex(XREF_NAME_RE, "must be a plant species index"),
  position: zLonLat,
  height: zHeightSpec,
  heightRange: z.tuple([zNonNeg, zNonNeg]),
  label: z.string().optional(),
  locked: z.boolean().optional(),
});

/** The longest identity string the loader will carry. Not a format limit — the sim's own `sname` cut is
 *  29 (heliportTemplate.SNAME_MAX) and the code is 4–6 — but a loader must not reject a project over a
 *  rule the EDITOR enforces, so this is only a sanity bound on an untrusted file. */
const IDENTITY_MAX = 200;

/** The airport block (types.ts ProjectAirport). Permissive on load, constrained at the editor — the
 *  same split `color` and `heightRange` already use, and here it is load-bearing: a project saved with a
 *  half-typed code ("SH") must still OPEN, or the dialog that would let you finish it is unreachable.
 *
 *  So this validates SHAPE only. What makes the values safe to write is `validateIdentity`, which every
 *  path to disk goes through (planHeliport throws without it) — and `country` gets checked twice more,
 *  because it becomes a directory name under scenery/airports/ and a forum-shared project.json is
 *  untrusted input: once by validateIdentity's two-letter rule, once by main's own path guard. */
const zPad = z.looseObject({
  id: z.string().min(1),
  name: z.string().max(IDENTITY_MAX),
  position: zLonLat,
  heading: z.number().finite(),
  radius: z.number().finite().positive(),
});

export const zAirport = z.looseObject({
  icao: z.string().max(IDENTITY_MAX),
  name: z.string().max(IDENTITY_MAX),
  country: z.string().max(IDENTITY_MAX),
  iata: z.string().max(IDENTITY_MAX).optional(),
  position: zLonLat.optional(),
  // Defaulted rather than required: an airport with no pads is legal (his "(1) DATA" example is exactly
  // that), and a hand-edited file missing the key should land on the empty list, not fail to open.
  pads: z.array(zPad).default([]),
  // The compatibility mirror (types.ts ProjectAirport.pad). Validated so a malformed one is caught here
  // rather than silently shipped to an older PCT, and normalised by migrateAirport before it gets here.
  pad: zPad.optional(),
});

// loose (like the document top level) so a project written by a newer PCT that adds camera fields
// round-trips without loss — zod v4 z.object would strip them (Fable review nit).
export const zCamera = z.looseObject({
  lon: z.number().finite(),
  lat: z.number().finite(),
  zoom: z.number().finite(),
});

export const zProject = z.looseObject({
  schemaVersion: z.literal(CURRENT_PROJECT_VERSION),
  app: z.literal("pct"),
  name: z.string(),
  poiName: z.string(), // may be "" while editing; the export slug is gated by isExportablePoiName
  createdAt: z.string(),
  modifiedAt: z.string(),
  reference: zLonLat.nullable(),
  camera: zCamera,
  // Discriminated on `kind` — an xref-only project (pre-v0.2) still validates, and a `kind` outside
  // the four arms is a precise error rather than a silent drop. schemaVersion stays 1 (the seam was
  // designed for this): bumping it would lock older builds out of every v0.2-saved project, including
  // pure-xref ones people share on the forum. The cost of staying at 1 is the mirror case — a v0.3
  // build opening a project with plants reports an unknown `kind` rather than dropping them silently,
  // which is the failure we want.
  objects: z.array(
    z.discriminatedUnion("kind", [zPlacedXref, zPlacedAirportLight, zPlacedLight, zPlacedPlant]),
  ),
  shift: zShift.optional(),
  // Optional export height mode (types.ts HeightMode). Absent ≡ "baked-asl", so schemaVersion stays 1 and
  // a pre-autoheight project round-trips byte-identical; an older PCT opening an "autoheight" project just
  // ignores the field and exports the same scene via baked ASL (a correct, lossless degradation — the
  // objects' HeightSpecs are unchanged, only the compile strategy differs).
  heightMode: z.enum(["baked-asl", "autoheight"]).optional(),
  // v1.2 airport identity + pad (types.ts ProjectAirport). Optional, so schemaVersion stays 1: a
  // POI-only project has no such key and round-trips unchanged, and an older PCT opening a project WITH
  // one ignores it and exports the same POI — nothing here reaches the .tsl or the .toc.
  airport: zAirport.optional(),
});

// ── Settings ─────────────────────────────────────────────────────────────────

export const zSettings = z.looseObject({
  schemaVersion: z.literal(CURRENT_SETTINGS_VERSION),
  installDir: z.string().nullable(),
  afs4UserDir: z.string().nullable(),
  // v0.6 object-photo folder. `.default(null)` is load-bearing: a settings.json written by an older PCT
  // has no such key, and without the default a required field would fail parse → readSettings would fall
  // back to DEFAULTS, silently wiping the user's install dir + tile provider. Absent → null (not set).
  thumbnailsDir: z.string().nullable().default(null),
  tiles: z.looseObject({
    provider: z.enum(["esri", "osm", "custom"]),
    customUrl: z.string().optional(),
    customAttribution: z.string().optional(),
  }),
  elevation: z.looseObject({ provider: z.enum(["open-meteo", "none"]) }),
  recentProjects: z.array(z.string()),
  lastScanAt: z.string().nullable(),
  // Saved window placement. `.catch(undefined)` is load-bearing, not decoration: readSettings falls back
  // to DEFAULTS on any parse throw, so without it a single bad rect (a hand-edited file, a NaN) would
  // silently reset the user's install dir and tile provider too. A cosmetic field must never be able to
  // cost them their real settings — a bad rect degrades to "no saved placement" and nothing else.
  window: z
    .looseObject({
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite().positive(),
      height: z.number().finite().positive(),
      maximized: z.boolean(),
    })
    .optional()
    .catch(undefined),
});

// ── Footprint overrides (v0.9) ───────────────────────────────────────────────

/** The largest measurement PCT accepts, metres. Not a limit of the format — a typo guard. The biggest
 *  scanned XREF is under 100 m in any axis, so a slipped decimal ("500" for "50.0") is the realistic
 *  failure and a 10 km polygon covering the whole map is how it would show up. */
export const MAX_FOOTPRINT_M = 10000;

const zMetres = z.number().finite().positive().max(MAX_FOOTPRINT_M);

export const zFootprintOverride = z.looseObject({
  width: zMetres,
  depth: zMetres,
  // Height alone may be 0: a painted marking or an inset light is flat, and a flat thing still has a
  // ground footprint worth drawing. Width/depth of 0 would draw nothing, so those stay positive.
  height: z.number().finite().nonnegative().max(MAX_FOOTPRINT_M),
  note: z.string().optional(),
});

/** `footprints.json`. Like project.json this is untrusted input the moment the import button exists —
 *  the whole point of the feature is that files travel between users — so the shape is validated rather
 *  than trusted. Keys are gated by isValidPhotoKey: a key outside that set can't name any card, so it is
 *  a hand-edit typo, and failing loudly on it beats importing a file that silently does nothing. */
export const zFootprints = z.looseObject({
  schemaVersion: z.literal(1),
  entries: z.record(
    z.string().refine(isValidPhotoKey, "must be an object photo key (letters, digits, _ . -)"),
    zFootprintOverride,
  ),
});

export function parseFootprints(raw: unknown): FootprintOverrides {
  return zFootprints.parse(raw);
}

// ── Migration + parse entry points ───────────────────────────────────────────

function readVersion(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null
    ? (raw as { schemaVersion?: unknown }).schemaVersion
    : undefined;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** The id given to the single pad of a pre-v1.4 project.
 *
 *  FIXED, not minted: migration runs on every open, and a fresh random id each time would make the file
 *  differ from itself on the next save — breaking the round-trip-identical property the whole airport
 *  block was designed around. One legacy pad per project, so one constant is enough. */
export const LEGACY_PAD_ID = "pad-1";

/** v1.2/v1.3 stored ONE pad under `airport.pad`; v1.4 stores a list under `airport.pads` (forum #221 —
 *  HELICOPTER became a repeatable element). Lift the old shape into the new one, in place, so everything
 *  downstream only ever sees `pads`.
 *
 *  The migrated pad gets an EMPTY name on purpose: the writer renders an unnamed pad as "FATO/TLOF",
 *  which is the literal v1.2/v1.3 hard-coded, so an existing project keeps producing the same files. */
function migrateAirport(airport: unknown): unknown {
  if (!isRecord(airport)) return airport;
  if (Array.isArray(airport.pads)) return airport;
  const legacy = airport.pad;
  if (!isRecord(legacy)) return { ...airport, pads: [] };
  const pad = { id: LEGACY_PAD_ID, name: "", ...legacy };
  return { ...airport, pads: [pad], pad };
}

/** Normalise an older/other project shape up to the current version. Anything other than the current
 *  version is refused explicitly (real step-migrations arrive in M3). A missing version falls through
 *  to zod, which reports the precise validation error.
 *
 *  Within v1 this is no longer the identity: the airport block gained `pads` (see migrateAirport). That
 *  stays a v1 shape change rather than a version bump because it is LOSSLESS IN BOTH DIRECTIONS for the
 *  one-pad case — the mirror keeps older PCTs opening the file — and bumping the version would lock
 *  those PCTs out of every project, POI-only ones included. */
export function migrateProject(raw: unknown): unknown {
  const v = readVersion(raw);
  if (v !== undefined && v !== CURRENT_PROJECT_VERSION) {
    throw new UnsupportedSchemaVersionError("project", v);
  }
  if (!isRecord(raw) || raw.airport === undefined) return raw;
  return { ...raw, airport: migrateAirport(raw.airport) };
}

export function migrateSettings(raw: unknown): unknown {
  const v = readVersion(raw);
  if (v === undefined || v === CURRENT_SETTINGS_VERSION) return raw;
  throw new UnsupportedSchemaVersionError("settings", v);
}

/** Validate untrusted project JSON. Throws ZodError on a bad shape, UnsupportedSchemaVersionError
 *  on an unreadable version. Returns a Project with any unknown fields preserved. */
export function parseProject(raw: unknown): Project {
  return zProject.parse(migrateProject(raw));
}

/** Non-throwing variant: folds the version check into the same `{ success }` result zod returns. */
export function safeParseProject(raw: unknown) {
  try {
    return zProject.safeParse(migrateProject(raw));
  } catch (err) {
    if (err instanceof UnsupportedSchemaVersionError) {
      return { success: false as const, error: err };
    }
    throw err;
  }
}

export function parseSettings(raw: unknown): Settings {
  return zSettings.parse(migrateSettings(raw));
}

/** The save-time safety net for Fable C1: the editor must NEVER write a document its own loader would
 *  reject (a lon/lat out of range, a non-finite coordinate), which would lock the whole project out of
 *  the app on the next open. Returns a short human reason a project is unsavable, or null if it's valid.
 *  A precise field path is included when zod supplies one ("objects → 0 → position → lat: …"). */
export function firstProjectError(raw: unknown): string | null {
  const res = safeParseProject(raw);
  if (res.success) return null;
  const err = res.error;
  if (err instanceof UnsupportedSchemaVersionError) return err.message;
  const issue = err.issues[0];
  if (!issue) return "the project has an invalid value";
  const where = issue.path.length > 0 ? issue.path.map(String).join(" → ") : "project";
  return `${where}: ${issue.message}`;
}

// ── Export-time guard ────────────────────────────────────────────────────────

/** True if `poiName` is a valid, non-empty folder slug — enforced at export (design §2.2). */
export function isExportablePoiName(poiName: string): boolean {
  return POI_SLUG_RE.test(poiName);
}
