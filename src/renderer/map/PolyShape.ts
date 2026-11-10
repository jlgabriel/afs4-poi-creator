// PolyShape.ts — ONE editable shape on the map made of points: a closed RING (the boundary, a tarmac) or
// an open LINE (a painted line). The layers own the list and the style; this owns the gestures.
//
// THE GESTURES (each Inspector help text that names them is a promise this class keeps):
//   • a WHITE point is a vertex: drag it to move it, right-click it to remove it (never below the shape's
//     minimum — 3 for a ring, 2 for a line).
//   • a GREY point sits halfway along each edge: drag it and it becomes a new vertex there.
//   • the body (inside a ring, along a line): drag to move the whole shape. No rotation.
//   • a shape that takes CURVES (a painted line) may have its edges bent into arcs (geo/arc.ts). In BEND
//     mode the grey points turn BLUE and bend instead: drag one sideways and its edge curves through it;
//     drag it back onto the straight edge (or right-click it) and the edge is straight again.
//
// ★★ ONLY A SELECTED SHAPE TAKES THE MOUSE FOR DRAGGING, and only while nothing is armed. Unselected, a
// click selects it — on the body when `selectByBody`, on the outline otherwise (the boundary: it covers
// the whole airport, so a body that answered clicks would swallow every click meant for what sits
// inside it). While something is ARMED nothing here takes the mouse at all: every click belongs to the
// map, which is where the armed card places or draws.
//
// Same contracts as the other layers: a layer-local preview while dragging with ONE onChange on release,
// and `mousedown` + `map.dragging.disable()` on anything grabbable — without it Leaflet's pan wins and the
// shape looks inert. Drag listeners exist only while a drag does.
import * as L from "leaflet";
import { onPick } from "./pick";
import type { LonLat } from "../../core/project/types";
import { wrapLon } from "../../core/geo/geo";
import { arcMidpoint, bendsWithout, curvedPath, halfSagitta, sagittaAt } from "../../core/geo/arc";

export interface PolyShapeCallbacks {
  /** The points after one finished gesture — one commit, so one undo entry. Never below the minimum.
   *  `bends` is the bend of every edge for a shape that takes curves, null for one that does not. */
  onChange(points: LonLat[], bends: number[] | null): void;
  /** A click on the shape. */
  onSelect(): void;
}

export interface PolyShapeOptions {
  closed: boolean;
  minPoints: number;
  /** Unselected, a click on the BODY selects (tarmac, line); false = only on the outline (boundary). */
  selectByBody: boolean;
  /** The pane the shape is drawn in, and the one its handles go in (above everything else). */
  pane: string;
  handlePane: string;
  /** The visible path's look. Called on every rebuild. */
  style(selected: boolean): L.PathOptions;
  /** Class on the visible path, for the cursor CSS. */
  className: string;
}

const VERTEX_FILL = "#ffffff";
const MID_FILL = "#94a3b8";
const BEND_FILL = "#3b82f6";
const CASING = "#0f172a";
/** The invisible stroke that makes a thin outline or line easy to hit. */
const HIT_WEIGHT = 14;
/** A bend handle dropped this close to the straight edge, in screen pixels, straightens it. */
const STRAIGHT_SNAP_PX = 6;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

/** A ring or a line: both are a Polyline underneath (L.Polygon extends it), but their GeoJSON types differ. */
type Path = L.Polygon | L.Polyline<GeoJSON.LineString | GeoJSON.MultiLineString | GeoJSON.Polygon | GeoJSON.MultiPolygon>;

type Drag =
  /** One vertex. A grey midpoint grabbed becomes a vertex at `index` (already inserted in `points`). */
  | { mode: "vertex"; index: number; points: LonLat[]; bends: number[] | null; startAt: LonLat; startMouse: L.LatLng; moved: boolean }
  /** The whole shape by one offset. */
  | { mode: "body"; start: LonLat[]; points: LonLat[]; bends: number[] | null; startMouse: L.LatLng; moved: boolean }
  /** One edge's bend (BEND mode). */
  | { mode: "bend"; edge: number; points: LonLat[]; bends: number[]; startAt: LonLat; startMouse: L.LatLng; moved: boolean };

