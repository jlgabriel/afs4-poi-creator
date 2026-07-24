import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeFileAtomic } from "../../src/main/fsAtomic";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "pct-fsatomic-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("writes a string as UTF-8 text, LF preserved", () => {
    const f = path.join(tmp, "a.txt");
    writeFileAtomic(f, "hola\nmundo");
    expect(readFileSync(f, "utf8")).toBe("hola\nmundo");
  });

  it("writes a Buffer verbatim as binary — a PNG round-trips byte-for-byte (v0.7 paste)", () => {
    const f = path.join(tmp, "photo.png");
    // PNG signature + high bytes that a naive utf8 write would mangle into replacement chars.
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0x80, 0x7f]);
    writeFileAtomic(f, bytes);
    expect(readFileSync(f).equals(bytes)).toBe(true);
  });

  it("overwrites an existing file and leaves no .pct-tmp scratch behind", () => {
    const f = path.join(tmp, "x.bin");
    writeFileAtomic(f, Buffer.from([1, 2, 3]));
    writeFileAtomic(f, Buffer.from([4, 5, 6, 7])); // replace
    expect([...readFileSync(f)]).toEqual([4, 5, 6, 7]);
    expect(readdirSync(tmp).filter((n) => n.endsWith(".pct-tmp"))).toEqual([]);
  });
});
