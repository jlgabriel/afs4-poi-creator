// BoundaryFields.tsx — the Inspector's panel for the airport BOUNDARY.
//
// No coordinate fields: a ring of points is edited on the map, not typed. The panel says how (the help
// text is a promise BoundaryLayer has to keep), shows the size of the ring, and says so when it crosses
// itself — the converter wants a simple polygon, and a crossing is easy to make by dragging one point
// past another.
import type { LonLat } from "../../core/project/types";
import { haversine } from "../../core/geo/geo";
import { ringSelfIntersects } from "../../core/geo/polygon";
import { Help } from "./HelpNote";

function perimeterM(ring: readonly LonLat[]): number {
  return ring.reduce((sum, p, i) => sum + haversine(p, ring[(i + 1) % ring.length]!), 0);
}

const fmtLength = (m: number): string => (m < 10000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function BoundaryFields({ boundary }: { boundary: LonLat[] }): React.ReactElement {
  const crosses = ringSelfIntersects(boundary);
  return (
    <div className="pct-inspector-body">
      <div className="pct-field-title">Boundary</div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Boundary
          {/* ★ THIS TEXT IS A TEST: every gesture it names is one BoundaryLayer must answer. */}
          <Help>
            The polygon around the whole airport, for Export TAP. Drag a white point to move it, drag a grey
            point to add one there, right-click a white point to remove it. Drag inside the polygon to move
            all of it.
          </Help>
        </span>
        <span className="pct-field-meta">
          {boundary.length} points · {fmtLength(perimeterM(boundary))} around
        </span>
        {crosses && (
          <span className="pct-warn">
            The boundary crosses itself. Drag its points so that no two edges cross.
          </span>
        )}
      </div>

      <p className="pct-field-meta">
        To draw it again, delete it and click the <strong>Boundary</strong> card.
      </p>
    </div>
  );
}
