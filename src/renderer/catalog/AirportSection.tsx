// AirportSection.tsx — the catalog's Airport section: one card, "Start - Helicopter", which arms the
// helipad and drops it on the next map click.
//
// WHY IT EXISTS (forum #173, ApfelFlieger). Until v1.3 the only way to get a start pad was to open
// "Create HELIPORT…", scroll past three text fields and press a button inside the dialog — then close
// the dialog to be able to drag what you had just made, because the dialog covers the map. He tested
// 1.2 the way he always does, twice: once "intuitive — without reading what Claude wrote", then guided.
// The intuitive pass is the one that matters here, and it produced a screenshot of an empty world map
// with a stray dot on it. His ask, in his words: a button in the left column that you click, which is
// then listed on the right for editing — "if the procedure is exactly the same as when positioning the
// POI elements, then PCT works consistently comparable".
//
// So this card behaves exactly like a light or a plant: click to arm, click the map to drop, Escape to
// cancel. The one difference is downstream, in the store: there is one pad per project, so placing
// again MOVES it and placement disarms after the drop (see placeAt).
//
// The name is his too — "Start - Helicopter", from the section he sketched with the rest greyed out for
// later (Start-Runway, Glider-Aerotow, Parking-Aircraft…). Nothing here is built for those; the section
// is named Airport so they have somewhere to land if they ever exist.
import { useCallback } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { HelipadIcon } from "./categoryIcon";

export function AirportSection(): React.ReactElement {
  const placing = useEditor((s) => s.placing);
  const hasPad = useEditor((s) => s.project.airport !== undefined);
  const query = useEditor((s) => s.filter.query);

  const armed = placing?.kind === "helipad";

  // The search box filters every section (a query that hides the xrefs but leaves this card sitting
  // there reads as a bug — see LightsSection's note on the same problem).
  const q = query.trim().toLowerCase();
  const matches = q === "" || "start - helicopter helipad heliport".includes(q);

  const arm = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "helipad" ? null : { kind: "helipad" });
  }, []);

  return (
    <details className="pct-lights">
      <summary className="pct-lights-summary">Airport ({matches ? 1 : 0})</summary>
      <div className="pct-lights-list">
        {matches ? (
          <button
            type="button"
            className={armed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={armed}
            title={
              hasPad
                ? "Move the helicopter's start pad — click the map to put it somewhere else"
                : "Where a flight starts. Click, then click the map"
            }
            onClick={arm}
          >
            <HelipadIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Start - Helicopter</span>
              {/* The subtitle carries the one thing that is different from every other card: there is
                  only ever one, so a second click relocates rather than adds. Saying it here is cheaper
                  than letting someone discover it by placing a second pad that never appears. */}
              <span className="pct-obj-cat">
                {hasPad ? "already placed · click the map to move it" : "the helicopter's start pad"}
              </span>
            </span>
          </button>
        ) : (
          <p className="pct-empty">No matching airport parts</p>
        )}
      </div>
    </details>
  );
}
