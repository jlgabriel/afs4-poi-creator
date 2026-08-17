// store.ts — the editor's Zustand store (design §3.6), built to the Fable review P1-4 contract.
//
// The store is a thin, testable shell around the PURE mutations in core/project/mutate.ts. The whole
// point of P1-4 is discipline about WHAT is a document change vs. what is transient:
//
//   DOCUMENT state — project / projectPath / dirty / undo+redo. Only these get snapshotted, dirtied,
//     and autosaved. EVERY document edit funnels through the single `commit()` chokepoint so undo /
//     dirty / autosave can never be forgotten.
//   EPHEMERAL state — selection / placing / filter / the LIVE map camera / a per-object resolved
//     terrain cache. Never on the undo stack, never autosaved. The live camera is the subtle one:
//     it is captured INTO the document only at save time (serializeProject), never mutated on pan —
//     otherwise merely looking around the map lights the "unsaved changes" dot.
//
// Two more P1-4 rules: gesture-end commits only (the map does live drag PREVIEW without touching the
// store; it calls moveObject once on drag-end), and ±nudges COALESCE — holding an arrow is one undo
// entry, not dozens (commitCoalesced). Kept free of DOM globals so it unit-tests under the node
// config; the DOM-coupled singleton + autosave sink live in editorStore.ts.

import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { byDisplayName } from "../catalog/sortObjects";
import type {
  AirportRunwayEnd,
  Catalog,
  CatalogAirportLight,
  CatalogObject,
  CatalogPlant,
  HeightMode,
  HeightSpec,
  LonLat,
  ParkingType,
  PoiShift,
  Project,
  ProjectAirport,
  Settings,
  Vec3,
} from "../../core/project/types";
import type { Airport } from "../../core/airports/types";
import { plantKey } from "../../core/catalog/plants";
import {
  EMPTY_FOOTPRINTS,
  applyFootprintOverrides,
  type FootprintOverrides,
} from "../../core/catalog/footprints";
import { destination } from "../../core/geo/geo";
import { lineUp, spaceEvenly } from "../../core/geo/arrange";
import { DEFAULT_PAD_RADIUS_M } from "../../core/export/planExport";
import { aerotowsOf, parkingsOf, runwaysOf, winchesOf } from "../../core/project/airport";
import * as mutate from "../../core/project/mutate";

export type Camera = Project["camera"];
/** The map tile config the renderer needs (a view of Settings.tiles). Held in the store so MapView can
 *  swap the tile layer live when Settings changes it, without a full remount. */
export type TilesConfig = Settings["tiles"];
export const DEFAULT_TILES: TilesConfig = { provider: "esri" };
export interface Filter {
  query: string;
  category: string | null;
}

/** What click-to-place is armed for. `name` is the xref catalog name or the airport-light typeName;
 *  a point light is parametric (no name); a plant needs BOTH halves of its identity, so it carries the
 *  pair rather than a name (see plants.plantKey). null = nothing armed. */
export type PlacingSpec =
  | { kind: "xref"; name: string }
  | { kind: "airport_light"; name: string }
  | { kind: "light" }
  // v1.3 (forum #173): the helicopter's start pad, armed from the catalog's Airport section and dropped
  // by clicking the map — the same three gestures every other card uses. It is NOT a placed object (see
  // placeAt), so this is the one spec that writes the airport block instead of adding to `objects`.
  | { kind: "helipad" }
  // v1.4 (forum #232): a parking position. Unlike the pad, "any number can be created", so this is the
  // ordinary multi-drop card — it arms, drops, and STAYS armed. The type rides along because the catalog
  // card is what chooses it; everything else about the stand is edited in the Inspector.
  | { kind: "parking"; parkingType: ParkingType }
  // v1.4 (forum #242): a runway. ONE click drops the whole thing — end 1 under the cursor, end 2 a
  // default length due east — and the user then drags either threshold. He asked for both points to be
  // clickable on the map "parallel to an input field", which is map-settable IN ADDITION TO numeric
  // fields, not a demand that creation take two clicks; and a card that needs two clicks when every
  // other card needs one is the inconsistency #173 asked us to remove.
  | { kind: "runway" }
  // v1.4 (forum #237/#238): the two glider starts. An AEROTOW is a point plus a heading, so it behaves
  // like a stand — drop, select, stay armed. A WINCH is a PAIR of points with no heading at all, so it
  // behaves like a runway — one click lays the whole rope out and disarms.
  | { kind: "aerotow" }
  | { kind: "winch" }
  // v1.5 (forum #255): the AIRPORT's own point. "The coordinates of the airport must be possible for the
  // user both by clicking on the map and by entering the two fields LON and LAT" — this is the first
  // half. It is the odd one of the set in that it MOVES the one airport rather than adding anything, so
  // it is armed only while the airport has no point of its own; once it has one, it is a thing you drag.
  | { kind: "airport" }
  // `naturalHeight` rides along rather than being looked up at place time. The palette has the
  // CatalogPlant in hand when it arms, so carrying it removes the only path where a plant could be
  // created with height 0 — the one value that may mean "invisible" (see mutate.createPlant).
  | { kind: "plant"; group: string; species: string; naturalHeight: number };

/** Which airport part the Inspector is showing, if any.
 *
 *  v1.4 (forum #217) turns the airport into FIVE repeatable kinds, so v1.3's `padSelected: boolean` can
 *  no longer say which one is selected. Only the cardinality changed, so only the type widened: this is
 *  still a field of its own rather than a sentinel id inside `selection`, and the v1.3 reason holds —
 *  a dozen call sites do `objects.find(o => o.id === selection[0])` and every one of them would have to
 *  learn about an id that is not an object's.
 *
 *  Mutually exclusive with `selection`: the Inspector shows exactly one thing, so selecting either
 *  clears the other.
 *
 *  ★ A runway END is deliberately not part of this key. An end is addressed by index (0 | 1) inside its
 *  panel and by which handle the drag grabbed, which is the shape `mutate.updateAirportRunwayEnd` already
 *  takes. Putting it here would add a fourth piece of state to a field three components read, to express
 *  something only one of them needs. */
export type AirportSelection =
  | { kind: "data" }
  | { kind: "pad" | "runway" | "parking" | "aerotow" | "winch"; id: string };

/** Drop whichever airport part the selection names. Exhaustive on purpose — no `default` branch — so
 *  adding a seventh kind to AirportSelection fails the typecheck here instead of silently deleting
 *  nothing when the user presses Del.
 *
 *  ★ `data` deletes the WHOLE airport, geometry and all, and it is the only way to do that on purpose.
 *  The identity is not a part you can delete on its own — an airport without a name is still an airport,
 *  and there would be nothing on screen to show for it — so Del on the Data row means "no airport here",
 *  which is what selecting the airport itself and pressing Del reads as. */
function removeAirportPart(project: Project, sel: AirportSelection): Project {
  switch (sel.kind) {
    case "data":
      return mutate.setAirport(project, null);
    case "pad":
      return mutate.removeAirportPad(project, sel.id);
    case "parking":
      return mutate.removeAirportParking(project, sel.id);
    case "runway":
      return mutate.removeAirportRunway(project, sel.id);
    case "aerotow":
      return mutate.removeAirportAerotow(project, sel.id);
    case "winch":
      return mutate.removeAirportWinch(project, sel.id);
  }
}

