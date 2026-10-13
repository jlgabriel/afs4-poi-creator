// BoundaryLayer.ts — the airport's BOUNDARY on the map: the closed polygon around the whole field, the
// ring being drawn while the Boundary card is armed, and the editing handles once it is selected.
//
// THE GESTURES (the ones the Inspector's help text promises — keep the two in step):
//   • drawing: each map click adds a point (the store's placeAt), a double click puts down the last one
//     and closes the ring (finishBoundary). This layer only DRAWS the draft: the clicks belong to the map.
//   • a WHITE point is a vertex: drag it to move it, right-click it to remove it (never below three).
//   • a GREY point sits halfway along each edge: drag it and it becomes a new vertex there.
//   • inside the ring: drag to move the whole boundary. No rotation.
//
// ★★ THE FILL IS GRABBABLE ONLY WHILE THE BOUNDARY IS SELECTED, and nothing is armed. A boundary covers
// the whole airport — everything else is placed INSIDE it. A fill that always took the mouse would turn
// every pan inside the field into a boundary drag and swallow every click meant to place an object there.
// Unselected, only the OUTLINE answers (a wide invisible stroke over it), and a click on it selects.
//
// Same three contracts as the other layers: rebuild from the document on change, a layer-local preview
// while dragging with ONE commit on release, and `mousedown` + `map.dragging.disable()` on anything
// grabbable — without it Leaflet's pan wins and the shape looks inert.
//
// Colour: yellow and dashed — the one line on this map that is not a thing in the sim but the edge of the
// airport — turning amber and solid when selected, like everything else.
import * as L from "leaflet";
import type { LonLat } from "../../core/project/types";
import { wrapLon } from "../../core/geo/geo";
import { midpoint } from "../../core/geo/polygon";

export interface BoundaryCallbacks {
  /** The ring after one finished gesture (a point moved, added or removed, or the ring moved) — one
   *  commit, so one undo entry. Always at least three points. */
  onChange(points: LonLat[]): void;
  /** A click on the outline or inside the selected ring. */
  onSelect(): void;
}

const LINE = "#fde047";
const SELECTED = "#f59e0b";
const VERTEX_FILL = "#ffffff";
const MID_FILL = "#94a3b8";
const CASING = "#0f172a";
const MIN_POINTS = 3;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];
const NO_DRAFT: LonLat[] = [];

type Drag =
  /** One vertex. `insert` = it was a grey midpoint, which becomes a vertex at `index` on release. */
  | { mode: "vertex"; index: number; insert: boolean; points: LonLat[]; startAt: LonLat; startMouse: L.LatLng; moved: boolean }
  /** The whole ring by one offset. */
  | { mode: "body"; start: LonLat[]; points: LonLat[]; startMouse: L.LatLng; moved: boolean };

export class BoundaryLayer {
  private readonly group: L.LayerGroup;
  private ring: LonLat[] | null = null;
  private selected = false;
  private editable = false;
  private shape: L.Polygon | null = null;
  private hit: L.Polygon | null = null;
  private vertices: L.CircleMarker[] = [];
  private mids: L.CircleMarker[] = [];
  private drag: Drag | null = null;

