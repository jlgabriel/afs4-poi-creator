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
// cancel. The section is his design too (#217/#227/#232), and so is the ORDER — which he revised in #277
// after seeing all six at work: Airport · Runway · Helipad · Parking · Aerotow · Winch Launch.
//
// ★ THE ORDER IS A PAIR, NOT A LIST. His rule: "the sequences in both columns remain identical", after he
// noticed PARKING and RUNWAY had swapped places between the catalog and the placed list. Neither column
// owns it, so changing one of them alone is the bug — PlacedList.tsx carries the same order and a note
// pointing back here. The order itself is "the one that an average user expects", his words, and it is
// deliberately NOT the TAP file's (which he discounts: "only an operating file in which the logical order
// does not matter").
//
// ★ AIRPORT IS THE ODD ONE, and honestly so: it places no PART. There is one airport per project and its
// identity is not geometry — but since #273 its card arms a placement like every other card here, because
// the airport does have a point of its own to put down (see `startAirport`).
//
// ★ AND THE FIVE DIFFER AMONG THEMSELVES in whether the drop re-arms, which is the model's doing rather
// than a UI choice: a repeatable part stays armed for the next one, and the two that a single click lays
// out whole (a runway, a winch launch) disarm so the next thing you do is drag an end. Each card says
// which it is in its own subtitle rather than leaving it to be discovered.
import { useCallback } from "react";
import type { ParkingType } from "../../core/project/types";
import { PARKING_TYPES, PARKING_TYPE_LABELS } from "../../core/project/airport";
import { editorStore, useEditor } from "../state/editorStore";
import { AerotowIcon, DataIcon, HelipadIcon, ParkingIcon, RunwayIcon, WinchIcon } from "./categoryIcon";

/** The stand type a fresh card arms. GA is the common case and the smallest footprint, so a user who
 *  never opens the type field gets the stand a light aircraft fits on rather than a 40 m jet apron. */
const DEFAULT_NEW_PARKING: ParkingType = "parked_ga";

/** What each card answers the search box with. The words are what someone would actually type looking
 *  for the thing, not the label alone — "heliport" finds the pad, "stand"/"gate"/"apron" find parking. */
const DATA_TERMS = "data airport icao iata code country name identity heliport";
const HELIPAD_TERMS = "start - helicopter helipad heliport pad";
const PARKING_TERMS = `parking stand gate apron aircraft ${PARKING_TYPES.map(
  (t) => PARKING_TYPE_LABELS[t],
).join(" ")}`.toLowerCase();
const RUNWAY_TERMS = "runway strip threshold papi reil approach lighting";
const AEROTOW_TERMS = "aerotow glider tow towing sailplane dr400 start";
const WINCH_TERMS = "winch launch glider cable rope sailplane start";