const UNDO_CAP = 50; // design §3.6: snapshot stacks capped at 50
/** The blank-project world view (new project before the user navigates). Exported for the shell's
 *  New / bootstrap paths so they don't duplicate the literal. */
export const DEFAULT_CAMERA: Camera = { lon: 0, lat: 20, zoom: 2 };

/** flyTo target zoom for an airport pick: wide enough to frame the whole field/runway. The default
 *  flyTo zoom (≥17) is object-placement close — too tight to see an airport — so the airport search
 *  passes this instead. */
export const AIRPORT_ZOOM = 13;

/** The bearing every two-point airport element is laid out along when it is dropped, degrees true.
 *
 *  ★ NORTH, and it is his rule (forum #253b): "The map section in the PCT is north-south oriented. I
 *  recommend this orientation when inserting all elements of the MENU AIRPORT" — because it sits well
 *  against the map, and because "most users like me should think compass-oriented and I find it easier
 *  to turn the elements in the right direction from a north-south orientation."
 *
 *  The one-point elements already obeyed it without anyone deciding to: a pad, a stand and an aerotow all
 *  come out of mutate.ts at `heading: 0`. Only the two that a single click lays out WHOLE had a bearing of
 *  their own, and both pointed east. */
export const NEW_ELEMENT_BEARING_DEG = 0;

/** How long a freshly dropped runway is, metres, before the user drags either threshold. A starting value
 *  in a field the user edits, not a measurement.
 *
 *  ★ 200, DOWN FROM 1000 (forum #258). His argument is about which mistake is cheaper to undo: "It is much
 *  easier for the user to lengthen a short runway than to first get out of the map and then get back in
 *  with a shortened runway." A kilometre of strip runs off the screen at the zoom people actually place
 *  things at, and recovering from that costs two zoom changes; a short one costs one drag. His own words
 *  for the target: the runway should not leave the map section, and "a length of e.g. 200 m is sufficient".
 *
 *  PCT still does NOT fill the identifiers in from the bearing (mutate.addAirportRunway leaves them empty,
 *  which is legal and is what his 0001 sample does): naming a runway is a claim about the real world that
 *  a default heading cannot make. That was true when the default pointed east and it is true pointing
 *  north — nothing here means the strip is 18/36. */
export const NEW_RUNWAY_LENGTH_M = 200;

/** How much rope a freshly dropped winch launch starts with, metres. His range: "the distance between the
 *  glider and the winch is 800 to 1000 m", so the middle of it — and, like the runway's default length, a
 *  starting value the user then drags.
 *
 *  ⚠️ NOT shortened alongside the runway, and the difference is deliberate. #258 is about a runway, whose
 *  length PCT invents outright; the rope's length is a figure HE gave for what a winch launch actually is.
 *  Cutting it to fit the viewport would trade a number that means something for one that only looks tidy.
 *  If he asks for it too, it is one constant. */
export const NEW_WINCH_ROPE_M = 900;

const capUndo = (stack: Project[]): Project[] =>
  stack.length > UNDO_CAP ? stack.slice(stack.length - UNDO_CAP) : stack;

const sameCamera = (a: Camera, b: Camera): boolean =>
  a.lon === b.lon && a.lat === b.lat && a.zoom === b.zoom;

/** The project as it should be SERIALIZED: the live map camera stamped into the document. This is
 *  the one place the ephemeral camera meets the saved file (autosave + Save both go through it). */
export function serializeProject(s: Pick<EditorState, "project" | "mapView">): Project {
  return sameCamera(s.project.camera, s.mapView) ? s.project : { ...s.project, camera: s.mapView };
}

/** Advance one HeightSpec by `delta` metres. The first nudge on a "terrain" object PROMOTES it to
 *  "terrain-offset" (Fable P2-8: the promotion is silent but its result — "Terrain + 0.50 m" — is
 *  visible in the inspector). */
function nudgeHeightSpec(h: HeightSpec, delta: number): HeightSpec {
  switch (h.mode) {
    case "asl":
      return { mode: "asl", value: h.value + delta };
    case "terrain":
      return { mode: "terrain-offset", offset: delta };
    case "terrain-offset":
      return { mode: "terrain-offset", offset: h.offset + delta };
  }
}

/** The catalog + its three indexes, with the user's footprint measurements already applied. ONE derivation
 *  shared by "a catalog arrived" and "the measurements changed", because the two must produce identical
 *  state — and because every index below has to be a FRESH Map on either event: FootprintLayer rebuilds an
 *  entry when an index's identity changes (Fable I3), which is exactly how a measurement typed in the
 *  dialog reaches the map. `catalogRaw` is the scan as it came, kept so a later edit re-derives from the
 *  scan rather than from an already-overridden catalog. */
function catalogSlice(
  raw: Catalog,
  footprints: FootprintOverrides,
): Pick<EditorState, "catalogRaw" | "catalog" | "catalogIndex" | "airportLightIndex" | "plantIndex"> {
  const applied = applyFootprintOverrides(raw, footprints);
  // Browse the catalog A–Z instead of raw .tmi scan order (community request — chrispriv & Michael).
  // Sorted here at the renderer funnel (not in buildCatalog) so users booting from a cached catalog get it
  // without a Rescan. Array.sort is stable, so same-name install/user duplicates keep their order — the
  // name→object index below (last-wins = user wins) and the self-sorting category tree are unaffected.
  const xref = [...applied.xref].sort(byDisplayName);
  return {
    catalogRaw: raw,
    catalog: { ...applied, xref },
    catalogIndex: new Map(xref.map((o) => [o.name, o])),
    airportLightIndex: new Map(applied.airportLights.map((l) => [l.typeName, l])),
    // A catalog.json cached by v0.3 DOES have a `plants` key — it has been `plants: []` in the type since
    // M0 — so this can't crash on upgrade. It resolves to an EMPTY palette instead, which is the same
    // first-launch-after-update state v0.2's lights had, and it is handled the same way: PlantsSection
    // shows a Rescan hint rather than an unexplained empty list.
    plantIndex: new Map((applied.plants ?? []).map((p) => [plantKey(p), p])),
  };
}

export interface EditorState {
  // ── reference data (loaded, not part of the document) ──
  catalog: Catalog | null; // as BROWSED: sorted, with footprint overrides applied
  catalogRaw: Catalog | null; // as SCANNED — the input catalogSlice re-derives from when overrides change
  catalogIndex: Map<string, CatalogObject>; // xref, by exact name
  airportLightIndex: Map<string, CatalogAirportLight>; // v0.2 airport lights, by typeName
  plantIndex: Map<string, CatalogPlant>; // v0.4 plants, by plantKey() — "group/species", not one name
  // v0.9 footprint overrides: the user's own width × depth × height for objects the scan can't measure.
  // Reference data like the photos — main owns the file, this is the loaded copy, and every write comes
  // back as a whole new set (there is no partial update path to get out of sync with).
  footprints: FootprintOverrides;
  airports: Airport[]; // sim airport list (bundled), for the TopBar search → flyTo; never saved
  tiles: TilesConfig; // map tile provider (from Settings); MapView subscribes → live tile swap
  // v0.6 object photos: the lowercased catalog names that have a user photo in settings.thumbnailsDir.
  // Reference data (never saved/undone); a Set so a card's <Thumbnail> is an O(1) has() check. `epoch`
  // bumps only when the set CONTENT changes, so the image-data cache busts on a real change but a
  // no-op focus refresh doesn't churn every thumbnail.
  thumbnailNames: Set<string>;
  thumbnailEpoch: number;

