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
// WHAT IT DELIBERATELY DOES NOT DO: drag the whole strip. A runway is defined BY its two thresholds
// (there is no heading in the model — "the direction is whatever the two endpoints say"), so moving it
// bodily is a compound edit of both ends, and the mutation layer has no single call for it. Grabbing a
// threshold is the gesture that matches the data.
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

interface Drag {
  id: string;
  end: 0 | 1;
  startAt: LonLat;
  startMouse: L.LatLng;
  at: LonLat;
  moved: boolean;
}

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
    this.drag = { id, end, startAt: at, startMouse: e.latlng, at, moved: false };
  };

  /** Redraw the strip and the handles with ONE threshold moved — the other stays where the document has
   *  it, which is the whole point: the runway's length and direction follow the drag. */
  private preview(e: Entry, end: 0 | 1, at: LonLat): void {
    const a = end === 0 ? at : e.runway.ends[0].threshold;
    const b = end === 1 ? at : e.runway.ends[1].threshold;
    e.strip.setLatLngs(stripCorners(a, b, e.runway.width).map(toLatLng));
    e.handles[end]?.setLatLng(toLatLng(at));
  }

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null) return;
    const e = this.entries.get(d.id);
    if (e === undefined) return;
    d.moved = true;
    d.at = {
      lon: d.startAt.lon + (ev.latlng.lng - d.startMouse.lng),
      lat: d.startAt.lat + (ev.latlng.lat - d.startMouse.lat),
    };
    this.preview(e, d.end, d.at);
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
      if (e !== undefined) this.preview(e, d.end, e.runway.ends[d.end].threshold);
      return;
    }
    // Wrap only at COMMIT: a drag across the antimeridian stays visually continuous while the value
    // handed to the store is normalised into the range the loader accepts.
    this.cb.onMoveEnd(d.id, d.end, { lon: wrapLon(d.at.lon), lat: d.at.lat });
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
