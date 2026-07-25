import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  indexThumbnails,
  isValidThumbName,
  photoFilesForStem,
  photoWritePath,
  THUMBNAIL_EXTS,
} from "../../src/main/thumbnails";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-thumbs-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Write an empty file `name` into the temp folder (content is irrelevant — indexing is by name). */
function touch(name: string): void {
  writeFileSync(path.join(tmp, name), "");
}

describe("isValidThumbName", () => {
  it("accepts a real catalog name shape (letters, digits, underscore)", () => {
    for (const n of ["UH60_usarmy", "glider_03", "a380_klm", "b737800_klm", "C172_livery1"]) {
      expect(isValidThumbName(n)).toBe(true);
    }
  });

  it("accepts a user-registered XREF name with `-` or `.` (forum #176 — the whole point of the widening)", () => {
    // A user's own .tmb objects are NOT limited to the sim's `[A-Za-z0-9_]`; XREF_NAME_RE and
    // isSafeBundleName have always allowed these, and a photo must be nameable after the object.
    for (const n of ["cabin-boat-red", "my.obj-1_v2", "boat-01", "a.b"]) {
      expect(isValidThumbName(n)).toBe(true);
    }
  });

  it("still rejects what could escape the folder or match no object (separators, `..`, leading dot/dash)", () => {
    for (const n of ["../evil", "a/b", "a\\b", "..", ".", ".hidden", "-dash", "foo bar", "", "café"]) {
      expect(isValidThumbName(n)).toBe(false);
    }
  });
});

describe("indexThumbnails", () => {
  it("returns an empty index for a null, empty, or missing folder (feature simply off)", () => {
    expect(indexThumbnails(null).size).toBe(0);
    expect(indexThumbnails("").size).toBe(0);
    expect(indexThumbnails(path.join(tmp, "does-not-exist")).size).toBe(0);
  });

  it("indexes supported images by lowercased stem and ignores everything else", () => {
    touch("UH60_usarmy.jpg");
    touch("a380_klm.png");
    touch("f18.webp");
    touch("cabin-boat-red.png"); // a user-registered XREF name (forum #176) — must index, not be skipped
    touch("with.dot.jpg"); // a dot in the stem is legal too; extname still splits off only `.jpg`
    touch("notes.txt"); // not an image
    touch("readme.md"); // not an image
    touch("bad name.jpg"); // space → not a catalog-shaped name
    touch(".hidden.jpg"); // leading dot → not a catalog-shaped name

    const index = indexThumbnails(tmp);
    expect([...index.keys()].sort()).toEqual([
      "a380_klm",
      "cabin-boat-red",
      "f18",
      "uh60_usarmy",
      "with.dot",
    ]);
    expect(path.basename(index.get("uh60_usarmy")!)).toBe("UH60_usarmy.jpg");
    expect(index.get("uh60_usarmy")).toBe(path.join(tmp, "UH60_usarmy.jpg")); // absolute path back to the file
  });

  it("is case-insensitive on both the stem and the extension (Windows)", () => {
    touch("UH60_usarmy.JPG"); // uppercase extension
    const index = indexThumbnails(tmp);
    expect(index.has("uh60_usarmy")).toBe(true); // looked up by the lowercased catalog name
    expect(index.has("UH60_usarmy")).toBe(false); // the key is always lowercased
  });

  it("resolves a duplicate stem deterministically by extension priority (png beats jpg)", () => {
    // Written jpg-first so a naive readdir-order pick would choose jpg; priority must override that.
    touch("tower.jpg");
    touch("tower.png");
    const index = indexThumbnails(tmp);
    expect(index.size).toBe(1); // one object → one photo
    expect(path.basename(index.get("tower")!)).toBe("tower.png");
  });

  it("declares its extension priority high→low (png, jpg, jpeg, webp)", () => {
    // Guards the ordering the dedup test depends on — a reshuffle here would silently change which
    // duplicate wins across the app.
    expect(THUMBNAIL_EXTS).toEqual(["png", "jpg", "jpeg", "webp"]);
  });
});

// ── v0.7 "Paste photo" write side ──
describe("photoWritePath", () => {
  it("builds <dir>/<name>.png for a valid catalog name (a pasted bitmap is always saved as PNG)", () => {
    expect(photoWritePath(tmp, "UH60_usarmy")).toBe(path.join(tmp, "UH60_usarmy.png"));
  });

  it("builds it for a user-registered XREF name with a `-` too (forum #176: Paste used to throw here)", () => {
    expect(photoWritePath(tmp, "cabin-boat-red")).toBe(path.join(tmp, "cabin-boat-red.png"));
  });

  it("throws on a name that isn't catalog-shaped — the boundary guard against a path escape over IPC", () => {
    for (const n of ["../evil", "a/b", "a\\b", "..", ".hidden", "-dash", "foo bar", ""]) {
      expect(() => photoWritePath(tmp, n)).toThrow();
    }
  });
});

describe("photoFilesForStem", () => {
  it("returns every image file whose stem matches the name (so Remove clears all extensions of a stem)", () => {
    touch("tower.png");
    touch("tower.jpg");
    touch("tower.txt"); // not an image → ignored
    touch("towers.png"); // different stem → ignored
    const files = photoFilesForStem(tmp, "tower").map((f) => path.basename(f)).sort();
    expect(files).toEqual(["tower.jpg", "tower.png"]);
  });

  it("is case-insensitive on the stem (Windows); empty for a missing dir or an unsafe name", () => {
    touch("Tower.PNG");
    expect(photoFilesForStem(tmp, "tower").map((f) => path.basename(f))).toEqual(["Tower.PNG"]);
    expect(photoFilesForStem(path.join(tmp, "nope"), "tower")).toEqual([]);
    expect(photoFilesForStem(tmp, "../evil")).toEqual([]);
  });

  it("finds a user-XREF stem with a `-` (so Remove photo can clear one — forum #176)", () => {
    touch("cabin-boat-red.png");
    touch("cabin-boat-red.jpg");
    touch("cabin-boat-blue.png"); // a near-miss stem must not be swept up
    const files = photoFilesForStem(tmp, "cabin-boat-red").map((f) => path.basename(f)).sort();
    expect(files).toEqual(["cabin-boat-red.jpg", "cabin-boat-red.png"]);
  });
});
