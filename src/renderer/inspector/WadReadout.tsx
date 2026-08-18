// WadReadout.tsx — the `.wad` value of the field directly above it, for the six Airport submenus.
//
// WHY IT EXISTS (forum #284, ApfelFlieger). "For all 6 submenus in the Airport menu, the coordinates and
// directions are always written into the WAD and must therefore be converted. => I think it would be good
// if the converted values were always shown in the INSPECTOR directly below the values LON LAT and HEADING
// and could be copied there at least by double-clicking."
//
// He is describing work he does by hand. A `.wad` holds no degrees: it holds a projected pair on a
// 0–65536 grid and rotations in radians, and people who hand-build these files were converting with a
// private spreadsheet (#150). PCT already computes every one of these numbers on the way to the file —
// core/geo/wad.ts — so showing them costs a render, not a formula.
//
// ★ NOT the collapsed "FS4 internal (.wad)" block the OBJECT panels carry (Inspector.tsx). That one is a
// footnote nobody needs to place a tree; this one is asked for as ALWAYS VISIBLE and beside the field it
// belongs to, because for an airport it is the working value, not trivia. Same conversions, different
// posture — which is why this is its own component rather than a fifth caller of that one.
//
// ★ AND IT STAYS A READ-OUT. PCT still writes no `.wad` and no `.tsc`; a user `.tsc` silently overwrites a
// base airport that shares its ICAO. Showing the number does not cross that line — see wad.ts.
import { useEffect, useRef, useState } from "react";
import type { LonLat } from "../../core/project/types";
import { formatWad, headingToWadDirection, latToWad, lonToWad } from "../../core/geo/wad";

/** How long the chip stays green after a copy. Long enough to notice, short enough that a row of them
 *  does not end up looking like a status board. */
const COPIED_MS = 900;

/** One value, WITH ITS OWN "WAD:" IN FRONT OF IT (#295). v1.7 tagged the ROW instead — one `.wad` at the
 *  far left — and on a LON/LAT pair that reads as a label for the left number only: "unfortunately it is
 *  again inharmonious, because on the left is '.wad' and on the right not. => My suggestion is to write in
 *  all cases (also with HEADING) 'WAD:' in front of each relevant field." So the tag belongs to the VALUE,
 *  not to the line, and there is exactly one shape for both callers.
 *
 *  Double-click copies, which is the gesture he asked for by name; `user-select: all` in the stylesheet
 *  means a single click also selects the whole number, so Ctrl+C works for anyone who does not know about
 *  the double-click. The chip goes green because a double-click that copies SILENTLY is indistinguishable
 *  from a double-click that did nothing. */
function WadCell({ value, label }: { value: string; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span className="pct-wad-item">
      <span
        className="pct-wad-tag"
        title="The same value in the units FS4 stores inside its world-airport database: longitude and latitude on a 0–65536 projected grid, directions in radians. PCT does not write .wad files — this is a read-out."
      >
        WAD:
      </span>
      <code
        className={copied ? "pct-wad-cell copied" : "pct-wad-cell"}
        title={`${label}: ${value} — double-click to copy`}
        aria-label={label}
        onDoubleClick={() => {
          // ★ THE GREEN WAITS FOR THE WRITE. Flashing first and asking later makes the chip claim a copy
          // the clipboard refused — which is exactly what a denied permission does, and it fails as a
          // rejected promise, not a throw. Caught in the browser preview, where permission IS denied.
          const write = navigator.clipboard?.writeText(value);
          if (write === undefined) return;
          void write.then(
            () => {
              setCopied(true);
              clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), COPIED_MS);
            },
            () => undefined, // no clipboard here — say nothing rather than lie
          );
        }}
      >
        {value}
      </code>
    </span>
  );
}

/** The line under a field row. It carries no tag of its own any more (#295) — every cell brings one — so
 *  what is left is the ALIGNMENT: its gap is `.pct-field-row`'s, which is what puts the LAT read-out under
 *  LAT instead of a tag-width to the left of it. */
function WadRow({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="pct-wad-under">{children}</div>;
}

/** Goes directly under a LON / LAT field row: one cell per field, in the same order. */
export function WadPosition({ position }: { position: LonLat }): React.ReactElement {
  return (
    <WadRow>
      <WadCell label="Longitude in .wad units" value={formatWad(lonToWad(position.lon))} />
      <WadCell label="Latitude in .wad units" value={formatWad(latToWad(position.lat))} />
    </WadRow>
  );
}

/** Goes directly under a HEADING field.
 *
 *  ★ THE COMPASS HEADING IS NOT THE STORED NUMBER. A `.wad` carries the raw `direction` in radians, and
 *  `direction = (90 − heading)` (geo/orientation.ts, forum #120) — which is why this calls the SAME
 *  `headingToWadDirection` the writer calls rather than spelling the composition out again here. */
export function WadHeading({ heading }: { heading: number }): React.ReactElement {
  return (
    <WadRow>
      <WadCell label="Direction in .wad units, radians" value={formatWad(headingToWadDirection(heading))} />
    </WadRow>
  );
}
