import { describe, it, expect } from "vitest";
import { parseTm, findAll, child, vec3, vec3List, TmParseError } from "../../src/core/tm/tmParser";

// All fixtures are synthetic — invented tag names, no IPACS content.
const SAMPLE = `<[file][][]
  <[group][meta][]
    <[string8][title][Hello World]>
    <[vector3_float64][pos][1.5 -2.0 3.25]>
  >
  <[group][meta2][]
    <[int32][count][7]>
  >
>`;

describe("parseTm", () => {
  it("parses a nested tag tree", () => {
    const root = parseTm(SAMPLE);
    expect(root.type).toBe("file");
    expect(root.children).toHaveLength(2);
    expect(root.children[0].name).toBe("meta");
    expect(root.children[0].children).toHaveLength(2);
  });

  it("reads type/name/value left-to-right for a leaf", () => {
    const n = parseTm("<[string8][title][Hello World]>");
    expect(n).toMatchObject({ type: "string8", name: "title", value: "Hello World", children: [] });
  });

  it("findAll collects every node of a type, depth-first", () => {
    const root = parseTm(SAMPLE);
    expect(findAll(root, "string8").map((s) => s.value)).toEqual(["Hello World"]);
    expect(findAll(root, "group")).toHaveLength(2);
    expect(findAll(root, "nope")).toHaveLength(0);
  });

  it("child finds a direct child by name", () => {
    const meta = child(parseTm(SAMPLE), "meta");
    expect(meta).toBeDefined();
    expect(child(meta!, "title")?.value).toBe("Hello World");
    expect(child(meta!, "missing")).toBeUndefined();
  });

  it("vec3 parses three floats incl. scientific notation", () => {
    expect(vec3(parseTm("<[v][p][1.5 -2.0 3.25]>"))).toEqual([1.5, -2.0, 3.25]);
    expect(vec3(parseTm("<[v][p][0 8.34465026855469e-07 11.37]>"))).toEqual([0, 8.34465026855469e-7, 11.37]);
  });

  it("throws TmParseError on malformed input", () => {
    expect(() => parseTm("[not a node]")).toThrow(TmParseError); // missing '<'
    expect(() => parseTm("<[a][b][c]")).toThrow(TmParseError); // unclosed block
    expect(() => vec3(parseTm("<[v][p][1 2]>"))).toThrow(TmParseError); // too few numbers
    expect(() => vec3(parseTm("<[v][p][a b c]>"))).toThrow(TmParseError); // non-numeric
  });
});

describe("vec3List — parenthesised triple list (point_list)", () => {
  const list = (value: string) => parseTm(`<[list_vector3_float32][point_list][${value}]>`);

  it("parses '(x y z) (x y z) …' with or without spaces between triples", () => {
    expect(vec3List(list("(1 2 3) (4 5 6)"))).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(vec3List(list("(1 2 3)(-4 -5 -6)"))).toEqual([
      [1, 2, 3],
      [-4, -5, -6],
    ]);
  });

  it("tolerates whitespace inside a triple and scientific notation", () => {
    expect(vec3List(list("(  1   2  3 )"))).toEqual([[1, 2, 3]]);
    expect(vec3List(list("(0 8.34465026855469e-07 11.37)"))).toEqual([[0, 8.34465026855469e-7, 11.37]]);
  });

  it("returns [] when there are no parenthesised groups (caller degrades)", () => {
    expect(vec3List(list(""))).toEqual([]);
    expect(vec3List(list("1 2 3"))).toEqual([]); // bare triple, no parens
  });

  it("throws TmParseError on a malformed triple", () => {
    expect(() => vec3List(list("(1 2)"))).toThrow(TmParseError); // too few
    expect(() => vec3List(list("(1 2 3 4)"))).toThrow(TmParseError); // too many
    expect(() => vec3List(list("(a b c)"))).toThrow(TmParseError); // non-numeric
  });
});
