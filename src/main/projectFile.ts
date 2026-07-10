// projectFile.ts — main-process project.json persistence (design §3.5). Per the Fable review (P0-2)
// MAIN owns the current path and every dialog; the renderer only says WHAT (save / save-as / open),
// never WHERE. That path never crosses in from the sandboxed renderer, so a shared/untrusted
// project.json can't turn into a "write anywhere" primitive.
//
// The path-picking dialog is INJECTED (a `PickPath` thunk) so this module stays Electron-free and
// unit-tests directly; ipc.ts supplies the real electron `dialog` picker. Trust model: OPEN is
// untrusted input → parseProject validates it (throws Zod / UnsupportedSchemaVersionError, which
// ipc.ts maps to envelopes); SAVE writes renderer-owned, already-valid state as-is.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Project } from "../core/project/types";
import { parseProject, safeParseProject } from "../core/project/schemas";

/** Returns a chosen absolute path, or null if the user cancelled the dialog. */
export type PickPath = () => Promise<string | null> | string | null;

// The path of the project currently open in this main-process instance. Module-level because main is
// a singleton (Fable P0-2). Exported setter doubles as the reset seam for unit tests.
let currentPath: string | null = null;
export function getCurrentProjectPath(): string | null {
  return currentPath;
}
export function setCurrentProjectPath(p: string | null): void {
  currentPath = p;
}

function readProjectFile(file: string): Project {
  return parseProject(JSON.parse(readFileSync(file, "utf8"))); // untrusted → validate (may throw)
}

function writeProjectFile(file: string, project: Project): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(project, null, 2), "utf8");
}

/** Open+validate a project the user picks. Returns null on cancel; sets the current path on success.
 *  Propagates ZodError / UnsupportedSchemaVersionError for ipc.ts to envelope. */
export async function openProject(pick: PickPath): Promise<{ path: string; project: Project } | null> {
  const file = await pick();
  if (!file) return null;
  const project = readProjectFile(file);
  currentPath = file;
  return { path: file, project };
}

/** Save to the current path; when none is set yet, fall through to a Save-As dialog. Null on cancel. */
export async function saveProject(
  project: Project,
  pickSaveAs: PickPath,
): Promise<{ path: string } | null> {
  const file = currentPath ?? (await pickSaveAs());
  if (!file) return null;
  writeProjectFile(file, project);
  currentPath = file;
  return { path: file };
}

/** Always prompt for a destination, then save there and adopt it as the current path. Null on cancel. */
export async function saveProjectAs(
  project: Project,
  pick: PickPath,
): Promise<{ path: string } | null> {
  const file = await pick();
  if (!file) return null;
  writeProjectFile(file, project);
  currentPath = file;
  return { path: file };
}

// ── Crash-recovery shadow (design §3.6 autosave) ──────────────────────────────
// A debounced copy the renderer pushes to userData; on next launch the shell offers to restore it.
// No dialog, no currentPath change — it is a side copy, not "the file".

const shadowFile = (userDataDir: string): string => path.join(userDataDir, "shadow.json");

export function autosaveShadow(userDataDir: string, project: Project): void {
  mkdirSync(userDataDir, { recursive: true });
  writeFileSync(shadowFile(userDataDir), JSON.stringify(project), "utf8");
}

/** The last shadowed project, or null if absent/corrupt/unreadable-version (recovery is optional). */
export function loadShadow(userDataDir: string): Project | null {
  const f = shadowFile(userDataDir);
  if (!existsSync(f)) return null;
  try {
    const res = safeParseProject(JSON.parse(readFileSync(f, "utf8")));
    return res.success ? res.data : null;
  } catch {
    return null;
  }
}

/** Drop the shadow — after a save (the work is now durable in the file) or when the user declines
 *  recovery. Best-effort: `force` means a missing file is not an error. */
export function clearShadow(userDataDir: string): void {
  rmSync(shadowFile(userDataDir), { force: true });
}
