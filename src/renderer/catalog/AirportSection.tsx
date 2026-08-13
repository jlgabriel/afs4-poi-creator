// AirportSection.tsx — the catalog's Airport section: the cards that arm an airport part and drop it on
// the next map click.
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
// So these cards behave exactly like a light or a plant: click to arm, click the map to drop, Escape to
// cancel. The section is his design too (#217/#227/#232): Data · Helipad · Parking · Runway · Aerotow ·
// Winch Launch. Two of the six exist so far.
//
// ★ THE ONE PLACE THE TWO CARDS DIFFER, and it is the model's doing, not a UI choice: there is one start
// pad per project, so placing again MOVES it and placement disarms after the drop. "Any number of parking
// positions can be created" (#232), so a stand drops and stays armed, like every object card. Each card
// says which it is in its own subtitle rather than leaving it to be discovered.
import { useCallback } from "react";
import type { ParkingType } from "../../core/project/types";
import { PARKING_TYPES, PARKING_TYPE_LABELS } from "../../core/project/airport";
import { editorStore, useEditor } from "../state/editorStore";
import { HelipadIcon, ParkingIcon, RunwayIcon } from "./categoryIcon";

/** The stand type a fresh card arms. GA is the common case and the smallest footprint, so a user who
 *  never opens the type field gets the stand a light aircraft fits on rather than a 40 m jet apron. */
const DEFAULT_NEW_PARKING: ParkingType = "parked_ga";

/** What each card answers the search box with. The words are what someone would actually type looking
 *  for the thing, not the label alone — "heliport" finds the pad, "stand"/"gate"/"apron" find parking. */
const HELIPAD_TERMS = "start - helicopter helipad heliport pad";
const PARKING_TERMS = `parking stand gate apron aircraft ${PARKING_TYPES.map(
  (t) => PARKING_TYPE_LABELS[t],
).join(" ")}`.toLowerCase();
const RUNWAY_TERMS = "runway strip threshold papi reil approach lighting";

export function AirportSection(): React.ReactElement {
  const placing = useEditor((s) => s.placing);
  // PADS, not "is there an airport block". Placing a stand creates the block too (mutate.ts: putting an
  // airport part on the map is the user asking for the airport in as many words), so keying this off the
  // block made the card claim "already placed" for a project whose only airport part was a stand.
  // Spotted on screen in the preview harness, not by a test.
  const hasPad = useEditor((s) => (s.project.airport?.pads.length ?? 0) > 0);
  const standCount = useEditor((s) => s.project.airport?.parkings?.length ?? 0);
  const runwayCount = useEditor((s) => s.project.airport?.runways?.length ?? 0);
  const query = useEditor((s) => s.filter.query);

  const padArmed = placing?.kind === "helipad";
  const parkingArmed = placing?.kind === "parking";
  const runwayArmed = placing?.kind === "runway";

  // The search box filters every section (a query that hides the xrefs but leaves these cards sitting
  // there reads as a bug — see LightsSection's note on the same problem).
  const q = query.trim().toLowerCase();
  const padMatches = q === "" || HELIPAD_TERMS.includes(q);
  const parkingMatches = q === "" || PARKING_TERMS.includes(q);
  const runwayMatches = q === "" || RUNWAY_TERMS.includes(q);
  const count = (padMatches ? 1 : 0) + (parkingMatches ? 1 : 0) + (runwayMatches ? 1 : 0);

  const armPad = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "helipad" ? null : { kind: "helipad" });
  }, []);

  const armParking = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore
      .getState()
      .armPlacement(
        cur?.kind === "parking" ? null : { kind: "parking", parkingType: DEFAULT_NEW_PARKING },
      );
  }, []);

  const armRunway = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "runway" ? null : { kind: "runway" });
  }, []);

  return (
    <details className="pct-lights">
      <summary className="pct-lights-summary">Airport ({count})</summary>
      <div className="pct-lights-list">
        {padMatches && (
          <button
            type="button"
            className={padArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={padArmed}
            title={
              hasPad
                ? "Move the helicopter's start pad — click the map to put it somewhere else"
                : "Where a flight starts. Click, then click the map"
            }
            onClick={armPad}
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
        )}
        {parkingMatches && (
          <button
            type="button"
            className={parkingArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={parkingArmed}
            title="Where an aircraft is parked and can start a flight from. Click, then click the map"
            onClick={armParking}
          >
            <ParkingIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Parking</span>
              <span className="pct-obj-cat">
                {standCount === 0
                  ? "a stand to start a flight from"
                  : `${standCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {runwayMatches && (
          <button
            type="button"
            className={runwayArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={runwayArmed}
            title="A runway. Click, then click the map — then drag either threshold"
            onClick={armRunway}
          >
            <RunwayIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Runway</span>
              {/* The one thing about this card that surprises: the click does not put a thing under the
                  cursor, it starts one you then shape. Saying it beats letting someone place a runway
                  pointing the wrong way and conclude PCT guessed. */}
              <span className="pct-obj-cat">
                {runwayCount === 0
                  ? "drops a strip · drag its two ends"
                  : `${runwayCount} placed · drops a strip you then drag`}
              </span>
            </span>
          </button>
        )}
        {count === 0 && <p className="pct-empty">No matching airport parts</p>}
      </div>
    </details>
  );
}
