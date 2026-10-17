// AirportSection.tsx — the catalog's Airport section: the cards that arm an airport part and drop it on
// the next map click.
//
// These cards behave exactly like a light or a plant: click to arm, click the map to drop, Escape to
// cancel — the same procedure as placing POI objects, so nothing new has to be learned. Order:
// Airport · Runway · Aerotow · Winch Launch · Helipad · Parking · Tarmac · Line · Ground Text · Taxi Sign ·
// Jetway · Car Lot. The glider starts follow the runway they belong to.
//
// ★ NO BOUNDARY CARD: the boundary is one polygon per airport, part of the airport the way its point is,
// so it is drawn and opened from the Airport panel (AirportDataFields BoundaryButton). The Airport card
// answers a search for it.
//
// ★ THE ORDER IS A PAIR, NOT A LIST: the catalog and the placed list must show the same sequence.
// Neither column owns it, so changing one of them alone is the bug — PlacedList.tsx carries the same
// order and a note pointing back here. It is the order a user expects, deliberately NOT the .tap file's
// (whose order has no meaning).
//
// ★ AIRPORT IS THE ODD ONE: it places no PART. There is one airport per project and its identity is not
// geometry — but its card still arms a placement like every other card here, because the airport has a
// point of its own to put down (see `startAirport`).
//
// ★ AND THE FIVE DIFFER AMONG THEMSELVES in whether the drop re-arms, which is the model's doing rather
// than a UI choice: a repeatable part stays armed for the next one, and the two that a single click lays
// out whole (a runway, a winch launch) disarm so the next thing you do is drag an end. Each card says
// which it is in its own subtitle rather than leaving it to be discovered.
import { useCallback } from "react";
import type { MarkKind } from "../state/store";
import type { ParkingType } from "../../core/project/types";
import { PARKING_TYPES, PARKING_TYPE_LABELS } from "../../core/project/airport";
import { editorStore, useEditor } from "../state/editorStore";
import {
  AerotowIcon,
  CarlotIcon,
  DataIcon,
  GroundTextIcon,
  HelipadIcon,
  JetwayIcon,
  LineIcon,
  ParkingIcon,
  RunwayIcon,
  TarmacIcon,
  TaxisignIcon,
  WinchIcon,
} from "./categoryIcon";

/** The stand type a fresh card arms. GA is the common case and the smallest footprint, so a user who
 *  never opens the type field gets the stand a light aircraft fits on rather than a 40 m jet apron. */
const DEFAULT_NEW_PARKING: ParkingType = "parked_ga";

/** What each card answers the search box with. The words are what someone would actually type looking
 *  for the thing, not the label alone — "heliport" finds the pad, "stand"/"gate"/"apron" find parking. */
const DATA_TERMS = "data airport icao code country name identity heliport boundary bounds polygon outline perimeter";
const HELIPAD_TERMS = "start - helicopter helipad heliport pad";
const PARKING_TERMS = `parking stand gate apron aircraft ${PARKING_TYPES.map(
  (t) => PARKING_TYPE_LABELS[t],
).join(" ")}`.toLowerCase();
const RUNWAY_TERMS = "runway strip threshold papi reil approach lighting";
const TARMAC_TERMS = "tarmac apron taxiway pavement asphalt concrete grass surface material flatten polygon";
const LINE_TERMS = "line marking taxiway centre center centerline edge hold short paint";
const GROUNDTEXT_TERMS = "ground text marking letter paint taxiway sign painted";
const TAXISIGN_TERMS = "taxi sign taxiway signs signboard location destination runway hold arrow";
const JETWAY_TERMS = "jetway jet bridge gate terminal boarding";
const CARLOT_TERMS = "car lot park parking cars vehicles";
const AEROTOW_TERMS = "aerotow glider tow towing sailplane dr400 start";
const WINCH_TERMS = "winch launch glider cable rope sailplane start";

/** A drawing card's subtitle while it is armed: how far along the shape is and how to finish it. */
function shapeProgress(points: number, min: number): string {
  return points < min
    ? `${points} point${points === 1 ? "" : "s"} · click to add, double-click the last`
    : `${points} points · double-click the last to finish`;
}