export function AirportSection(): React.ReactElement {
  const placing = useEditor((s) => s.placing);
  // PADS, not "is there an airport block". Placing a stand creates the block too (mutate.ts: putting an
  // airport part on the map is the user asking for the airport in as many words), so keying this off the
  // block made the card claim "already placed" for a project whose only airport part was a stand.
  // Spotted on screen in the preview harness, not by a test.
  const padCount = useEditor((s) => s.project.airport?.pads.length ?? 0);
  const airportIcao = useEditor((s) => s.project.airport?.icao.trim() ?? "");
  const standCount = useEditor((s) => s.project.airport?.parkings?.length ?? 0);
  const runwayCount = useEditor((s) => s.project.airport?.runways?.length ?? 0);
  const aerotowCount = useEditor((s) => s.project.airport?.aerotows?.length ?? 0);
  const winchCount = useEditor((s) => s.project.airport?.winches?.length ?? 0);
  const query = useEditor((s) => s.filter.query);

  const airportPlaced = useEditor((s) => s.project.airport?.position !== undefined);

  const airportArmed = placing?.kind === "airport";
  const padArmed = placing?.kind === "helipad";
  const parkingArmed = placing?.kind === "parking";
  const runwayArmed = placing?.kind === "runway";
  const aerotowArmed = placing?.kind === "aerotow";
  const winchArmed = placing?.kind === "winch";

  // The search box filters every section (a query that hides the xrefs but leaves these cards sitting
  // there reads as a bug — see LightsSection's note on the same problem).
  const q = query.trim().toLowerCase();
  const dataMatches = q === "" || DATA_TERMS.includes(q);
  const padMatches = q === "" || HELIPAD_TERMS.includes(q);
  const parkingMatches = q === "" || PARKING_TERMS.includes(q);
  const runwayMatches = q === "" || RUNWAY_TERMS.includes(q);
  const aerotowMatches = q === "" || AEROTOW_TERMS.includes(q);
  const winchMatches = q === "" || WINCH_TERMS.includes(q);
  const count =
    (dataMatches ? 1 : 0) +
    (padMatches ? 1 : 0) +
    (parkingMatches ? 1 : 0) +
    (runwayMatches ? 1 : 0) +
    (aerotowMatches ? 1 : 0) +
    (winchMatches ? 1 : 0);

  // ★ TWO CLICKS, LIKE EVERYTHING ELSE IN THIS COLUMN (#273). Through v1.5 this card only made the block
  // and opened its panel; the airport's point was placed by a button INSIDE that panel. He walked into it
  // on a fresh project and wrote down every step: click Airport → "the message 'Put it on the map'
  // appears in the INSPECTOR (I only saw this notice after the third attempt)" → click the map → nothing
  // is marked → right-click, "Put it on the map", THEN the map. His verdict: "the creation of the
  // airfield should work just as simply and intuitively as with all other elements: 2x CLICK = 1x HAPPY."
  //
  // So the card arms. The block is still made here rather than on the map click, because the panel has
  // four fields the user may well want to type before going anywhere near the map — and because Escape
  // then leaves an airport you can still name, not nothing.
  //
  // ★ IT ARMS ONLY WHILE THERE IS NOWHERE TO GO. An airport that already has its ⊕ opens its panel and
  // stays put: the card is the way BACK to the identity fields, and re-arming would turn every visit into
  // a chance to move the airport with a stray click. The panel keeps its own button for that.
  const startAirport = useCallback(() => {
    const st = editorStore.getState();
    // Same toggle as the other five: pressing an armed card is how you change your mind.
    if (st.placing?.kind === "airport") {
      st.armPlacement(null);
      return;
    }
    st.createAirport(); // makes the block if there is none; opens its panel either way
    if (editorStore.getState().project.airport?.position === undefined) {
      st.armPlacement({ kind: "airport" });
    }
  }, []);

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

  const armAerotow = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "aerotow" ? null : { kind: "aerotow" });
  }, []);

  const armWinch = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "winch" ? null : { kind: "winch" });
  }, []);

  return (
    <details className="pct-lights">
      <summary className="pct-lights-summary">Airport ({count})</summary>
      <div className="pct-lights-list">
        {dataMatches && (
          <button
            type="button"
            className={airportArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={airportArmed}
            title={
              airportPlaced
                ? "The airport's name and code — what it becomes in Aerofly"
                : "The airport itself. Click, then click the map"
            }
            onClick={startAirport}
          >
            <DataIcon />
            <span className="pct-obj-text">
              {/* "Airport", not "Data" (#255). His rule: "The elements in the right column must always
                  have the same main name as in the left column to avoid confusion" — the placed row and
                  the inspector both say Airport, so this card had to. He weighed and rejected the other
                  way out of the mismatch ("Airport - Data" · "Airport - Helipad" …) as too much. "data"
                  stays a search term below, since that is what the submenu was called for two versions. */}
              <span className="pct-obj-name">Airport</span>
              {/* The subtitle turns on WHERE THE AIRPORT IS, not on whether the block exists, because
                  that is what the click does next. Until it has a point the card is a placement like the
                  five below it; after that it is the door back to the four identity fields. */}
              <span className="pct-obj-cat">
                {!airportPlaced
                  ? "click the map to put it down"
                  : airportIcao === ""
                    ? "no code yet · click to fill it in"
                    : `${airportIcao.toUpperCase()} · click to edit`}
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
        {padMatches && (
          <button
            type="button"
            className={padArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={padArmed}
            title="Where a helicopter flight starts. Click, then click the map"
            onClick={armPad}
          >
            <HelipadIcon />
            <span className="pct-obj-text">
              {/* "Helipad" (#256), which also settles the question left open in #227 — singular, not
                  "Helipads", and the same word in the placed row and the panel. */}
              <span className="pct-obj-name">Helipad</span>
              {/* It said "already placed · click the map to move it" until #221 made the element
                  repeatable. A card that still said that would be describing the v1.3 model, and the
                  count is the thing that tells you it is not. */}
              <span className="pct-obj-cat">
                {padCount === 0
                  ? "the helicopter's start pad"
                  : `${padCount} placed · click the map to add another`}
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
        {aerotowMatches && (
          <button
            type="button"
            className={aerotowArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={aerotowArmed}
            title="Where a glider waits to be towed into the air. Click, then click the map"
            onClick={armAerotow}
          >
            <AerotowIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Aerotow</span>
              <span className="pct-obj-cat">
                {aerotowCount === 0
                  ? "a glider start, towed by the DR400"
                  : `${aerotowCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {winchMatches && (
          <button
            type="button"
            className={winchArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={winchArmed}
            title="A glider launched by a winch. Click, then click the map — then drag either end"
            onClick={armWinch}
          >
            <WinchIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Winch Launch</span>
              {/* The warning this subtitle carried from v1.4.0 is gone: he reported the bug to IPACS
                  himself (#229) and reported the fix himself too — "In the FS 4 the winch is repaired,
                  so the warning can already go away" (#261). */}
              <span className="pct-obj-cat">
                {winchCount === 0
                  ? "lays out a rope · drag its two ends"
                  : `${winchCount} placed · lays out a rope you then drag`}
              </span>
            </span>
          </button>
        )}
        {count === 0 && <p className="pct-empty">No matching airport parts</p>}
      </div>
    </details>
  );
}
