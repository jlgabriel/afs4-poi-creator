// tmParser.ts — the one grammar for every Aerofly FS4 text file:
//
//     <[type][name][value] …children… >
//
// A node is either a leaf  <[t][n][v]>  or a block  <[t][n][v] child child … >.
// Faithful TypeScript port of the M0 Python prototype's parse_tm (same offsets, same
// behaviour), so the tests that validated the prototype against a real install carry over.

import type { Vec3 } from "../project/types";

export interface TmNode {
  type: string;
  name: string;
  value: string;
  children: TmNode[];
}

export class TmParseError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.name = "TmParseError";
    this.offset = offset;
  }
}

/** Parse one AFS4 tag tree. Throws TmParseError on malformed input. */
export function parseTm(text: string): TmNode {
  let i = 0;
  const n = text.length;

  const skip = (): void => {
    while (i < n) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\r" || c === "\n") i++;
      else break;
    }
  };

  const bracket = (): string => {
    if (text[i] !== "[") throw new TmParseError(`expected '[' at offset ${i}`, i);
    i++;
    const start = i;
    while (i < n && text[i] !== "]") i++;
    const value = text.slice(start, i);
    i++; // consume ']'
    return value;
  };

  const node = (): TmNode => {
    skip();
    if (text[i] !== "<") throw new TmParseError(`expected '<' at offset ${i}`, i);
    i++;
    // Property order matters: type, name, value are read left-to-right, as in the file.
    const nd: TmNode = {
      type: bracket(),
      name: bracket(),
      value: bracket(),
      children: [],
    };
    skip();
    if (text[i] === ">") {
      i++; // leaf: <[type][name][value]>
      return nd;
    }
    for (;;) {
      skip();
      if (i >= n) throw new TmParseError("unexpected EOF (unclosed block)", i);
      if (text[i] === ">") {
        i++;
        break;
      }
      nd.children.push(node());
    }
    return nd;
  };

  skip();
  return node();
}

/** Depth-first collect of every node whose `type` matches. */
export function findAll(root: TmNode, type: string, out: TmNode[] = []): TmNode[] {
  if (root.type === type) out.push(root);
  for (const c of root.children) findAll(c, type, out);
  return out;
}

/** First direct child with the given `name`, or undefined. */
export function child(node: TmNode, name: string): TmNode | undefined {
  return node.children.find((c) => c.name === name);
}

/** A node's whitespace-separated value as a 3-vector. Throws if it isn't three finite
 *  numbers — callers wanting tolerance (tmiParser) catch and warn. */
export function vec3(node: TmNode): Vec3 {
  const parts = node.value.trim().split(/\s+/);
  if (parts.length < 3) {
    throw new TmParseError(
      `vec3 '${node.name}': expected 3 numbers, got ${parts.length} ('${node.value}')`,
      -1,
    );
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = Number(parts[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new TmParseError(`vec3 '${node.name}': non-numeric component ('${node.value}')`, -1);
  }
  return [x, y, z];
}

/** A `point_list`-style value "(x y z) (x y z) …" → Vec3[]: parentheses delimit each triple, the
 *  three components inside are whitespace-separated. Throws TmParseError on a group that isn't three
 *  finite numbers. Returns [] when there are no parenthesised groups — callers wanting tolerance
 *  (userTmb) treat that as "no geometry" and degrade. Distinct from `vec3`, which reads ONE bare
 *  whitespace-separated triple (the sim writes bounding boxes that way, but vertex lists in parens). */
export function vec3List(node: TmNode): Vec3[] {
  const out: Vec3[] = [];
  const re = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(node.value)) !== null) {
    const parts = m[1].trim().split(/\s+/);
    if (parts.length !== 3) {
      throw new TmParseError(
        `vec3List '${node.name}': expected 3 numbers per triple, got ${parts.length} ('${m[1]}')`,
        -1,
      );
    }
    const [x, y, z] = parts.map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new TmParseError(`vec3List '${node.name}': non-numeric triple ('${m[1]}')`, -1);
    }
    out.push([x, y, z]);
  }
  return out;
}
