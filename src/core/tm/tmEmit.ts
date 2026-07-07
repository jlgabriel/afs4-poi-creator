// tmEmit.ts — the writer half of the shared AFS4 tag grammar (design §3.1).
//
// Every byte AFS4 reads back is produced through these helpers, so the formatting
// conventions (bracket layout, indentation, decimal places) live in exactly ONE place and
// the byte-exact golden .tsl/.toc tests pin them down. Mirrors the reader in tmParser.ts:
//
//     <[type][name][value] …children… >
//
// The sim's own text files indent children by 4 spaces per level; `block` reproduces that.

/** A leaf tag on a single line: `<[type][name][value]>`. The value is emitted verbatim —
 *  callers pre-format numbers with the fmt* helpers below so precision is explicit. */
export function tag(type: string, name: string, value: string | number): string {
  return `<[${type}][${name}][${value}]>`;
}

/** A block tag with children, as an array of lines (indented 4 spaces per nesting level):
 *
 *     <[type][name][index]
 *         …body…
 *     >
 *
 * Returns lines (not a joined string) so blocks nest by composition — each `body` line is
 * pushed down one level automatically. The top-level writer joins with "\n". */
export function block(type: string, name: string, index: string, body: string[]): string[] {
  return [`<[${type}][${name}][${index}]`, ...body.map((line) => `    ${line}`), `>`];
}

/** Longitude/latitude → 7 decimals. Matches the Race App exporter and AFS4's own POI files;
 *  ~1 cm resolution, and golden-stable (fixed width). */
export function fmtLonLat(v: number): string {
  return v.toFixed(7);
}

/** Metres (height ASL, sizes) → 2 decimals. */
export function fmtMeters(v: number): string {
  return v.toFixed(2);
}

/** Compact number for fields where the sim writes bare integers (direction, scale_factor):
 *  fixed max precision, then trailing zeros and any trailing dot removed.
 *  90 → "90", 90.5 → "90.5", 1 → "1", 0.5 → "0.5", -45 → "-45", 0 → "0". */
export function fmtNum(v: number, maxDecimals = 6): string {
  const s = v.toFixed(maxDecimals);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
