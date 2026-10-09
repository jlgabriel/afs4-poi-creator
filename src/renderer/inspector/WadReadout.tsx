// WadReadout.tsx — the `.wad` value of the field directly above it, for the six Airport submenus.
//
// Every coordinate and direction of an airport part ends up in the `.wad`, which holds no degrees: a
// projected pair on a 0–65536 grid and rotations in radians. Showing the converted value beside each field
// lets a user copy it; core/geo/wad.ts already computes every one of these numbers for the writer, so
// this costs a render, not a formula.
//
// ★ NOT the collapsed "FS4 internal (.wad)" block the OBJECT panels carry (Inspector.tsx). For an airport
// the value is a working number, so it is ALWAYS VISIBLE and beside its field. Same conversions,
// different posture — hence its own component.
//
// ★ IT IS A READ-OUT: it changes nothing. The `.wad` and `.tsc` themselves are written only when an
// airport is installed into scenery/airports (core/export/heliportTemplate.ts), from the same functions.
import { useEffect, useRef, useState } from "react";
import type { LonLat } from "../../core/project/types";
import { formatWad, headingToWadDirection, latToWad, lonToWad } from "../../core/geo/wad";

/** How long the chip stays green after a copy. Long enough to notice, short enough that a row of them
 *  does not end up looking like a status board. */
const COPIED_MS = 900;

/** One value, WITH ITS OWN "WAD:" IN FRONT OF IT. A single tag at the far left of a LON/LAT row reads
 *  as a label for the left number only, so the tag belongs to the VALUE, not to the line, and there is
 *  exactly one shape for both callers.
 *
 *  Double-click copies; `user-select: all` in the stylesheet
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
        title="The same value in the units Aerofly's airport files use: longitude and latitude on a 0–65536 grid, directions in radians. A read-out: it changes nothing."
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

/** The line under a field row. It carries no tag of its own — every cell brings one — so what is left
 *  is the ALIGNMENT: its gap is `.pct-field-row`'s, which is what puts the LAT read-out under
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
 *  `direction = (90 − heading)` (geo/orientation.ts) — which is why this calls the SAME
 *  `headingToWadDirection` the writer calls rather than spelling the composition out again here. */
export function WadHeading({ heading }: { heading: number }): React.ReactElement {
  return (
    <WadRow>
      <WadCell label="Direction in .wad units, radians" value={formatWad(headingToWadDirection(heading))} />
    </WadRow>
  );
}
