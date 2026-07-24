// thumbnails.ts — the v0.6 object-photo folder, pure half. Answers two questions about the folder the
// user pointed PCT at in Settings: which catalog objects have a photo, and which file backs a given
// name. No Electron import (fs only) so it unit-tests directly; main/ipc.ts turns a resolved path into
// a downscaled data URL via nativeImage.
//
// The photos are the user's OWN sim screenshots on their OWN disk. PCT reads them to draw a nicer
// thumbnail and NEVER bundles or exports them — the zero-IPACS-assets line is untouched (same status
// as the scanned catalog cache in userData).
import { readdirSync } from "node:fs";
import path from "node:path";

/** Image extensions a photo may use, HIGH→LOW priority: when one object has more than one file
 *  (`tower.png` AND `tower.jpg`), the higher-priority extension wins so the pick is deterministic
 *  rather than readdir-order-dependent. Lowercase, no leading dot. */
export const THUMBNAIL_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const PRIORITY = new Map<string, number>(THUMBNAIL_EXTS.map((e, i) => [e, i]));

/** The longest edge (px) a photo is downscaled to before it reaches the renderer. A sim screenshot is
 *  1080p+; the thumbnail slot is 40px, so 160 covers hi-DPI with a tiny payload. Consumed in ipc.ts. */
export const THUMBNAIL_PX = 160;

/** A photo maps to a catalog object by its stem === the object's exact `name`. Every scanned name is
 *  `[A-Za-z0-9_]` (see schemas.ts XREF_NAME_RE's note: 837/837), so we match that set exactly — which
 *  ALSO makes the name safe to join into a path (no separators, no `..`) even though it arrives over IPC
 *  from the renderer. A name outside the set simply has no photo and keeps its generated glyph. */
export function isValidThumbName(name: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(name);
}

/** Build a lowercased-stem → absolute-path index of the photos in `dir`. Lowercased because Windows is
 *  case-insensitive (and the catalog names carry mixed case, e.g. `UH60_usarmy`); priority-resolved on a
 *  duplicate stem. A `null`, missing, unreadable, or non-directory `dir` yields an EMPTY index — a photo
 *  folder that isn't there is "no photos", never an error (the user may simply not use the feature). */
export function indexThumbnails(dir: string | null): Map<string, string> {
  const index = new Map<string, string>();
  if (dir === null || dir === "") return index;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return index; // folder gone / unplugged drive / not a dir / no permission → no photos
  }
  const chosenPriority = new Map<string, number>();
  for (const file of entries) {
    const ext = path.extname(file).slice(1).toLowerCase();
    const prio = PRIORITY.get(ext);
    if (prio === undefined) continue; // not one of our image extensions
    const stem = path.basename(file, path.extname(file));
    if (!isValidThumbName(stem)) continue; // can't correspond to any catalog name (has a space, dot, …)
    const key = stem.toLowerCase();
    const prev = chosenPriority.get(key);
    if (prev === undefined || prio < prev) {
      index.set(key, path.join(dir, file));
      chosenPriority.set(key, prio);
    }
  }
  return index;
}

// ── v0.7 "Paste photo" write path (still no Electron import — unit-tests directly; ipc.ts reads the
//    clipboard and calls these). Two typed errors so ipc.ts can map them to their own PctError codes. ──

/** No photo folder is set (settings.thumbnailsDir is null) but a write/delete was asked for. Maps to the
 *  "no-photos-dir" PctError so the renderer can point the user at Settings (v0.6 keeps the folder opt-in). */
export class NoPhotosDirError extends Error {
  constructor() {
    super("No photo folder is set — choose one in Settings first.");
    this.name = "NoPhotosDirError";
  }
}

/** "Paste photo" ran but the clipboard holds no image. Maps to the "clipboard-empty" PctError. */
export class ClipboardEmptyError extends Error {
  constructor() {
    super("No image on the clipboard — capture one (Win+Shift+S) and try again.");
    this.name = "ClipboardEmptyError";
  }
}

/** Where a pasted photo is written: always `<dir>/<name>.png` (the clipboard gives a bitmap and PNG is
 *  lossless). Throws on a name that isn't catalog-shaped — the SAME guard getThumbnail uses, so a name
 *  arriving over IPC from the renderer can never escape the folder (no separators, no `..`). */
export function photoWritePath(dir: string, name: string): string {
  if (!isValidThumbName(name)) throw new Error(`unsafe photo name: ${name}`);
  return path.join(dir, `${name}.png`);
}

/** Every photo file in `dir` whose stem === `name` (any of our extensions) — what "Remove photo" deletes,
 *  so a stem holding both `name.png` and an older `name.jpg` is cleared fully, not left half-there. Empty
 *  on a missing/unreadable dir or an unsafe name. */
export function photoFilesForStem(dir: string, name: string): string[] {
  if (!isValidThumbName(name)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const target = name.toLowerCase();
  const out: string[] = [];
  for (const file of entries) {
    const ext = path.extname(file).slice(1).toLowerCase();
    if (!PRIORITY.has(ext)) continue; // not one of our image extensions
    if (path.basename(file, path.extname(file)).toLowerCase() === target) out.push(path.join(dir, file));
  }
  return out;
}