export class PolyShape {
  private points: LonLat[] | null = null;
  /** One per edge for a shape that takes curves; null for one that does not. */
  private bends: number[] | null = null;
  private bendMode = false;
  private selected = false;
  private editable = false;
  private styleKey = "";
  private shape: Path | null = null;
  private hit: Path | null = null;
  private vertices: L.CircleMarker[] = [];
  private mids: L.CircleMarker[] = [];
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly group: L.LayerGroup,
    private readonly opts: PolyShapeOptions,
    private readonly cb: PolyShapeCallbacks,
  ) {}

  destroy(): void {
    this.endDragListeners();
    this.clear();
  }

  /** Reconcile with the document. `editable` = nothing armed. `styleKey` changes when what the style
   *  depends on (a material, a line name) changes. `bends` (a shape that takes curves) is one per edge;
   *  `bendMode` makes the mid-edge points bend instead of split. Left alone mid-drag — the shapes hold a
   *  preview the store has not been told about. */
  sync(
    points: LonLat[] | null,
    selected: boolean,
    editable: boolean,
    styleKey = "",
    bends: number[] | null = null,
    bendMode = false,
  ): void {
    if (this.drag !== null) return;
    if (
      points === this.points &&
      selected === this.selected &&
      editable === this.editable &&
      styleKey === this.styleKey &&
      sameBends(bends, this.bends) &&
      bendMode === this.bendMode
    ) {
      return;
    }
    this.points = points;
    this.bends = bends;
    this.bendMode = bends !== null && bendMode;
    this.selected = selected;
    this.editable = editable;
    this.styleKey = styleKey;
    this.rebuild();
  }

  // ── drawing ──

  private clear(): void {
    for (const l of [this.shape, this.hit, ...this.vertices, ...this.mids]) if (l) this.group.removeLayer(l);
    this.shape = null;
    this.hit = null;
    this.vertices = [];
    this.mids = [];
  }

  /** What is drawn: the points, with each bent edge expanded into its arc. */
  private pathOf(points: LonLat[], bends: number[] | null): L.LatLngExpression[] {
    return (bends === null ? points : curvedPath(points, bends, this.opts.closed)).map(toLatLng);
  }

  private makePath(latlngs: L.LatLngExpression[], options: L.PathOptions): Path {
    return this.opts.closed ? L.polygon(latlngs, options) : L.polyline(latlngs, options);
  }

  private rebuild(): void {
    this.clear();
    const points = this.points;
    if (points === null || points.length < this.opts.minPoints) return;
    const { closed, selectByBody, pane } = this.opts;
    const grab = this.selected && this.editable;
    const path = this.pathOf(points, this.bends);
    // A ring's body is its fill, so the visible polygon itself answers. A line's body is a few pixels
    // wide, so the wide invisible stroke answers for it instead.
    const bodyIsShape = closed && (grab || (selectByBody && this.editable));
    this.shape = this.makePath(path, {
      ...this.opts.style(this.selected),
      pane,
      interactive: bodyIsShape,
      className: grab ? `${this.opts.className} grab` : this.opts.className,
      bubblingMouseEvents: false,
    }).addTo(this.group);
    if (bodyIsShape) {
      onPick(this.shape, () => this.cb.onSelect());
      if (grab) this.shape.on("mousedown", this.onGrabBody);
    } else if (this.editable) {
      // The outline (a ring) or the line answers through a wide stroke nobody sees, fill off.
      this.hit = this.makePath(path, {
        pane,
        stroke: true,
        weight: HIT_WEIGHT,
        opacity: 0,
        fill: false,
        className: grab ? `${this.opts.className}-hit grab` : `${this.opts.className}-hit`,
        bubblingMouseEvents: false,
      }).addTo(this.group);
      onPick(this.hit, () => this.cb.onSelect());
      if (grab) this.hit.on("mousedown", this.onGrabBody);
    }
    if (grab) this.addHandles(points);
  }

  /** One point per edge, the closing edge included for a ring: halfway along the edge AS DRAWN (on its
   *  arc when it is bent). */
  private midpointsOf(points: LonLat[], bends: number[] | null): { at: LonLat; edge: number }[] {
    const n = points.length;
    const edges = this.opts.closed ? n : n - 1;
    const out: { at: LonLat; edge: number }[] = [];
    for (let i = 0; i < edges; i++) {
      out.push({ at: arcMidpoint(points[i]!, points[(i + 1) % n]!, bends?.[i] ?? 0), edge: i });
    }
    return out;
  }

  private handle(p: LonLat, kind: "vertex" | "mid" | "bend", interactive: boolean): L.CircleMarker {
    const vertex = kind === "vertex";
    return L.circleMarker(toLatLng(p), {
      pane: this.opts.handlePane,
      radius: vertex ? 6 : kind === "bend" ? 5 : 4,
      color: CASING,
      weight: vertex ? 2 : 1,
      fillColor: vertex ? VERTEX_FILL : kind === "bend" ? BEND_FILL : MID_FILL,
      fillOpacity: vertex ? 1 : 0.9,
      interactive,
      className: vertex ? "pct-shape-vertex" : kind === "bend" ? "pct-shape-bend" : "pct-shape-mid",
      bubblingMouseEvents: false,
    }).addTo(this.group);
  }

  private addHandles(points: LonLat[]): void {
    const bending = this.bendMode && this.bends !== null;
    // Mid-edge points first, so the white vertices sit on top where the two are close.
    this.mids = this.midpointsOf(points, this.bends).map(({ at, edge }) => {
      const h = this.handle(at, bending ? "bend" : "mid", true);
      if (bending) {
        h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabBend(ev, edge, at));
        h.on("contextmenu", (ev: L.LeafletMouseEvent) => {
          L.DomEvent.preventDefault(ev.originalEvent);
          this.straightenEdge(edge);
        });
      } else {
        h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabVertex(ev, edge + 1, true, at));
      }
      return h;
    });
    this.vertices = points.map((p, i) => {
      const h = this.handle(p, "vertex", true);
      h.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabVertex(ev, i, false, p));
      h.on("contextmenu", (ev: L.LeafletMouseEvent) => {
        L.DomEvent.preventDefault(ev.originalEvent);
        this.removeVertex(i);
      });
      return h;
    });
  }

  private removeVertex(index: number): void {
    const points = this.points;
    if (points === null || points.length <= this.opts.minPoints) return;
    this.cb.onChange(
      points.filter((_, i) => i !== index),
      this.bends === null ? null : bendsWithout(this.bends, index, points.length, this.opts.closed),
    );
  }

  private straightenEdge(edge: number): void {
    const { points, bends } = this;
    if (points === null || bends === null || (bends[edge] ?? 0) === 0) return;
    this.cb.onChange([...points], bends.map((b, i) => (i === edge ? 0 : b)));
  }

  // ── drag ──

  private beginDrag(d: Drag): void {
    this.map.dragging.disable();
    this.drag = d;
    this.map.on("mousemove", this.onMouseMove);
    // On the DOCUMENT: a release over a side panel must still end the drag.
    document.addEventListener("mouseup", this.onMouseUp);
  }

  private endDragListeners(): void {
    this.map.off("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag !== null) this.map.dragging.enable();
    this.drag = null;
  }

  private onGrabVertex(ev: L.LeafletMouseEvent, index: number, insert: boolean, at: LonLat): void {
    const points = this.points;
    if (ev.originalEvent.button !== 0 || points === null) return;
    const next = insert ? [...points.slice(0, index), at, ...points.slice(index)] : [...points];
    // A point put in the middle of a bent edge sits on its arc, and both halves keep to the same circle.
    let bends = this.bends === null ? null : [...this.bends];
    if (insert && bends !== null) {
      const e = index - 1;
      const half = halfSagitta(points[e]!, points[(e + 1) % points.length]!, bends[e] ?? 0);
      bends = [...bends.slice(0, e), half, half, ...bends.slice(e + 1)];
    }
    this.beginDrag({ mode: "vertex", index, points: next, bends, startAt: at, startMouse: ev.latlng, moved: false });
  }

  private onGrabBend(ev: L.LeafletMouseEvent, edge: number, at: LonLat): void {
    const { points, bends } = this;
    if (ev.originalEvent.button !== 0 || points === null || bends === null) return;
    this.beginDrag({ mode: "bend", edge, points, bends: [...bends], startAt: at, startMouse: ev.latlng, moved: false });
  }

  private onGrabBody = (ev: L.LeafletMouseEvent): void => {
    const points = this.points;
    if (ev.originalEvent.button !== 0 || points === null) return;
    this.beginDrag({ mode: "body", start: points, points, bends: this.bends, startMouse: ev.latlng, moved: false });
  };

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null) return;
    d.moved = true;
    const dLon = ev.latlng.lng - d.startMouse.lng;
    const dLat = ev.latlng.lat - d.startMouse.lat;
    if (d.mode === "vertex") {
      d.points = d.points.map((p, i) => (i === d.index ? { lon: d.startAt.lon + dLon, lat: d.startAt.lat + dLat } : p));
    } else if (d.mode === "body") {
      d.points = d.start.map((p) => ({ lon: p.lon + dLon, lat: p.lat + dLat }));
    } else {
      const n = d.points.length;
      const a = d.points[d.edge]!;
      const b = d.points[(d.edge + 1) % n]!;
      const target = { lon: d.startAt.lon + dLon, lat: d.startAt.lat + dLat };
      d.bends[d.edge] = this.nearChord(a, b, target) ? 0 : sagittaAt(a, b, target);
    }
    this.preview(d.points, d.bends);
  };

  /** Whether `p` lies within a few screen pixels of the straight edge a–b. */
  private nearChord(a: LonLat, b: LonLat, p: LonLat): boolean {
    const A = this.map.latLngToContainerPoint(toLatLng(a));
    const B = this.map.latLngToContainerPoint(toLatLng(b));
    const P = this.map.latLngToContainerPoint(toLatLng(p));
    const len = A.distanceTo(B);
    if (len === 0) return true;
    const cross = Math.abs((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x));
    return cross / len < STRAIGHT_SNAP_PX;
  }

  /** Mid-drag: redraw the shape and its handles from the preview. */
  private preview(points: LonLat[], bends: number[] | null): void {
    const path = this.pathOf(points, bends);
    this.shape?.setLatLngs(path);
    this.hit?.setLatLngs(path);
    // A grey point turned vertex changes the count, so the handles are rebuilt (inert) rather than moved.
    if (this.vertices.length !== points.length) {
      for (const h of [...this.vertices, ...this.mids]) this.group.removeLayer(h);
      this.vertices = points.map((p) => this.handle(p, "vertex", false));
      this.mids = [];
      return;
    }
    points.forEach((p, i) => this.vertices[i]?.setLatLng(toLatLng(p)));
    this.midpointsOf(points, bends).forEach(({ at }, i) => this.mids[i]?.setLatLng(toLatLng(at)));
  }

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.endDragListeners();
    if (!d.moved) {
      this.rebuild(); // drop any half-applied preview; selecting is the shapes' `click` handlers' job
      return;
    }
    // Wrapped only at commit, like every other layer.
    this.cb.onChange(
      d.points.map((p) => ({ lon: wrapLon(p.lon), lat: p.lat })),
      d.bends === null ? null : [...d.bends],
    );
  };
}

function sameBends(a: number[] | null, b: number[] | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}
