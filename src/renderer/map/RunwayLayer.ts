// RunwayLayer.ts — the airport's runways on the map: the strip drawn at its real width, with a draggable
// handle on each threshold when it is selected.
//
// WHY IT IS A RECTANGLE AND NOT A LINE (forum #242). PCT lays no asphalt — ApfelFlieger is explicit that a
// PCT runway has no markings, no centre line and no surface, because all of that would need a TMB. But
// `width` is not decoration: it is the number the simulator lands an aircraft with. Drawn as a line, the
// only feedback that 40 is not 400 would be the digits in a text field. Drawn to scale, it is obvious.
// The map is PCT's, not the sim's ground — showing the width contradicts nothing.
//
// WHY THE HANDLES ONLY APPEAR ON THE SELECTED RUNWAY. Same call FootprintLayer and ParkingLayer make for
// their rotate grips: a field with six runways would otherwise carry twelve grabbable dots, most of them
// belonging to something the user is not editing.
//
// ★★ DRAGGING THE STRIP MOVES THE WHOLE RUNWAY, and the first cut of this file got that wrong. The
// argument was that a runway is defined BY its two thresholds, so the gesture that matches the data is
// grabbing one of them — true about the model, and irrelevant to the person looking at a runway in the
// wrong field. Juan tried to move it within a minute of opening the app.
//
// The failure was not just a missing feature, it was a missing MOUSEDOWN. Leaflet's map drag lives on the
// container, and a path does not stop it: every layer here calls `map.dragging.disable()` from its own
// mousedown, which is what makes a shape grabbable at all. With no handler on the strip, pressing it and
// pulling panned the map — the runway did not merely refuse to move, it looked inert while the world slid
// under it. A shape that is not draggable has to be a shape that does not look draggable, and this one
// does. Both ends move together in ONE commit, so it is one undo entry.
//
// Colour: the palette had no saturated colour left that is not already spoken for — blue footprints,
// white pad, green plants, amber selection, red missing, cyan grips, violet stands. So the strip is
// asphalt: a dark fill under a pale stroke. It does not need a colour to be recognisable; nothing else on
// this map is a kilometre-long rectangle.
import * as L from "leaflet";
import type { AirportRunway, LonLat } from "../../core/project/types";
import { wrapLon } from "../../core/geo/geo";
import { stripCorners } from "./runwayStrip";

export interface RunwayCallbacks {
  /** Fired once on drag END, with which end moved (0 or 1) — the shape mutate.moveAirportRunwayEnd takes. */
  onMoveEnd(id: string, end: 0 | 1, p: LonLat): void;
  /** The whole strip was dragged: BOTH thresholds, so the store can commit them as one undo entry. */
  onMove(id: string, a: LonLat, b: LonLat): void;
  /** A click that was not a drag — the runway becomes the Inspector's subject. */
  onSelect(id: string): void;
}

const STRIP_STROKE = "#e2e8f0"; // pale, so it reads on both dark asphalt and grass
const STRIP_FILL = "#0f172a";
const STRIP_SELECTED = "#f59e0b"; // the same amber every other selected thing wears
const HANDLE_COLOR = "#ffffff";
const HANDLE_CASING = "#0f172a";

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface Entry {
  runway: AirportRunway;
  selected: boolean;
  strip: L.Polygon;
  /** One per threshold, index-aligned with `runway.ends`. Present only while selected. */
  handles: L.CircleMarker[];
}

