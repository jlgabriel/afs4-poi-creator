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
import type { Project, Settings } from "./types";

export const CURRENT_PROJECT_VERSION = 1;
export const CURRENT_SETTINGS_VERSION = 1;

/** POI folder slug (the suffix after the coord prefix). Mirrors the slug half of
 *  isSafePoiFolderName in geo/poiName.ts — keep the two in sync. */
export const POI_SLUG_RE = /^[a-z0-9_]+$/;

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

export const zVec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const zHeightSpec = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("terrain") }),
  z.object({ mode: z.literal("terrain-offset"), offset: z.number().finite() }),
  z.object({ mode: z.literal("asl"), value: z.number().finite() }),
]);

// ── Project model ────────────────────────────────────────────────────────────

export const zPlacedXref = z.looseObject({
  id: z.string().min(1),
  kind: z.literal("xref"),
  name: z.string().min(1),
  position: zLonLat,
  height: zHeightSpec,
  direction: z.number().finite(),
  scale: z.number().finite().positive(),
  label: z.string().optional(),
  locked: z.boolean().optional(),
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
  objects: z.array(zPlacedXref),
});

// ── Settings ─────────────────────────────────────────────────────────────────

export const zSettings = z.looseObject({
  schemaVersion: z.literal(CURRENT_SETTINGS_VERSION),
  installDir: z.string().nullable(),
  afs4UserDir: z.string().nullable(),
  tiles: z.looseObject({
    provider: z.enum(["esri", "osm", "custom"]),
    customUrl: z.string().optional(),
    customAttribution: z.string().optional(),
  }),
  elevation: z.looseObject({ provider: z.enum(["open-meteo", "none"]) }),
  recentProjects: z.array(z.string()),
  lastScanAt: z.string().nullable(),
});

// ── Migration + parse entry points ───────────────────────────────────────────

function readVersion(raw: unknown): unknown {
  return typeof raw === "object" && raw !== null
    ? (raw as { schemaVersion?: unknown }).schemaVersion
    : undefined;
}

/** Normalise an older/other project shape up to the current version. Identity for v1; anything
 *  other than the current version is refused explicitly (real step-migrations arrive in M3). A
 *  missing version falls through to zod, which reports the precise validation error. */
export function migrateProject(raw: unknown): unknown {
  const v = readVersion(raw);
  if (v === undefined || v === CURRENT_PROJECT_VERSION) return raw;
  throw new UnsupportedSchemaVersionError("project", v);
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

// ── Export-time guard ────────────────────────────────────────────────────────

/** True if `poiName` is a valid, non-empty folder slug — enforced at export (design §2.2). */
export function isExportablePoiName(poiName: string): boolean {
  return POI_SLUG_RE.test(poiName);
}