  // ── DOCUMENT (snapshotted / dirtied / autosaved) ──
  project: Project;
  projectPath: string | null; // display-only; main owns the real path (P0-2)
  dirty: boolean;
  undoStack: Project[];
  redoStack: Project[];

  // ── EPHEMERAL (never undo, never autosaved) ──
  selection: string[]; // placed-object ids (multi-select ready)
  // The airport part the Inspector is showing — see AirportSelection for why it is its own field and
  // why a runway end is not in it. Mutually exclusive with `selection`.
  airportSelection: AirportSelection | null;
  /** A delete of the AIRPORT that has been asked for once and not yet confirmed (forum #253c).
   *
   *  ★ ONLY THE AIRPORT GETS THIS, which is his instruction word for word: "Before deleting DATA (and
   *  only for this) a note must appear that then everything will be deleted and only with another click
   *  can it really be deleted." He grants that the cascade is correct — "without DATA the other does not
   *  exist" — and the danger is not that it is wrong, it is that it is silent: "if you have entered a lot
   *  and are not paying attention, everything is gone with one blow."
   *
   *  Ephemeral, like every other selection field: it never reaches the document, never enters undo, and
   *  is dropped by any change of selection, so an arming that the user walked away from cannot fire later
   *  on something else. */
  pendingAirportDelete: boolean;
  placing: PlacingSpec | null; // what click-to-place is armed for (xref / airport_light / light / helipad)
  filter: Filter;
  mapView: Camera; // the LIVE camera; stamped into the document only at save
  cameraEpoch: number; // bumps on document load (open/new) → MapView re-centers; pan never bumps it
  resolvedElev: Map<string, number>; // id → terrain ASL under it, for the inspector; drop on move
  pendingRecovery: Project | null; // a crash-recovery shadow found at boot, awaiting Restore/Discard

  // ── low-level (exposed for the map layer + tests) ──
  commit: (fn: (p: Project) => Project) => void;
  commitCoalesced: (key: string, fn: (p: Project) => Project) => void;
  serialize: () => Project;

  // ── lifecycle ──
  loadCatalog: (catalog: Catalog) => void;
  loadAirports: (airports: Airport[]) => void;
  setTiles: (tiles: TilesConfig) => void;
  setThumbnails: (names: string[]) => void; // v0.6 — adopt a fresh photo-name list (boot / focus / Settings)
  invalidateThumbnail: (name: string) => void; // v0.7 — a paste changed ONE object's photo; force a re-fetch
  setFootprints: (footprints: FootprintOverrides) => void; // v0.9 — adopt a saved/imported measurement set
  openProject: (path: string | null, project: Project) => void;
  newProject: (project: Project) => void;
  recoverProject: (project: Project) => void; // load a crash-recovery shadow as UNSAVED (dirty) work
  markSaved: (path: string | null) => void;

  // ── selection / placement / filter (ephemeral) ──
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  /** Select an airport part, or `null` to deselect. Clears any object selection — the Inspector shows
   *  one thing. */
  selectAirportPart: (sel: AirportSelection | null) => void;
  armPlacement: (spec: PlacingSpec | null) => void;
  setFilter: (patch: Partial<Filter>) => void;
  placeAt: (p: LonLat) => void;

  // ── document mutations (gesture-end / explicit — drag PREVIEW never hits the store) ──
  moveObject: (id: string, p: LonLat) => void;
  /** Arrow-key nudge of the WHOLE selection, as ONE undo entry per gesture (Fable I4). */
  nudgeSelection: (deltaM: number, bearingDeg: number) => void;
  rotateObject: (id: string, deg: number) => void;
  scaleObject: (id: string, f: number) => void;
  setHeight: (id: string, h: HeightSpec) => void;
  nudgeHeight: (id: string, deltaM: number) => void;
  setLabel: (id: string, label: string | undefined) => void;
  setLocked: (id: string, locked: boolean) => void;
  // v0.2 light-field mutations (kind-guarded in mutate.ts → no-op on the wrong kind)
  setAirportLightType: (id: string, typeName: string) => void;
  setConfiguration: (id: string, configuration: string) => void;
  setLightColor: (id: string, color: Vec3) => void;
  setIntensity: (id: string, intensity: number) => void;
  setFlashing: (id: string, flashing: [number, number, number, number]) => void;
  setPlantHeightRange: (id: string, heightRange: [number, number]) => void;
  setGroupIndex: (id: string, groupIndex: number) => void;
  setReference: (ref: LonLat | null) => void;
  renameProject: (name: string) => void;
  setPoiName: (poiName: string) => void;
  setShift: (shift: PoiShift) => void;
  setHeightMode: (mode: HeightMode) => void;
  // ── the airport block (v1.2, forum #170) — the heliport identity + pad, remembered on the document.
  //    `setAirport` is the dialog's writer (identity and pad together, as typed); the other two are the
  //    MAP's, because the pad is a thing you drag and turn like a footprint.
  setAirport: (airport: ProjectAirport | null) => void;
  //    v1.4 (forum #221): every one takes the pad's ID. They defaulted to the first pad while the UI knew
  //    only one — the model has carried a list since the DATA/HELICOPTER model landed — and an id-less
  //    call is now a caller that has not said which of N pads it means.
  moveAirportPad: (id: string, position: LonLat) => void;
  rotateAirportPad: (id: string, heading: number) => void;
  //    v1.3: the INSPECTOR edits the heliport now (forum #173), so the two fields the dialog used to own
  //    get their own writers rather than going through setAirport with a whole reconstructed block.
  setAirportPadRadius: (id: string, radius: number) => void;
  //    The pad's free name (#221: "the name can be freely assigned"). Empty is legal and the writers
  //    render it as FATO/TLOF, which is the literal v1.2 and v1.3 always wrote.
  setAirportPadName: (id: string, name: string) => void;
  setAirportIdentity: (patch: Partial<Pick<ProjectAirport, "icao" | "name" | "country">>) => void;
  //    v1.4 DATA (forum #217/#232, his submenu (1)). `iata` has been in the model and in BOTH writers
  //    since 7b1f38b with nothing on screen able to set it — a field the file could carry and the user
  //    could not fill. `createAirport` is the Data card's click: unlike the other five it places nothing,
  //    so it makes the block (when there is none) and selects it, which is the whole gesture.
  setAirportIata: (iata: string) => void;
  createAirport: () => void;
  //    The AIRPORT's own point (forum #255). It takes no id because there is one airport per project,
  //    and it is the only airport mutation the MAP drives as well as the Inspector.
  moveAirportPosition: (position: LonLat) => void;
  //    v1.4 parking positions (forum #232). Every one takes an id: there has never been a one-stand UI,
  //    so letting it default would only hide a caller that forgot which stand it meant (mutate.ts).
  moveAirportParking: (id: string, position: LonLat) => void;
  rotateAirportParking: (id: string, heading: number) => void;
  setAirportParkingSize: (id: string, size: number) => void;
  setAirportParkingName: (id: string, name: string) => void;
  setAirportParkingType: (id: string, type: ParkingType) => void;
  //    v1.4 runways (forum #242). An END is addressed by index, never by id — the format has no
  //    single-ended runway, so there are always exactly two and they cannot be reordered.
  moveAirportRunwayEnd: (id: string, end: 0 | 1, threshold: LonLat) => void;
  /** Drag the WHOLE strip: both thresholds, as one undo entry. */
  moveAirportRunway: (id: string, a: LonLat, b: LonLat) => void;
  updateAirportRunwayEnd: (
    id: string,
    end: 0 | 1,
    patch: Partial<Omit<AirportRunwayEnd, "threshold">>,
  ) => void;
  setAirportRunwayWidth: (id: string, width: number) => void;
  //    v1.4 glider starts (forum #237/#238), both `.wad`-only.
  moveAirportAerotow: (id: string, position: LonLat) => void;
  rotateAirportAerotow: (id: string, heading: number) => void;
  setAirportAerotowName: (id: string, name: string) => void;
  /** Drag one of the winch launch's TWO points. There is no heading to set — "the length and direction
   *  then result from the two positions". */
  moveAirportWinchPoint: (id: string, which: "glider" | "winch", position: LonLat) => void;
  /** Drag the rope: both points, as one undo entry. */
  moveAirportWinch: (id: string, glider: LonLat, winch: LonLat) => void;
  setAirportWinchName: (id: string, name: string) => void;
  setAirportWinchSpacing: (id: string, spacing: number) => void;
  duplicateSelection: (offsetM?: number) => void;
  deleteSelection: () => void;

