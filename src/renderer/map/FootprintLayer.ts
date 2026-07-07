// FootprintLayer.ts — the imperative Leaflet layer that draws placed objects and owns their direct
// manipulation (design §3.7, Fable review P1-5). Deliberately NOT react-leaflet: the map is driven
// from OUTSIDE React by a store subscription, and per-mousemove drag updates must never round-trip
// through React state.
//
// P1-5 contract honoured here:
//   • Reference-diff sync — mutate.ts guarantees structural sharing, so an object whose reference AND
//     selected flag are unchanged is SKIPPED; a selection-only change RESTYLES in place; a geometry
//     change REBUILDS. That keeps sync O(changed), which is what holds drag/undo at 60 fps.
//   • Drag is layer-local: on polygon mousedown we disable map dragging and, on each map mousemove,
//     edit the polygon/anchor/heading lat-lngs DIRECTLY — the store is untouched until mouseup fires
//     exactly ONE onMove (one undo entry). The inspector's numbers may lag the drag; that's fine.
//   • No L.Icon.Default (the Leaflet-under-Vite broken-marker-PNG trap): anchor = circleMarker,
//     heading tick = polyline, footprint = polygon. Zero image assets.
//   • bubblingMouseEvents:false on the polygon so a select-click never also fires the map's
//     click-to-place, and grabbing a footprint never starts a map pan.

import * as L from "leaflet";
import type { CatalogObject, LonLat, PlacedXref, Vec3 } from "../../core/project/types";
import { footprintCorners, headingMarker } from "../../core/geo/footprint";
import { diffEntry } from "./syncDiff";

export interface FootprintCallbacks {
  onSelect(id: string, additive: boolean): void;
  onMove(id: string, p: LonLat): void; // fired once on drag END (undo-friendly)
}

const COLOR = "#3b82f6"; // normal footprint (blue, the ACT idiom)
const COLOR_SELECTED = "#f59e0b"; // amber highlight
const COLOR_MISSING = "#ef4444"; // object not in the catalog → red dashed placeholder
const PLACEHOLDER_M = 5; // half-extent of the 10×10 m square drawn for catalog-missing objects
const PH_MIN: Vec3 = [-PLACEHOLDER_M, -PLACEHOLDER_M, 0];
const PH_MAX: Vec3 = [PLACEHOLDER_M, PLACEHOLDER_M, 0];

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface Entry {
  obj: PlacedXref;
  selected: boolean;
  missing: boolean;
  poly: L.Polygon;
  anchor: L.CircleMarker;
  heading: L.Polyline;
}

export class FootprintLayer {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry>();
  private index: Map<string, CatalogObject> = new Map();
  private drag: { id: string; startAnchor: LonLat; startMouse: L.LatLng; moved: boolean } | null =
    null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: FootprintCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    map.on("mousemove", this.onMouseMove);
    map.on("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    this.map.off("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.group.remove();
    this.entries.clear();
  }

  /** Reconcile the drawn layers with the current objects + selection. O(changed). */
  sync(objects: PlacedXref[], index: Map<string, CatalogObject>, selection: Set<string>): void {
    this.index = index;
    const seen = new Set<string>();
    for (const obj of objects) {
      seen.add(obj.id);
      const selected = selection.has(obj.id);
      const prev = this.entries.get(obj.id);
      switch (diffEntry(prev, obj, selected)) {
        case "skip":
          break;
        case "restyle":
          this.restyle(prev as Entry, selected);
          break;
        case "rebuild":
          if (prev) this.remove(obj.id);
          this.add(obj, selected);
          break;
      }
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private cornersAt(anchor: LonLat, obj: PlacedXref, cat: CatalogObject | undefined): LonLat[] {
    const [min, max] = cat ? [cat.bbMin, cat.bbMax] : [PH_MIN, PH_MAX];
    return footprintCorners(anchor, min, max, obj.direction, obj.scale);
  }

  private headingAt(anchor: LonLat, obj: PlacedXref, cat: CatalogObject | undefined): LonLat {
    return headingMarker(anchor, cat ? cat.bbMax : PH_MAX, obj.direction, obj.scale);
  }

  private add(obj: PlacedXref, selected: boolean): void {
    const cat = this.index.get(obj.name);
    const missing = cat === undefined;
    const color = selected ? COLOR_SELECTED : missing ? COLOR_MISSING : COLOR;

    const poly = L.polygon(this.cornersAt(obj.position, obj, cat).map(toLatLng), {
      color,
      weight: selected ? 3 : 2,
      fillOpacity: 0.2,
      dashArray: missing ? "5,5" : undefined,
      bubblingMouseEvents: false, // a footprint click never leaks to the map (select ≠ place)
    });
    const heading = L.polyline(
      [toLatLng(obj.position), toLatLng(this.headingAt(obj.position, obj, cat))],
      { color, weight: 2, interactive: false },
    );
    const anchor = L.circleMarker(toLatLng(obj.position), {
      radius: 4,
      color,
      weight: 2,
      fillColor: "#ffffff",
      fillOpacity: 1,
      interactive: false,
    });

    poly.on("click", (e) => this.cb.onSelect(obj.id, e.originalEvent.shiftKey));
    poly.on("mousedown", (e) => this.onGrab(obj.id, e));

    this.group.addLayer(poly);
    this.group.addLayer(heading);
    this.group.addLayer(anchor);
    this.entries.set(obj.id, { obj, selected, missing, poly, anchor, heading });
  }

  private restyle(entry: Entry, selected: boolean): void {
    const color = selected ? COLOR_SELECTED : entry.missing ? COLOR_MISSING : COLOR;
    entry.poly.setStyle({ color, weight: selected ? 3 : 2 });
    entry.heading.setStyle({ color });
    entry.anchor.setStyle({ color });
    entry.selected = selected;
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.group.removeLayer(e.poly);
    this.group.removeLayer(e.heading);
    this.group.removeLayer(e.anchor);
    this.entries.delete(id);
  }

  // ── drag (layer-local preview → one commit on release) ──
  private onGrab = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!entry || entry.obj.locked) return;
    this.map.dragging.disable();
    this.drag = { id, startAnchor: entry.obj.position, startMouse: e.latlng, moved: false };
  };

  private onMouseMove = (e: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (!d) return;
    const entry = this.entries.get(d.id);
    if (!entry) return;
    d.moved = true;
    const anchor: LonLat = {
      lon: d.startAnchor.lon + (e.latlng.lng - d.startMouse.lng),
      lat: d.startAnchor.lat + (e.latlng.lat - d.startMouse.lat),
    };
    const cat = this.index.get(entry.obj.name);
    entry.poly.setLatLngs(this.cornersAt(anchor, entry.obj, cat).map(toLatLng));
    entry.anchor.setLatLng(toLatLng(anchor));
    entry.heading.setLatLngs([toLatLng(anchor), toLatLng(this.headingAt(anchor, entry.obj, cat))]);
  };

  private onMouseUp = (e: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.map.dragging.enable();
    if (!d.moved) return; // a click, not a drag — selection is handled by the polygon click
    this.cb.onMove(d.id, {
      lon: d.startAnchor.lon + (e.latlng.lng - d.startMouse.lng),
      lat: d.startAnchor.lat + (e.latlng.lat - d.startMouse.lat),
    });
  };
}