export function AirportSection(): React.ReactElement {
  const placing = useEditor((s) => s.placing);
  // PADS, not "is there an airport block". Placing a stand creates the block too (mutate.ts: putting an
  // airport part on the map is the user asking for the airport in as many words), so keying this off the
  // block made the card claim "already placed" for a project whose only airport part was a stand.
  const padCount = useEditor((s) => s.project.airport?.pads.length ?? 0);
  const airportIcao = useEditor((s) => s.project.airport?.icao.trim() ?? "");
  const standCount = useEditor((s) => s.project.airport?.parkings?.length ?? 0);
  const runwayCount = useEditor((s) => s.project.airport?.runways?.length ?? 0);
  const aerotowCount = useEditor((s) => s.project.airport?.aerotows?.length ?? 0);
  const winchCount = useEditor((s) => s.project.airport?.winches?.length ?? 0);
  const tarmacCount = useEditor((s) => s.project.airport?.tarmacs?.length ?? 0);
  const lineCount = useEditor((s) => s.project.airport?.lines?.length ?? 0);
  const groundTextCount = useEditor((s) => s.project.airport?.groundtexts?.length ?? 0);
  const taxisignCount = useEditor((s) => s.project.airport?.taxisigns?.length ?? 0);
  const jetwayCount = useEditor((s) => s.project.airport?.jetways?.length ?? 0);
  const carlotCount = useEditor((s) => s.project.airport?.carlots?.length ?? 0);
  const draftPoints = useEditor((s) => s.shapeDraft.length);
  const query = useEditor((s) => s.filter.query);

  const airportPlaced = useEditor((s) => s.project.airport?.position !== undefined);

  const airportArmed = placing?.kind === "airport";
  const padArmed = placing?.kind === "helipad";
  const parkingArmed = placing?.kind === "parking";
  const runwayArmed = placing?.kind === "runway";
  const aerotowArmed = placing?.kind === "aerotow";
  const winchArmed = placing?.kind === "winch";
  const tarmacArmed = placing?.kind === "tarmac";
  const lineArmed = placing?.kind === "line";

  // The search box filters every section (a query that hides the xrefs but leaves these cards sitting
  // there reads as a bug — see LightsSection's note on the same problem).
  const q = query.trim().toLowerCase();
  const dataMatches = q === "" || DATA_TERMS.includes(q);
  const padMatches = q === "" || HELIPAD_TERMS.includes(q);
  const parkingMatches = q === "" || PARKING_TERMS.includes(q);
  const runwayMatches = q === "" || RUNWAY_TERMS.includes(q);
  const aerotowMatches = q === "" || AEROTOW_TERMS.includes(q);
  const winchMatches = q === "" || WINCH_TERMS.includes(q);
  const tarmacMatches = q === "" || TARMAC_TERMS.includes(q);
  const lineMatches = q === "" || LINE_TERMS.includes(q);
  const groundTextMatches = q === "" || GROUNDTEXT_TERMS.includes(q);
  const taxisignMatches = q === "" || TAXISIGN_TERMS.includes(q);
  const jetwayMatches = q === "" || JETWAY_TERMS.includes(q);
  const carlotMatches = q === "" || CARLOT_TERMS.includes(q);
  const count =
    (dataMatches ? 1 : 0) +
    (padMatches ? 1 : 0) +
    (parkingMatches ? 1 : 0) +
    (tarmacMatches ? 1 : 0) +
    (lineMatches ? 1 : 0) +
    (groundTextMatches ? 1 : 0) +
    (taxisignMatches ? 1 : 0) +
    (jetwayMatches ? 1 : 0) +
    (carlotMatches ? 1 : 0) +
    (runwayMatches ? 1 : 0) +
    (aerotowMatches ? 1 : 0) +
    (winchMatches ? 1 : 0);

  // ★ TWO CLICKS, LIKE EVERYTHING ELSE IN THIS COLUMN: the card arms, the map click places the airport's
  // point. A button inside the Inspector panel for that is easy to miss.
  //
  // The block is still made here rather than on the map click, because the panel has
  // four fields the user may well want to type before going anywhere near the map — and because Escape
  // then leaves an airport you can still name, not nothing.
  //
  // ★ IT ARMS ONLY WHILE THERE IS NOWHERE TO GO. An airport that already has its ⊕ opens its panel and
  // stays put: the card is the way BACK to the identity fields, and re-arming would turn every visit into
  // a chance to move the airport with a stray click. The panel keeps its own button for that.
  //
  // ★★ AND WHILE IT ARMS, IT OPENS NOTHING: the Inspector waits for the map click, exactly as for the
  // other five cards. Uniform behaviour across cards is the rule.
  //
  // The decision itself lives in the store (`startAirportCard`) rather than here, where a test can reach it.
  const startAirport = useCallback(() => editorStore.getState().startAirportCard(), []);

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

  // A tarmac or a line is drawn point by point like the boundary, but any number can exist, so the card
  // always starts a NEW one (and pressing it while drawing cancels, like every card).
  const armTarmac = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "tarmac" ? null : { kind: "tarmac" });
  }, []);

  const armLine = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "line" ? null : { kind: "line" });
  }, []);

  // A ground text, a taxi sign, a jetway or a car lot: drop, select, stay armed — a stand's card.
  const armMark = useCallback((kind: MarkKind) => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === kind ? null : { kind });
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
              {/* "Airport", not "Data": a card must have the same name as its placed row and inspector,
                  which both say Airport. "data" stays a search term, as the card's former name. */}
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
              <span className="pct-obj-cat">
                {winchCount === 0
                  ? "lays out a rope · drag its two ends"
                  : `${winchCount} placed · lays out a rope you then drag`}
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
              {/* "Helipad" — singular, and the same word in the placed row and the panel. */}
              <span className="pct-obj-name">Helipad</span>
              {/* Helipads are repeatable; the count is what tells the user another click adds one. */}
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
        {tarmacMatches && (
          <button
            type="button"
            className={tarmacArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={tarmacArmed}
            title="A paved, grass or flattened area for Export TAP. Click, then click the map point by point — double-click the last one"
            onClick={armTarmac}
          >
            <TarmacIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Tarmac</span>
              <span className="pct-obj-cat">
                {tarmacArmed
                  ? shapeProgress(draftPoints, 3)
                  : tarmacCount === 0
                    ? "an apron, taxiway or ground area"
                    : `${tarmacCount} placed · click to draw another`}
              </span>
            </span>
          </button>
        )}
        {lineMatches && (
          <button
            type="button"
            className={lineArmed ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={lineArmed}
            title="A painted line for Export TAP. Click, then click the map point by point — double-click the last one"
            onClick={armLine}
          >
            <LineIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Line</span>
              <span className="pct-obj-cat">
                {lineArmed
                  ? shapeProgress(draftPoints, 2)
                  : lineCount === 0
                    ? "a painted marking: centre line, edge, hold…"
                    : `${lineCount} placed · click to draw another`}
              </span>
            </span>
          </button>
        )}
        {groundTextMatches && (
          <button
            type="button"
            className={placing?.kind === "groundtext" ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={placing?.kind === "groundtext"}
            title="Letters painted on the pavement, for Export TAP. Click, then click the map"
            onClick={() => armMark("groundtext")}
          >
            <GroundTextIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Ground Text</span>
              <span className="pct-obj-cat">
                {groundTextCount === 0
                  ? "letters painted on the ground"
                  : `${groundTextCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {taxisignMatches && (
          <button
            type="button"
            className={placing?.kind === "taxisign" ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={placing?.kind === "taxisign"}
            title="A taxiway sign, for Export TAP. Click, then click the map where it stands"
            onClick={() => armMark("taxisign")}
          >
            <TaxisignIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Taxi Sign</span>
              <span className="pct-obj-cat">
                {taxisignCount === 0
                  ? "a taxiway sign: location, destination, runway…"
                  : `${taxisignCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {jetwayMatches && (
          <button
            type="button"
            className={placing?.kind === "jetway" ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={placing?.kind === "jetway"}
            title="A jetway on a terminal, for Export TAP. Click, then click the map where it is mounted"
            onClick={() => armMark("jetway")}
          >
            <JetwayIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Jetway</span>
              <span className="pct-obj-cat">
                {jetwayCount === 0
                  ? "a boarding bridge on a terminal"
                  : `${jetwayCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {carlotMatches && (
          <button
            type="button"
            className={placing?.kind === "carlot" ? "pct-obj-card armed" : "pct-obj-card"}
            aria-pressed={placing?.kind === "carlot"}
            title="A car park filled with cars at random, for Export TAP. Click, then click the map"
            onClick={() => armMark("carlot")}
          >
            <CarlotIcon />
            <span className="pct-obj-text">
              <span className="pct-obj-name">Car Lot</span>
              <span className="pct-obj-cat">
                {carlotCount === 0
                  ? "rows of parked cars"
                  : `${carlotCount} placed · click the map to add another`}
              </span>
            </span>
          </button>
        )}
        {count === 0 && <p className="pct-empty">No matching airport parts</p>}
      </div>
    </details>
  );
}
