// MarkLayer.ts — the airport's one-point TAP elements on the map: GROUND TEXT, JETWAY and CAR LOT. One
// instance per kind, each with its own look (a MarkLook); the behaviour is the stand's (ParkingLayer):
//   • the outline is grabbed by its BODY on mousedown (map dragging off), so a drag never pans the map;
//   • select on CLICK, drag on MOUSEDOWN — Leaflet decides what a click is;
//   • the store is untouched until mouseup fires exactly ONE callback;
//   • the cyan rotate grip exists only on the SELECTED element;
//   • reference-diff sync: an untouched element is skipped, a selection-only change restyles.
import * as L from "leaflet";
import { onPick } from "./pick";
import type { LonLat } from "../../core/project/types";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { snapAngle } from "./rotate";

/** What every element this layer draws has. */
export interface Mark {
  id: string;
  position: LonLat;
  heading: number; // TRUE compass degrees
}

/** How one kind looks. Every geometry is in metres around the element's point. */
export interface MarkLook<T extends Mark> {
  /** Stroke and fill colour while not selected. */
  color: string;
  /** The outline, around `at`, turned to `heading`: one ring, or several separate ones drawn as one shape. */
  outline(item: T, at: LonLat, heading: number): LonLat[] | LonLat[][];
  /** How far from the centre the heading tick ends; the rotate grip sits a little past it. */
  reach(item: T): number;
  /** The marking painted inside, as the HTML of a divIcon centred on the point, or null to paint none.
   *  `pxPerM` is the current scale, so a marking can be drawn at its real size. */
  glyph(item: T, pxPerM: number, heading: number): string | null;
}

export interface MarkCallbacks {
  onMove(id: string, p: LonLat): void;
  onRotate(id: string, headingDeg: number): void;
  onSelect(id: string): void;
}

const CASING = "#0f172a";
const SELECTED = "#f59e0b"; // the amber every selected thing on this map wears
const COLOR_HANDLE = "#06b6d4"; // the cyan rotate grip
const SNAP_DEG = 5;
const HANDLE_MARGIN_M = 6;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

/** An outline as Leaflet takes it: one ring, or several as a multi-polygon (one ring each, no holes). */
function outlineLatLngs(o: LonLat[] | LonLat[][]): L.LatLngExpression[] | L.LatLngExpression[][][] {
  const first = o[0];
  if (first === undefined || !Array.isArray(first)) return (o as LonLat[]).map(toLatLng);
  return (o as LonLat[][]).map((ring) => [ring.map(toLatLng)]);
}

interface Entry<T extends Mark> {
  item: T;
  selected: boolean;
  casing: L.Polygon;
  shape: L.Polygon;
  tick: L.Polyline;
  glyph?: L.Marker;
  handle?: L.CircleMarker;
}