  // The draft: what has been clicked so far, and the rubber band to the cursor.
  private draft: LonLat[] = NO_DRAFT;
  private draftLine: L.Polyline | null = null;
  private draftBand: L.Polyline | null = null;
  private draftDots: L.CircleMarker[] = [];
  private cursor: L.LatLng | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: BoundaryCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    this.map.on("mousemove", this.onMouseMove);
    // On the DOCUMENT: a release over a side panel must still end the drag.
    document.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.group.remove();
  }

  /** Reconcile with the document. `editable` = selected AND nothing armed: only then does the fill take
   *  the mouse. Left alone mid-drag — the shapes hold a preview the store has not been told about. */
  sync(ring: LonLat[] | null, selected: boolean, editable: boolean): void {
    if (this.drag !== null) return;
    if (ring === this.ring && selected === this.selected && editable === this.editable) return;
    this.ring = ring;
    this.selected = selected;
    this.editable = editable;
    this.rebuild();
  }

  /** The ring being drawn, or null when the card is not armed. */
  syncDraft(points: LonLat[] | null): void {
    const next = points ?? NO_DRAFT;
    if (next === this.draft) return;
    this.draft = next;
    this.drawDraft();
  }

  // ── the finished ring ──

  private clearRing(): void {
    for (const l of [this.shape, this.hit, ...this.vertices, ...this.mids]) if (l) this.group.removeLayer(l);
    this.shape = null;
    this.hit = null;
    this.vertices = [];
    this.mids = [];
  }

  private rebuild(): void {
    this.clearRing();
    const ring = this.ring;
    if (ring === null || ring.length < MIN_POINTS) return;
    const grab = this.selected && this.editable;
    this.shape = L.polygon(ring.map(toLatLng), {
      color: this.selected ? SELECTED : LINE,
      weight: this.selected ? 3 : 2,
      dashArray: this.selected ? undefined : "8 6",
      fillColor: this.selected ? SELECTED : LINE,
      fillOpacity: this.selected ? 0.08 : 0.03,
      interactive: grab,
      className: "pct-boundary",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    if (grab) {
      this.shape.on("mousedown", this.onGrabBody);
      this.shape.on("click", () => this.cb.onSelect());
    } else {
      // The outline alone answers: a wide stroke nobody sees, fill off, so the inside stays the map's.
      this.hit = L.polygon(ring.map(toLatLng), {
        stroke: true,
        weight: 12,
        opacity: 0,
        fill: false,
        className: "pct-boundary-hit",
        bubblingMouseEvents: false,
      }).addTo(this.group);
      this.hit.on("click", () => this.cb.onSelect());
    }
    if (grab) this.addHandles(ring);
  }

  private addHandles(ring: LonLat[]): void {
    const n = ring.length;
    // Grey first, so the white vertices sit on top where the two are close.
    this.mids = ring.map((p, i) => {
      const h = L.circleMarker(toLatLng(midpoint(p, ring[(i + 1) % n]!)), {
        radius: 4,
        color: CASING,
        weight: 1,
        fillColor: MID_FILL,
        fillOpacity: 0.9,
        className: "pct-boundary-mid",
        bubblingMouseEvents: false,
      }).addTo(this.group);
      h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabVertex(ev, i + 1, true, midpoint(p, ring[(i + 1) % n]!)));
      return h;
    });
    this.vertices = ring.map((p, i) => {
      const h = L.circleMarker(toLatLng(p), {
        radius: 6,
        color: CASING,
        weight: 2,
        fillColor: VERTEX_FILL,
        fillOpacity: 1,
        className: "pct-boundary-vertex",
        bubblingMouseEvents: false,
      }).addTo(this.group);
      h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabVertex(ev, i, false, p));
      h.on("contextmenu", (ev: L.LeafletMouseEvent) => {
        L.DomEvent.preventDefault(ev.originalEvent);
        this.removeVertex(i);
      });
      return h;
    });
  }

  private removeVertex(index: number): void {
    const ring = this.ring;
    if (ring === null || ring.length <= MIN_POINTS) return;
    this.cb.onChange(ring.filter((_, i) => i !== index));
  }

  // ── drag ──

  private onGrabVertex(ev: L.LeafletMouseEvent, index: number, insert: boolean, at: LonLat): void {
    const ring = this.ring;
    if (ev.originalEvent.button !== 0 || ring === null) return;
    this.map.dragging.disable();
    const points = insert ? [...ring.slice(0, index), at, ...ring.slice(index)] : [...ring];
    this.drag = { mode: "vertex", index, insert, points, startAt: at, startMouse: ev.latlng, moved: false };
  }

  private onGrabBody = (ev: L.LeafletMouseEvent): void => {
    const ring = this.ring;
    if (ev.originalEvent.button !== 0 || ring === null) return;
    this.map.dragging.disable();
    this.drag = { mode: "body", start: ring, points: ring, startMouse: ev.latlng, moved: false };
  };

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    this.cursor = ev.latlng;
    const d = this.drag;
    if (d === null) {
      if (this.draft.length > 0) this.drawBand();
      return;
    }
    d.moved = true;
    const dLon = ev.latlng.lng - d.startMouse.lng;
    const dLat = ev.latlng.lat - d.startMouse.lat;
    if (d.mode === "vertex") {
      d.points = d.points.map((p, i) =>
        i === d.index ? { lon: d.startAt.lon + dLon, lat: d.startAt.lat + dLat } : p,
      );
    } else {
      d.points = d.start.map((p) => ({ lon: p.lon + dLon, lat: p.lat + dLat }));
    }
    this.preview(d.points);
  };

  /** Mid-drag: redraw the ring and its handles from the preview points. */
  private preview(points: LonLat[]): void {
    this.shape?.setLatLngs(points.map(toLatLng));
    const n = points.length;
    // A grey point turned vertex changes the count, so the handles are rebuilt rather than moved.
    if (this.vertices.length !== n) {
      for (const h of [...this.vertices, ...this.mids]) this.group.removeLayer(h);
      this.vertices = points.map((p) =>
        L.circleMarker(toLatLng(p), {
          radius: 6,
          color: CASING,
          weight: 2,
          fillColor: VERTEX_FILL,
          fillOpacity: 1,
          interactive: false,
        }).addTo(this.group),
      );
      this.mids = [];
      return;
    }
    points.forEach((p, i) => this.vertices[i]?.setLatLng(toLatLng(p)));
    points.forEach((p, i) => this.mids[i]?.setLatLng(toLatLng(midpoint(p, points[(i + 1) % n]!))));
  }

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.drag = null;
    this.map.dragging.enable();
    if (!d.moved) {
      this.rebuild(); // drop any half-applied preview; selecting is the shapes' `click` handlers' job
      return;
    }
    // Wrapped only at commit, like every other layer.
    this.cb.onChange(d.points.map((p) => ({ lon: wrapLon(p.lon), lat: p.lat })));
  };

  // ── the draft ──

  private drawDraft(): void {
    for (const l of [this.draftLine, this.draftBand, ...this.draftDots]) if (l) this.group.removeLayer(l);
    this.draftLine = null;
    this.draftBand = null;
    this.draftDots = [];
    if (this.draft.length === 0) return;
    // Nothing of the draft takes the mouse: every click while drawing belongs to the map.
    this.draftLine = L.polyline(this.draft.map(toLatLng), {
      color: SELECTED,
      weight: 2,
      interactive: false,
    }).addTo(this.group);
    this.draftDots = this.draft.map((p) =>
      L.circleMarker(toLatLng(p), {
        radius: 4,
        color: CASING,
        weight: 1,
        fillColor: VERTEX_FILL,
        fillOpacity: 1,
        interactive: false,
      }).addTo(this.group),
    );
    this.drawBand();
  }

  /** The dashed lines from the last point to the cursor and on back to the first: the ring as it would
   *  close if the next click were the double click. */
  private drawBand(): void {
    const c = this.cursor;
    if (c === null || this.draft.length === 0) return;
    const last = this.draft[this.draft.length - 1]!;
    const first = this.draft[0]!;
    const latlngs: L.LatLngExpression[] = [toLatLng(last), c];
    if (this.draft.length >= 2) latlngs.push(toLatLng(first));
    if (this.draftBand === null) {
      this.draftBand = L.polyline(latlngs, {
        color: SELECTED,
        weight: 1.5,
        dashArray: "4 4",
        interactive: false,
      }).addTo(this.group);
    } else {
      this.draftBand.setLatLngs(latlngs);
    }
  }
}