type Drag =
  /** One threshold: the other stays put, so length and direction follow the cursor. */
  | { id: string; mode: "end"; end: 0 | 1; startAt: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  /** The whole strip: both thresholds by the same offset, so length and direction are preserved. */
  | {
      id: string;
      mode: "body";
      startA: LonLat;
      startB: LonLat;
      startMouse: L.LatLng;
      a: LonLat;
      b: LonLat;
      moved: boolean;
    };

export class RunwayLayer {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry>();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: RunwayCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    this.map.on("mousemove", this.onMouseMove);
    // mouseup on the DOCUMENT, not the map: the Inspector and catalog flank the map, so a release over
    // them would otherwise leave the threshold glued to the cursor (the lesson FootprintLayer records).
    document.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.entries.clear();
    this.group.remove();
  }

  /** Reconcile with the document. The runway being dragged is left alone: its shapes hold a preview the
   *  store has not been told about yet. */
  sync(runways: readonly AirportRunway[], selectedId: string | null = null): void {
    const live = new Set<string>();
    for (const r of runways) {
      live.add(r.id);
      const selected = r.id === selectedId;
      const cur = this.entries.get(r.id);
      if (cur !== undefined && this.drag?.id === r.id) {
        cur.runway = r;
        continue;
      }
      if (cur === undefined) {
        this.entries.set(r.id, this.build(r, selected));
        continue;
      }
      if (cur.runway === r && cur.selected === selected) continue; // untouched → skip
      if (cur.runway === r) {
        cur.selected = selected;
        this.restyle(cur);
        continue;
      }
      this.remove(r.id);
      this.entries.set(r.id, this.build(r, selected));
    }
    for (const id of [...this.entries.keys()]) if (!live.has(id)) this.remove(id);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (e === undefined) return;
    this.group.removeLayer(e.strip);
    for (const h of e.handles) this.group.removeLayer(h);
    this.entries.delete(id);
  }

  private build(r: AirportRunway, selected: boolean): Entry {
    const strip = L.polygon(
      stripCorners(r.ends[0].threshold, r.ends[1].threshold, r.width).map(toLatLng),
      { ...stripStyle(selected), className: "pct-runway", bubblingMouseEvents: false },
    ).addTo(this.group);
    // Select on CLICK, drag on MOUSEDOWN — the split FootprintLayer uses. Firing onSelect from the
    // document mouseup when the drag never `moved` loses the click to any stray mousemove, because
    // `moved` is set unconditionally on the first one. Leaflet already decides what a click is.
    strip.on("click", () => this.cb.onSelect(r.id));
    strip.on("mousedown", (e: L.LeafletMouseEvent) => this.onGrabBody(r.id, e));

    const entry: Entry = { runway: r, selected, strip, handles: [] };
    if (selected) this.addHandles(entry);
    return entry;
  }

  private addHandles(e: Entry): void {
    const r = e.runway;
    e.handles = ([0, 1] as const).map((end) => {
      const h = L.circleMarker(toLatLng(r.ends[end].threshold), {
        radius: 6,
        color: HANDLE_CASING,
        weight: 2,
        fillColor: HANDLE_COLOR,
        fillOpacity: 1,
        className: "pct-runway-threshold",
        bubblingMouseEvents: false,
      }).addTo(this.group);
      h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrab(r.id, end, ev));
      // Clicking a threshold selects its runway too, so a handle never swallows a select.
      h.on("click", () => this.cb.onSelect(r.id));
      return h;
    });
  }

  private restyle(e: Entry): void {
    e.strip.setStyle(stripStyle(e.selected));
    if (e.selected && e.handles.length === 0) {
      this.addHandles(e);
      return;
    }
    if (!e.selected && e.handles.length > 0) {
      for (const h of e.handles) this.group.removeLayer(h);
      e.handles = [];
    }
  }

  // ── drag: layer-local preview, one commit on release ──

  private onGrab = (id: string, end: 0 | 1, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const at = entry.runway.ends[end].threshold;
    this.drag = { id, mode: "end", end, startAt: at, startMouse: e.latlng, at, moved: false };
  };

  /** Grab the strip itself. `map.dragging.disable()` is the load-bearing line: without it Leaflet's own
   *  container drag wins and pressing the runway pans the map instead of moving anything. */
  private onGrabBody = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const [a, b] = entry.runway.ends;
    this.drag = {
      id,
      mode: "body",
      startA: a.threshold,
      startB: b.threshold,
      startMouse: e.latlng,
      a: a.threshold,
      b: b.threshold,
      moved: false,
    };
  };

  /** Redraw the strip and its handles from two thresholds — whichever of them the drag is changing. */
  private preview(e: Entry, a: LonLat, b: LonLat): void {
    e.strip.setLatLngs(stripCorners(a, b, e.runway.width).map(toLatLng));
    e.handles[0]?.setLatLng(toLatLng(a));
    e.handles[1]?.setLatLng(toLatLng(b));
  }

  /** Where the two thresholds are RIGHT NOW: mid-drag that is the preview, otherwise the document. */
  private static thresholds(d: Drag, e: Entry): [LonLat, LonLat] {
    if (d.mode === "body") return [d.a, d.b];
    return d.end === 0 ? [d.at, e.runway.ends[1].threshold] : [e.runway.ends[0].threshold, d.at];
  }

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null) return;
    const e = this.entries.get(d.id);
    if (e === undefined) return;
    d.moved = true;
    const dLon = ev.latlng.lng - d.startMouse.lng;
    const dLat = ev.latlng.lat - d.startMouse.lat;
    if (d.mode === "end") {
      d.at = { lon: d.startAt.lon + dLon, lat: d.startAt.lat + dLat };
    } else {
      // The SAME offset on both, so the runway keeps its length and its direction — the two numbers the
      // panel shows and the two a user is least likely to want changed by a reposition.
      d.a = { lon: d.startA.lon + dLon, lat: d.startA.lat + dLat };
      d.b = { lon: d.startB.lon + dLon, lat: d.startB.lat + dLat };
    }
    const [a, b] = RunwayLayer.thresholds(d, e);
    this.preview(e, a, b);
  };

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.drag = null;
    this.map.dragging.enable();
    const e = this.entries.get(d.id);
    if (!d.moved) {
      // A press with no movement: drop any half-applied preview. Selecting is the shapes' own `click`
      // handlers' job.
      if (e !== undefined) this.preview(e, e.runway.ends[0].threshold, e.runway.ends[1].threshold);
      return;
    }
    // Wrap only at COMMIT: a drag across the antimeridian stays visually continuous while the value
    // handed to the store is normalised into the range the loader accepts.
    if (d.mode === "end") {
      this.cb.onMoveEnd(d.id, d.end, { lon: wrapLon(d.at.lon), lat: d.at.lat });
      return;
    }
    this.cb.onMove(
      d.id,
      { lon: wrapLon(d.a.lon), lat: d.a.lat },
      { lon: wrapLon(d.b.lon), lat: d.b.lat },
    );
  };
}

/** The strip's paint, which is what selection changes. One place, so build and restyle cannot drift. */
function stripStyle(selected: boolean): L.PathOptions {
  return {
    color: selected ? STRIP_SELECTED : STRIP_STROKE,
    weight: selected ? 3 : 2,
    fillColor: selected ? STRIP_SELECTED : STRIP_FILL,
    fillOpacity: selected ? 0.2 : 0.35,
  };
}