  // ── arrange the selection (v0.9.2) — each is ONE undo entry for the whole group, and each is a true
  //    no-op (no entry at all) when nothing actually moves. A LOCKED object helps define the row but is
  //    never moved or turned, so locking the two ends is how you pin the axis by hand.
  /** Straighten: every selected object moves onto the line through the two farthest apart. */
  lineUpSelection: () => void;
  /** Equalise the gaps along that same line, keeping each object's offset across it. */
  spaceSelectionEvenly: () => void;
  /** Write one RAW rotation (`.toc` degrees) to every selected object that has one. */
  setSelectionRotation: (deg: number) => void;

  // ── camera + resolved elevation (ephemeral) ──
  setMapView: (camera: Camera) => void;
  flyTo: (p: LonLat, zoom?: number) => void;
  setResolvedElev: (id: string, terrainAsl: number) => void;
  setPendingRecovery: (project: Project | null) => void;

  // ── history ──
  undo: () => void;
  redo: () => void;
}

// The store type must carry the subscribeWithSelector augmentation, otherwise `.subscribe` collapses
// to the base single-arg overload and the map's selector subscription won't typecheck.
export type EditorStore = Mutate<StoreApi<EditorState>, [["zustand/subscribeWithSelector", never]]>;

export interface EditorDeps {
  now: () => number; // ms clock for nudge coalescing (default Date.now)
  newId: () => string; // uuid for placed/duplicated objects (default crypto.randomUUID)
  persist: (snapshot: Project) => void; // autosave sink (default no-op; editorStore.ts injects real)
  autosaveMs: number; // debounce (default 500)
  coalesceMs: number; // nudge-coalesce window (default 800)
  initialProject: Project;
}

function defaultDeps(): EditorDeps {
  return {
    now: () => Date.now(),
    newId: () => globalThis.crypto.randomUUID(),
    persist: () => {}, // the app injects a real sink (localStorage + main shadow); tests inject a spy
    autosaveMs: 500,
    coalesceMs: 800,
    initialProject: mutate.createProject({ name: "", camera: DEFAULT_CAMERA }),
  };
}

/** Build a fresh editor store. Deps are injectable so unit tests can pin the clock / id / autosave
 *  sink; the renderer singleton in editorStore.ts injects the real persist. */
