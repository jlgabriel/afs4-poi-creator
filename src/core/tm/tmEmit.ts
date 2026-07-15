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
 *  callers pre-format numbers with the fmt* helpers below so precision is explicit. Free TEXT
 *  values (a user-typed name) must be run through `sanitizeValue` first — the grammar has no escape. */
export function tag(type: string, name: string, value: string | number): string {
  return `<[${type}][${name}][${value}]>`;
}

/** Make arbitrary free text safe as a tag VALUE. The grammar has NO escape mechanism: tmParser reads
 *  a value verbatim up to the FIRST `]` (see tmParser.bracket), so a stray `]` truncates the value and
 *  corrupts the rest of the file — e.g. a project named `Munich [WIP]` would break its own `.tsl`
 *  (Fable C2). Brackets become parens (readable), and CR/LF/TAB collapse to a space so a value can't
 *  break out of its single line. The only user-controlled value today is the `.tsl` place `name`
 *  (project.name); catalogue-sourced xref names are slugs and can't contain these. */
export function sanitizeValue(s: string): string {
  return s.replace(/\[/g, "(").replace(/\]/g, ")").replace(/[\r\n\t]+/g, " ");
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

/** Fixed 6-decimal float for `.tmi` geometry fields (bb_min/bb_max/bs_center/bs_radius). Unlike
 *  `fmtNum`, trailing zeros are KEPT — fixed width keeps the byte-goldens stable and matches the
 *  precision flown and accepted in-sim (~1 µm). The one wrinkle: a tiny negative that rounds to zero
 *  yields `"-0.000000"`, which would make an otherwise-symmetric bbox emit a stray minus and destabilise
 *  goldens, so it is normalised to `"0.000000"` (the only value that ever needs normalising — a genuine
 *  ±1 µm keeps its sign). Real files vary radius/precision and all render, so this is a wide-tolerance
 *  field: determinism matters more than matching any one producer. */
export function fmtF6(v: number): string {
  const s = v.toFixed(6);
  return s === "-0.000000" ? "0.000000" : s;
}