type Drag =
  | { id: string; mode: "move"; startAt: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  | { id: string; mode: "rotate"; at: LonLat; startHeading: number; heading: number; moved: boolean };

export class MarkLayer<T extends Mark> {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry<T>>();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly look: MarkLook<T>,
    private readonly cb: MarkCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    this.map.on("mousemove", this.onMouseMove);
    this.map.on("zoomend", this.onZoomEnd);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    this.map.off("zoomend", this.onZoomEnd);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.entries.clear();
    this.group.remove();
  }

  /** Reconcile with the document. Mid-drag the dragged element keeps its preview. */
  sync(items: readonly T[], selectedId: string | null = null): void {
    const live = new Set<string>();
    for (const item of items) {
      live.add(item.id);
      const selected = item.id === selectedId;
      const cur = this.entries.get(item.id);
      if (cur !== undefined && this.drag?.id === item.id) {
        cur.item = item;
        continue;
      }
      if (cur === undefined) {
        this.entries.set(item.id, this.build(item, selected));
        continue;
      }
      if (cur.item === item && cur.selected === selected) continue;
      if (cur.item === item) {
        cur.selected = selected;
        this.restyle(cur);
        continue;
      }
      this.remove(item.id);
      this.entries.set(item.id, this.build(item, selected));
    }
    for (const id of [...this.entries.keys()]) if (!live.has(id)) this.remove(id);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (e === undefined) return;
    for (const l of [e.casing, e.shape, e.tick, e.glyph, e.handle]) if (l) this.group.removeLayer(l);
    this.entries.delete(id);
  }

  private shapeStyle(selected: boolean): L.PathOptions {
    const color = selected ? SELECTED : this.look.color;
    return { color, weight: selected ? 3 : 2, fillColor: color, fillOpacity: 0.12 };
  }

  private build(item: T, selected: boolean): Entry<T> {
    const ring = outlineLatLngs(this.look.outline(item, item.position, item.heading));
    const casing = L.polygon(ring, {
      color: CASING,
      weight: 5,
      opacity: 0.55,
      fill: false,
      interactive: false,
    }).addTo(this.group);
    const shape = L.polygon(ring, {
      ...this.shapeStyle(selected),
      className: "pct-mark",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    onPick(shape, () => this.cb.onSelect(item.id));
    shape.on("mousedown", (e: L.LeafletMouseEvent) => this.onGrab(item.id, e));
    const tick = L.polyline([toLatLng(item.position), toLatLng(this.tipAt(item, item.position, item.heading))], {
      color: selected ? SELECTED : this.look.color,
      weight: 2,
      opacity: 0.9,
      interactive: false,
    }).addTo(this.group);
    const entry: Entry<T> = { item, selected, casing, shape, tick };
    this.layoutGlyph(entry);
    if (selected) this.addHandle(entry);
    return entry;
  }

  private tipAt(item: T, at: LonLat, heading: number): LonLat {
    return destination(at, this.look.reach(item), heading);
  }

  private gripAt(item: T, at: LonLat, heading: number): LonLat {
    return destination(at, this.look.reach(item) + HANDLE_MARGIN_M, heading);
  }

  /** Screen pixels per metre at the element's latitude and the current zoom. */
  private pxPerM(at: LonLat): number {
    const c = this.map.latLngToLayerPoint(toLatLng(at));
    const e = this.map.latLngToLayerPoint(toLatLng(destination(at, 100, 90)));
    return Math.abs(e.x - c.x) / 100;
  }

  private layoutGlyph(e: Entry<T>, at?: LonLat, heading?: number): void {
    const where = at ?? e.item.position;
    const html = this.look.glyph(e.item, this.pxPerM(where), heading ?? e.item.heading);
    if (html === null) {
      if (e.glyph !== undefined) {
        this.group.removeLayer(e.glyph);
        e.glyph = undefined;
      }
      return;
    }
    if (e.glyph === undefined) {
      e.glyph = L.marker(toLatLng(where), {
        icon: L.divIcon({ html, className: "pct-mark-glyph", iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(this.group);
      return;
    }
    e.glyph.setLatLng(toLatLng(where));
    const el = e.glyph.getElement();
    if (el) el.innerHTML = html;
  }

  private onZoomEnd = (): void => {
    for (const e of this.entries.values()) this.layoutGlyph(e);
  };

  private addHandle(e: Entry<T>): void {
    const { item } = e;
    const handle = L.circleMarker(toLatLng(this.gripAt(item, item.position, item.heading)), {
      radius: 6,
      color: COLOR_HANDLE,
      weight: 2,
      fillColor: COLOR_HANDLE,
      fillOpacity: 1,
      className: "pct-rotate-handle",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    handle.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabHandle(item.id, ev));
    e.handle = handle;
  }

  private restyle(e: Entry<T>): void {
    e.shape.setStyle(this.shapeStyle(e.selected));
    e.tick.setStyle({ color: e.selected ? SELECTED : this.look.color });
    if (e.selected && e.handle === undefined) {
      this.addHandle(e);
      return;
    }
    if (!e.selected && e.handle !== undefined) {
      this.group.removeLayer(e.handle);
      e.handle = undefined;
    }
  }

  private onGrab = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const at = entry.item.position;
    this.drag = { id, mode: "move", startAt: at, startMouse: e.latlng, at, moved: false };
  };

  private onGrabHandle = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const { position, heading } = entry.item;
    this.drag = { id, mode: "rotate", at: position, startHeading: heading, heading, moved: false };
    entry.handle
      ?.bindTooltip(`${Math.round(heading)}°`, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "pct-rotate-tip",
      })
      .openTooltip();
  };

  private preview(e: Entry<T>, at: LonLat, heading: number): void {
    const ring = outlineLatLngs(this.look.outline(e.item, at, heading));
    e.casing.setLatLngs(ring);
    e.shape.setLatLngs(ring);
    e.tick.setLatLngs([toLatLng(at), toLatLng(this.tipAt(e.item, at, heading))]);
    this.layoutGlyph(e, at, heading);
    e.handle?.setLatLng(toLatLng(this.gripAt(e.item, at, heading)));
  }

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null) return;
    const e = this.entries.get(d.id);
    if (e === undefined) return;
    d.moved = true;
    if (d.mode === "move") {
      d.at = {
        lon: d.startAt.lon + (ev.latlng.lng - d.startMouse.lng),
        lat: d.startAt.lat + (ev.latlng.lat - d.startMouse.lat),
      };
      this.preview(e, d.at, e.item.heading);
    } else {
      let heading = initialBearing(d.at, { lon: ev.latlng.lng, lat: ev.latlng.lat });
      if (ev.originalEvent.shiftKey) heading = snapAngle(heading, SNAP_DEG);
      d.heading = heading;
      this.preview(e, d.at, heading);
      e.handle?.setTooltipContent(`${Math.round(heading)}°`);
    }
  };

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.drag = null;
    this.map.dragging.enable();
    const e = this.entries.get(d.id);
    if (d.mode === "rotate") e?.handle?.unbindTooltip();
    if (!d.moved) {
      if (e !== undefined) this.preview(e, e.item.position, e.item.heading);
      return;
    }
    if (d.mode === "move") this.cb.onMove(d.id, { lon: wrapLon(d.at.lon), lat: d.at.lat });
    else if (d.heading !== d.startHeading) this.cb.onRotate(d.id, d.heading);
  };
}