export function createEditorStore(overrides: Partial<EditorDeps> = {}): EditorStore {
  const deps: EditorDeps = { ...defaultDeps(), ...overrides };

  // Non-reactive closure state: the autosave debounce timer and the current nudge-coalescing run.
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let coalesce: { key: string; at: number } | null = null;

  return createStore<EditorState>()(
    subscribeWithSelector((set, get) => {
      const scheduleAutosave = (): void => {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
          autosaveTimer = null;
          deps.persist(serializeProject(get()));
        }, deps.autosaveMs);
      };
      // Drop a pending autosave so it can't fire AFTER a save/load and resurrect a stale shadow (the
      // false-recovery bug). markSaved + load call this; the shadow's lifecycle is then owned by the
      // explicit save/new/open path (commands.ts clears it) and fresh edits re-arm autosave.
      const cancelAutosave = (): void => {
        if (autosaveTimer) {
          clearTimeout(autosaveTimer);
          autosaveTimer = null;
        }
      };

      // THE chokepoint: push prev → set next → dirty → clear redo → autosave. A no-op transform
      // (mutate.ts returns the same reference) changes nothing and never pollutes the undo stack.
      const commit = (fn: (p: Project) => Project): void => {
        const prev = get().project;
        const next = fn(prev);
        if (next === prev) return;
        coalesce = null; // a real edit ends any nudge-coalescing run
        set((s) => ({
          project: next,
          dirty: true,
          undoStack: capUndo([...s.undoStack, prev]),
          redoStack: [],
        }));
        scheduleAutosave();
      };

      // Like commit, but consecutive calls with the same `key` inside coalesceMs SHARE one undo
      // entry — holding ↑ is one undo step, not dozens (P1-4).
      const commitCoalesced = (key: string, fn: (p: Project) => Project): void => {
        const prev = get().project;
        const next = fn(prev);
        if (next === prev) return;
        const t = deps.now();
        const cont = coalesce !== null && coalesce.key === key && t - coalesce.at <= deps.coalesceMs;
        set((s) => ({
          project: next,
          dirty: true,
          undoStack: cont ? s.undoStack : capUndo([...s.undoStack, prev]),
          redoStack: cont ? s.redoStack : [],
        }));
        coalesce = { key, at: t };
        scheduleAutosave();
      };

      // Shared body of the two arrange actions: hand the selection's positions to a pure transform
      // (core/geo/arrange.ts) and write back only what genuinely moved. `transform` returns the SAME
      // reference for an untouched point, which is what makes "line up an already-straight row" cost
      // nothing — no writes, so `commit` sees an unchanged project and adds no undo entry.
      const arrangeSelection = (transform: (points: LonLat[]) => LonLat[]): void => {
        const ids = get().selection;
        if (ids.length < 3) return; // two objects are a line, and are evenly spaced by definition
        const objects = get().project.objects;
        const picked = ids.flatMap((id) => objects.find((o) => o.id === id) ?? []);
        if (picked.length < 3) return;
        const before = picked.map((o) => o.position);
        const after = transform(before);
        const moved: string[] = [];
        commit((proj) => {
          let next = proj;
          picked.forEach((o, i) => {
            if (o.locked || after[i] === before[i]) return;
            next = mutate.moveObject(next, o.id, after[i]);
            moved.push(o.id);
          });
          return next;
        });
        // they moved → the terrain under them changed → drop their cached elevations (P2-8)
        if (moved.length > 0) {
          set((s) => {
            if (!moved.some((id) => s.resolvedElev.has(id))) return s;
            const resolvedElev = new Map(s.resolvedElev);
            for (const id of moved) resolvedElev.delete(id);
            return { resolvedElev };
          });
        }
      };

      const prune = (project: Project, selection: string[]): string[] => {
        const ids = new Set(project.objects.map((o) => o.id));
        return selection.filter((id) => ids.has(id));
      };

      // The fresh-document reset shared by open/new/recover. `dirty` is false for open/new (the doc
      // matches a saved file or is blank) and true for recover (unsaved work restored from a shadow).
      const load = (project: Project, projectPath: string | null, dirty = false): void => {
        coalesce = null;
        cancelAutosave(); // a pending autosave belonged to the OUTGOING document — don't let it fire
        set((s) => ({
          project,
          projectPath,
          dirty,
          undoStack: [],
          redoStack: [],
          selection: [],
          airportSelection: null,
          pendingAirportDelete: false,
          placing: null,
          resolvedElev: new Map(),
          pendingRecovery: null, // a fresh document clears any recovery banner
          mapView: project.camera,
          cameraEpoch: s.cameraEpoch + 1, // re-center the map on the incoming document (P1-4 / A#4)
        }));
      };

      return {
        catalog: null,
        catalogRaw: null,
        catalogIndex: new Map(),
        airportLightIndex: new Map(),
        plantIndex: new Map(),
        footprints: EMPTY_FOOTPRINTS,
        airports: [],
        tiles: DEFAULT_TILES,
        thumbnailNames: new Set(),
        thumbnailEpoch: 0,
        project: deps.initialProject,
        projectPath: null,
        dirty: false,
        undoStack: [],
        redoStack: [],
        selection: [],
        airportSelection: null,
        pendingAirportDelete: false,
        placing: null,
        filter: { query: "", category: null },
        mapView: deps.initialProject.camera,
        cameraEpoch: 0,
        resolvedElev: new Map(),
        pendingRecovery: null,

        commit,
        commitCoalesced,
        serialize: () => serializeProject(get()),

        loadCatalog: (catalog) => set(catalogSlice(catalog, get().footprints)),
        // A measurement was saved, cleared or imported. Re-derive from the RAW scan so clearing an
        // override actually restores the scanned box (re-deriving from the overridden catalog would leave
        // the old numbers baked in), and so the fresh index Maps make the map redraw.
        setFootprints: (footprints) => {
          const raw = get().catalogRaw;
          set(raw === null ? { footprints } : { footprints, ...catalogSlice(raw, footprints) });
        },
        loadAirports: (airports) => set({ airports }),
        setTiles: (tiles) => set({ tiles }),
        setThumbnails: (names) => {
          // Skip the write when nothing changed — a plain window-focus refresh usually returns the same
          // list, and a no-op set()+epoch bump would needlessly re-fetch every visible thumbnail.
          const next = new Set(names);
          const prev = get().thumbnailNames;
          if (next.size === prev.size && [...next].every((n) => prev.has(n))) return;
          set((s) => ({ thumbnailNames: next, thumbnailEpoch: s.thumbnailEpoch + 1 }));
        },
        invalidateThumbnail: (name) => {
          // A "Paste photo" (v0.7) overwrote or added ONE object's file. A brand-new name must enter the
          // set so the card even attempts an <img>; a name already present would make setThumbnails no-op
          // (same set) and useThumbnailSrc would keep serving the CACHED old bytes. Either way bump the
          // epoch so the image cache (keyed `name#epoch`) misses and re-fetches. When the name is already
          // present we keep the SAME set reference — only the epoch changed.
          const key = name.toLowerCase();
          set((s) => ({
            thumbnailNames: s.thumbnailNames.has(key) ? s.thumbnailNames : new Set(s.thumbnailNames).add(key),
            thumbnailEpoch: s.thumbnailEpoch + 1,
          }));
        },
        openProject: (path, project) => load(project, path),
        newProject: (project) => load(project, null),
        recoverProject: (project) => load(project, null, true), // no path yet; unsaved → dirty
        markSaved: (path) => {
          cancelAutosave(); // we just saved — a pending autosave would only rewrite a now-stale shadow
          set((s) => ({ project: serializeProject(s), projectPath: path, dirty: false }));
        },

        select: (ids, additive = false) =>
          set((s) => ({
            selection: additive ? [...new Set([...s.selection, ...ids])] : [...ids],
            airportSelection: null,
            pendingAirportDelete: false,
          })),
        // Every selection write clears the pending delete: pointing at something else is the plainest
        // possible "no", and an arming that outlived its subject would fire on the next thing selected.
        clearSelection: () =>
          set({ selection: [], airportSelection: null, pendingAirportDelete: false }),
        selectAirportPart: (sel) =>
          set({ airportSelection: sel, selection: [], pendingAirportDelete: false }),
        armPlacement: (name) => set({ placing: name }),
        setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),

        placeAt: (p) => {
          const spec = get().placing;
          if (spec === null) return;
          // The pad is not an object: no catalog entry, no height, never exported into the cultivation.
          // So it takes the same gesture and a different write.
          //
          // ★ It ADDS since v1.4 (forum #221: "this element can now be used as often as desired"; his own
          // SCLC ships three). Through v1.3 this called `placeAirportPad`, which MOVED the single pad on a
          // second drop and then disarmed, because a second pad was not a thing that could exist. Now it
          // behaves like a stand: drop, select the new one, stay armed for the next.
          // The airport's own point (#255). It creates nothing: the block already exists by the time this
          // can be armed, and all the click does is put its coordinate somewhere. Disarms, because there
          // is one airport and a second click would only move what the first one placed.
          if (spec.kind === "airport") {
            commit((proj) => mutate.setAirportPosition(proj, p));
            set({ placing: null, selection: [], airportSelection: { kind: "data" } });
            return;
          }
          if (spec.kind === "helipad") {
            const padId = deps.newId();
            commit((proj) => mutate.addAirportPad(proj, p, DEFAULT_PAD_RADIUS_M, undefined, padId));
            set({ selection: [], airportSelection: { kind: "pad", id: padId } });
            return;
          }
          // A stand IS repeatable, so it behaves like an object card in every way except where it is
          // written: drop, select the new one, stay armed for the next.
          if (spec.kind === "parking") {
            const standId = deps.newId();
            commit((proj) =>
              mutate.addAirportParking(proj, p, spec.parkingType, undefined, standId),
            );
            set({ selection: [], airportSelection: { kind: "parking", id: standId } });
            return;
          }
          // A runway is TWO points, and this is the one card whose click does not put a thing under the
          // cursor so much as start one: end 1 lands on the click, end 2 a default length due NORTH
          // (#253b), and both are then draggable. Placement DISARMS — dropping runway after runway on top
          // of each other is not a gesture anyone wants, and the next thing you do is always adjust this one.
          if (spec.kind === "runway") {
            const rwyId = deps.newId();
            commit((proj) =>
              mutate.addAirportRunway(
                proj,
                p,
                destination(p, NEW_RUNWAY_LENGTH_M, NEW_ELEMENT_BEARING_DEG),
                { id: rwyId },
                undefined,
              ),
            );
            set({ placing: null, selection: [], airportSelection: { kind: "runway", id: rwyId } });
            return;
          }
          // An aerotow is a point and a heading — a stand's gesture: drop, select, stay armed.
          if (spec.kind === "aerotow") {
            const towId = deps.newId();
            commit((proj) => mutate.addAirportAerotow(proj, p, undefined, towId));
            set({ selection: [], airportSelection: { kind: "aerotow", id: towId } });
            return;
          }
          // A winch launch is a PAIR of points — a runway's gesture: the click lays the whole rope out,
          // the winch end goes a default distance due NORTH (#253b), and placement disarms so the next
          // thing you do is drag one of the two ends.
          if (spec.kind === "winch") {
            const winchId = deps.newId();
            commit((proj) =>
              mutate.addAirportWinch(
                proj,
                p,
                destination(p, NEW_WINCH_ROPE_M, NEW_ELEMENT_BEARING_DEG),
                undefined,
                winchId,
              ),
            );
            set({ placing: null, selection: [], airportSelection: { kind: "winch", id: winchId } });
            return;
          }
          const id = deps.newId();
          const obj =
            spec.kind === "xref"
              ? mutate.createXref(spec.name, p, { id })
              : spec.kind === "airport_light"
                ? mutate.createAirportLight(spec.name, p, { id })
                : spec.kind === "plant"
                  ? mutate.createPlant(spec.group, spec.species, spec.naturalHeight, p, { id })
                  : mutate.createLight(p, { id });
          commit((proj) => mutate.addObject(proj, obj));
          // Select the fresh object; placement stays armed (multi-drop). `airportSelection` has to be
          // cleared by hand here — this is the one selection write that does not go through `select()`,
          // and without it, dropping an object while the pad was selected left the Inspector showing the
          // heliport while `selection` pointed at the new object. Caught in the preview harness.
          set({ selection: [id], airportSelection: null, pendingAirportDelete: false });
        },

        moveObject: (id, p) => {
          commit((proj) => mutate.moveObject(proj, id, p));
          // the object moved → the terrain under it changed → drop its cached elevation (P2-8)
          set((s) => {
            if (!s.resolvedElev.has(id)) return s;
            const resolvedElev = new Map(s.resolvedElev);
            resolvedElev.delete(id);
            return { resolvedElev };
          });
        },
        // Relative move by metres along a compass bearing — the keyboard arrow-nudge (design §5). Moves
        // the WHOLE selection in ONE commit, and coalesces like nudgeHeight so holding an arrow is one
        // undo entry, not one per frame.
        //
        // This used to be per-object, coalescing on a `${id}:pos` key. With 2+ selected the caller looped,
        // so the key ALTERNATED between objects and the coalescing run never continued: every keypress
        // pushed N undo entries, and holding an arrow flooded the 50-entry cap in about a second — taking
        // the real history with it (Fable I4). Multi-select is reachable by shift+click on both the map
        // and the placed list, so this was a live footgun, not a theoretical one. One key for the whole
        // gesture is the fix; a single-object selection is just the N=1 case.
        nudgeSelection: (deltaM, bearingDeg) => {
          // ★ THE ARROWS REACH THE AIRPORT TOO (v1.5). Through v1.4 this walked `selection` only, and
          // selecting an airport part EMPTIES that list (selectAirportPart) — so the arrows moved objects
          // and did nothing at all to a pad, a stand, a runway or a glider start. Same blind spot the
          // DELETE key had (#253 → #258, fixed in 1.4.1); unlike Delete this never worked, so it is a gap
          // rather than a regression, and it needs a move path per kind rather than one guard.
          //
          // Each kind reuses its own move action, so a nudge coalesces with a drag of the SAME part and
          // with nothing else — nudging one stand and then another stays two undo entries.
          //
          // The two-point elements move WHOLE, both ends by the same offset, which is what dragging their
          // body already does. Nudging one end of a runway would be a different gesture with no key for
          // the other end.
          const sel = get().airportSelection;
          if (sel !== null) {
            const a = get().project.airport;
            if (a === undefined) return;
            const to = (p: LonLat): LonLat => destination(p, deltaM, bearingDeg);
            const self = get();
            if (sel.kind === "data") {
              // Only when it HAS a point. An identity-only airport has nothing to nudge, and inventing
              // one from an arrow key would be the fallback #255 removed, coming back through the door.
              if (a.position !== undefined) self.moveAirportPosition(to(a.position));
              return;
            }
            if (sel.kind === "pad") {
              const pad = a.pads.find((p) => p.id === sel.id);
              if (pad !== undefined) self.moveAirportPad(sel.id, to(pad.position));
              return;
            }
            if (sel.kind === "parking") {
              const stand = parkingsOf(a).find((p) => p.id === sel.id);
              if (stand !== undefined) self.moveAirportParking(sel.id, to(stand.position));
              return;
            }
            if (sel.kind === "runway") {
              const rwy = runwaysOf(a).find((r) => r.id === sel.id);
              if (rwy !== undefined) {
                self.moveAirportRunway(sel.id, to(rwy.ends[0].threshold), to(rwy.ends[1].threshold));
              }
              return;
            }
            if (sel.kind === "aerotow") {
              const tow = aerotowsOf(a).find((t) => t.id === sel.id);
              if (tow !== undefined) self.moveAirportAerotow(sel.id, to(tow.position));
              return;
            }
            const winch = winchesOf(a).find((w) => w.id === sel.id);
            if (winch !== undefined) self.moveAirportWinch(sel.id, to(winch.position), to(winch.winch));
            return;
          }
          const ids = get().selection;
          if (ids.length === 0) return;
          commitCoalesced("selection:pos", (proj) =>
            ids.reduce((p, id) => {
              const o = p.objects.find((x) => x.id === id);
              return o ? mutate.moveObject(p, id, destination(o.position, deltaM, bearingDeg)) : p;
            }, proj),
          );
          // they moved → the terrain under them changed → drop their cached elevations (P2-8)
          set((s) => {
            if (!ids.some((id) => s.resolvedElev.has(id))) return s;
            const resolvedElev = new Map(s.resolvedElev);
            for (const id of ids) resolvedElev.delete(id);
            return { resolvedElev };
          });
        },
        rotateObject: (id, deg) => commit((proj) => mutate.rotateObject(proj, id, deg)),
        scaleObject: (id, f) => commit((proj) => mutate.scaleObject(proj, id, f)),
        setHeight: (id, h) => commit((proj) => mutate.setHeight(proj, id, h)),
        nudgeHeight: (id, deltaM) =>
          commitCoalesced(`${id}:height`, (proj) => {
            const o = proj.objects.find((x) => x.id === id);
            return o ? mutate.setHeight(proj, id, nudgeHeightSpec(o.height, deltaM)) : proj;
          }),
        setLabel: (id, label) => commit((proj) => mutate.setLabel(proj, id, label)),
        setLocked: (id, locked) => commit((proj) => mutate.setLocked(proj, id, locked)),
        setAirportLightType: (id, typeName) =>
          commit((proj) => mutate.setAirportLightType(proj, id, typeName)),
        setConfiguration: (id, configuration) =>
          commit((proj) => mutate.setConfiguration(proj, id, configuration)),
        setLightColor: (id, color) => commit((proj) => mutate.setLightColor(proj, id, color)),
        setIntensity: (id, intensity) => commit((proj) => mutate.setIntensity(proj, id, intensity)),
        setFlashing: (id, flashing) => commit((proj) => mutate.setFlashing(proj, id, flashing)),
        setPlantHeightRange: (id, heightRange) =>
          commit((proj) => mutate.setPlantHeightRange(proj, id, heightRange)),
        setGroupIndex: (id, groupIndex) => commit((proj) => mutate.setGroupIndex(proj, id, groupIndex)),
        setReference: (ref) => commit((proj) => mutate.setReference(proj, ref)),
        renameProject: (name) => commit((proj) => mutate.renameProject(proj, name)),
        setPoiName: (poiName) => commit((proj) => mutate.setPoiName(proj, poiName)),
        setShift: (shift) => commit((proj) => mutate.setShift(proj, shift)),
        setHeightMode: (mode) => commit((proj) => mutate.setHeightMode(proj, mode)),
        // Coalesced, because the dialog writes on every KEYSTROKE of the code / name / country: that is
        // what makes the identity survive closing the dialog without installing, and typing "PCT001"
        // must not cost six undo steps.
        setAirport: (airport) =>
          commitCoalesced("airport:identity", (proj) => mutate.setAirport(proj, airport)),
        // Coalesced on one key each, like every other map gesture: a drag is dozens of commits and the
        // undo stack should hold the gesture, not each frame of it. Every key carries the PAD'S ID —
        // without it, dragging pad A and then pad B would fold into one undo entry and a single Ctrl+Z
        // would put both back. The keys could be id-less only while there was one pad to drag.
        moveAirportPad: (id, position) =>
          commitCoalesced(`airport:pad:pos:${id}`, (proj) =>
            mutate.moveAirportPad(proj, position, undefined, id),
          ),
        rotateAirportPad: (id, heading) =>
          commitCoalesced(`airport:pad:rot:${id}`, (proj) =>
            mutate.rotateAirportPad(proj, heading, undefined, id),
          ),
        setAirportPadRadius: (id, radius) =>
          commitCoalesced(`airport:pad:radius:${id}`, (proj) =>
            mutate.setAirportPadRadius(proj, radius, undefined, id),
          ),
        setAirportPadName: (id, name) =>
          commitCoalesced(`airport:pad:name:${id}`, (proj) =>
            mutate.setAirportPadName(proj, name, undefined, id),
          ),
        // Coalesced on ONE key for all three fields, like the dialog's writer was: typing a six-character
        // code must not cost six undo steps, and tabbing from the code to the name is one edit of one
        // thing. A no-op when there is no block — the identity has nowhere to live without a pad, and
        // the Inspector only shows these fields when there is one.
        setAirportIdentity: (patch) =>
          commitCoalesced("airport:identity", (proj) => {
            const a = proj.airport;
            if (a === undefined) return proj;
            return mutate.setAirport(proj, {
              ...a,
              icao: patch.icao ?? a.icao,
              name: patch.name ?? a.name,
              country: patch.country ?? a.country,
            });
          }),
        // The same coalesce key as the other three: IATA sits in the same mask (his DATA submenu is four
        // fields) and tabbing between them is one edit of one thing.
        setAirportIata: (iata) =>
          commitCoalesced("airport:identity", (proj) => mutate.setAirportIata(proj, iata)),
        // NOT coalesced and not a placement: it either makes an empty block or does nothing, and then
        // selects it either way, so clicking Data on an airport that already exists just opens its panel.
        createAirport: () => {
          if (get().project.airport === undefined) {
            commit((proj) => mutate.setAirport(proj, { icao: "", name: "", country: "", pads: [] }));
          }
          set({ selection: [], airportSelection: { kind: "data" } });
        },
        // Coalesced like every other drag, and id-less like the pad's keys used to be — for the same
        // reason they could be: there is exactly one of this thing in a project.
        moveAirportPosition: (position) =>
          commitCoalesced("airport:position", (proj) => mutate.setAirportPosition(proj, position)),

        // Every coalesce key carries the STAND'S ID. Without it, dragging stand A and then stand B would
        // fold into one undo entry and a single Ctrl+Z would put both back — the pad's keys can be
        // id-less only because there is one of it in that UI.
        moveAirportParking: (id, position) =>
          commitCoalesced(`airport:parking:pos:${id}`, (proj) =>
            mutate.moveAirportParking(proj, id, position),
          ),
        rotateAirportParking: (id, heading) =>
          commitCoalesced(`airport:parking:rot:${id}`, (proj) =>
            mutate.rotateAirportParking(proj, id, heading),
          ),
        setAirportParkingSize: (id, size) =>
          commitCoalesced(`airport:parking:size:${id}`, (proj) =>
            mutate.setAirportParkingSize(proj, id, size),
          ),
        setAirportParkingName: (id, name) =>
          commitCoalesced(`airport:parking:name:${id}`, (proj) =>
            mutate.setAirportParkingName(proj, id, name),
          ),
        // NOT coalesced: picking a type is a discrete choice, and it can silently move the SIZE with it
        // (mutate.setAirportParkingType). Folding that into a neighbouring gesture would make one Ctrl+Z
        // undo two visible changes.
        setAirportParkingType: (id, type) =>
          commit((proj) => mutate.setAirportParkingType(proj, id, type)),

        // Runways. The coalesce key carries the runway id AND the end, for the same reason the stands'
        // carry theirs: dragging threshold 1 and then threshold 2 is two gestures and should be two
        // undo entries, or a single Ctrl+Z would snap the whole strip back.
        moveAirportRunwayEnd: (id, end, threshold) =>
          commitCoalesced(`airport:runway:end:${id}:${end}`, (proj) =>
            mutate.moveAirportRunwayEnd(proj, id, end, threshold),
          ),
        // Both ends inside ONE commit callback, not two calls: the mutations are pure and compose, so
        // this needs no new mutation — and it must be one commit, or a single Ctrl+Z after moving a
        // runway would put one threshold back and leave the other where the drag left it.
        moveAirportRunway: (id, a, b) =>
          commitCoalesced(`airport:runway:move:${id}`, (proj) =>
            mutate.moveAirportRunwayEnd(mutate.moveAirportRunwayEnd(proj, id, 0, a), id, 1, b),
          ),
        // NOT coalesced: these are discrete choices from menus and checkboxes, not a dragged value.
        updateAirportRunwayEnd: (id, end, patch) =>
          commit((proj) => mutate.updateAirportRunwayEnd(proj, id, end, patch)),
        setAirportRunwayWidth: (id, width) =>
          commitCoalesced(`airport:runway:width:${id}`, (proj) =>
            mutate.setAirportRunwayWidth(proj, id, width),
          ),

        moveAirportAerotow: (id, position) =>
          commitCoalesced(`airport:aerotow:pos:${id}`, (proj) =>
            mutate.updateAirportAerotow(proj, id, { position }),
          ),
        rotateAirportAerotow: (id, heading) =>
          commitCoalesced(`airport:aerotow:rot:${id}`, (proj) =>
            mutate.updateAirportAerotow(proj, id, { heading }),
          ),
        setAirportAerotowName: (id, name) =>
          commitCoalesced(`airport:aerotow:name:${id}`, (proj) =>
            mutate.updateAirportAerotow(proj, id, { name }),
          ),
        // The two points key separately, like a runway's two thresholds: moving the glider and then the
        // winch is two gestures, and one Ctrl+Z must not undo both.
        moveAirportWinchPoint: (id, which, position) =>
          commitCoalesced(`airport:winch:${which}:${id}`, (proj) =>
            mutate.updateAirportWinch(proj, id, which === "glider" ? { position } : { winch: position }),
          ),
        // Both points in ONE patch, so a single Ctrl+Z after moving a launch cannot put the glider back
        // and leave the winch where the drag left it.
        moveAirportWinch: (id, glider, winch) =>
          commitCoalesced(`airport:winch:move:${id}`, (proj) =>
            mutate.updateAirportWinch(proj, id, { position: glider, winch }),
          ),
        setAirportWinchName: (id, name) =>
          commitCoalesced(`airport:winch:name:${id}`, (proj) =>
            mutate.updateAirportWinch(proj, id, { name }),
          ),
        setAirportWinchSpacing: (id, spacing) =>
          commitCoalesced(`airport:winch:spacing:${id}`, (proj) =>
            mutate.updateAirportWinch(proj, id, { spacing }),
          ),

        duplicateSelection: (offsetM = 5) => {
          const { selection } = get();
          if (selection.length === 0) return;
          const created: string[] = [];
          commit((proj) => {
            let next = proj;
            for (const id of selection) {
              const src = next.objects.find((o) => o.id === id);
              if (!src) continue;
              const nid = deps.newId();
              const position = destination(src.position, offsetM, 90); // default 5 m east
              next = mutate.duplicateObject(next, id, { id: nid, position });
              created.push(nid);
            }
            return next;
          });
          if (created.length > 0) set({ selection: created }); // select the copies
        },

        lineUpSelection: () => arrangeSelection(lineUp),
        spaceSelectionEvenly: () => arrangeSelection(spaceEvenly),

        setSelectionRotation: (deg) => {
          const ids = get().selection;
          if (ids.length === 0) return;
          commit((proj) =>
            ids.reduce((p, id) => {
              const o = p.objects.find((x) => x.id === id);
              // `locked` reads "ignore map drag & rotate" — a bulk turn is a rotate.
              return o && !o.locked ? mutate.rotateObject(p, id, deg) : p;
            }, proj),
          );
        },

        deleteSelection: () => {
          const { selection, airportSelection } = get();
          // Del removes the airport part that is selected — and ONLY that part. That has been true of the
          // parts since v1.4; since #278 it is true of the block too.
          //
          // ★ THE BLOCK NO LONGER GOES WITH ITS LAST PART. Through v1.5 an airport nobody had named
          // disappeared when its last piece did — v1.3's felt behaviour, from when a pad was all an
          // airport could hold. He walked into it with the two smallest airports there are, "AIRPORT DATA
          // and 1x HELIPAD" and "AIRPORT DATA and 1x RUNWAY": deleting the one element took the airport
          // with it. "But that must not be. As long as the PCT is only in the labour process, i.e. the
          // user enters or deletes elements again, only the affected elements themselves may change."
          //
          // He also said where the check belongs instead: "Only when the design process is completed by
          // the actions SAVE or INSTALL INTO AFS4, the plausibility takes place, whether an airport has
          // AIRPORT DATA and at least HELIPAD or RUNWAYS." Install asks exactly that already, and asks it
          // as AEROFLY'S floor rather than ours — "no valid runway or helipad defined", measured in the
          // gate of 2026-08-14 (HeliportDialog). Save stays silent on purpose: half-built work has to be
          // saveable, so the plausibility there would be a warning with nothing to warn about yet.
          //
          // Deleting the AIRPORT ITSELF still takes everything with it. That is what Del on the Airport
          // row means, it is the only deliberate way to do it, and it is the one that asks first.
          if (airportSelection !== null) {
            const sel = airportSelection;
            // ★ THE AIRPORT ASKS TWICE (#253c). The first Del arms; the second one, and only the second,
            // goes through. Nothing else on the map does this, and nothing else should: a stand takes one
            // click to make again, whereas the airport takes every element with it. Ctrl+Z would undo it,
            // but "undo exists" is not an answer to a deletion the user did not see coming — and he says
            // himself that not everyone knows the shortcut is there (#253c, the visible-undo half).
            if (sel.kind === "data" && !get().pendingAirportDelete) {
              set({ pendingAirportDelete: true });
              return;
            }
            commit((proj) => removeAirportPart(proj, sel));
            set({ airportSelection: null, pendingAirportDelete: false });
            return;
          }
          if (selection.length === 0) return;
          commit((proj) => {
            let next = proj;
            for (const id of selection) next = mutate.removeObject(next, id);
            return next; // one undo entry for the whole delete
          });
          set({ selection: [] });
        },

        setMapView: (camera) => set({ mapView: camera }),
        // Recenter the map on a point (placed-list double-click; airport search). Reuses the
        // cameraEpoch channel the MapView already watches — a bump means "follow mapView now"; pan/zoom
        // never bump it, so this is the one imperative recenter besides document load. Callers may pass
        // a target zoom (the airport search uses AIRPORT_ZOOM to frame the field); the default zooms in
        // a little if we're far out but never zooms back out.
        flyTo: (p, zoom) =>
          set((s) => ({
            mapView: { lon: p.lon, lat: p.lat, zoom: zoom ?? Math.max(s.mapView.zoom, 17) },
            cameraEpoch: s.cameraEpoch + 1,
          })),
        setResolvedElev: (id, terrainAsl) =>
          set((s) => {
            const resolvedElev = new Map(s.resolvedElev);
            resolvedElev.set(id, terrainAsl);
            return { resolvedElev };
          }),
        setPendingRecovery: (project) => set({ pendingRecovery: project }),

        undo: () => {
          const { undoStack } = get();
          if (undoStack.length === 0) return;
          coalesce = null;
          const prev = undoStack[undoStack.length - 1];
          set((s) => ({
            project: prev,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, s.project],
            selection: prune(prev, s.selection),
            dirty: true,
          }));
          scheduleAutosave();
        },
        redo: () => {
          const { redoStack } = get();
          if (redoStack.length === 0) return;
          coalesce = null;
          const next = redoStack[redoStack.length - 1];
          set((s) => ({
            project: next,
            redoStack: s.redoStack.slice(0, -1),
            undoStack: capUndo([...s.undoStack, s.project]),
            selection: prune(next, s.selection),
            dirty: true,
          }));
          scheduleAutosave();
        },
      };
    }),
  );
}
