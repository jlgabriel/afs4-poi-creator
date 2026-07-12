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
//   • Rotate mirrors move: a handle drawn past the footprint's nose is grabbed the same way; each
//     mousemove re-lays the polygon/heading/handle at the new bearing (Shift snaps to 5°, design §5),
//     and the store is untouched until mouseup fires exactly ONE onRotate (one undo entry).
//   • No L.Icon.Default (the Leaflet-under-Vite broken-marker-PNG trap): anchor = circleMarker,
//     heading tick = polyline, footprint = polygon, rotate handle = circleMarker. Zero image assets.
//   • bubblingMouseEvents:false on the polygon AND the handle so a select-click never also fires the
//     map's click-to-place, and grabbing a footprint or handle never starts a map pan.

import * as L from "leaflet";
import type { CatalogObject, LonLat, PlacedXref, Vec3 } from "../../core/project/types";
import { footprintCorners, headingMarker } from "../../core/geo/footprint";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { diffEntry } from "./syncDiff";
import { snapAngle } from "./rotate";

export interface FootprintCallbacks {
  onSelect(id: string, additive: boolean): void;
  onMove(id: string, p: LonLat): void; // fired once on drag END (undo-friendly)
  onRotate(id: string, deg: number): void; // fired once on handle-drag END (undo-friendly)
}

const COLOR = "#3b82f6"; // normal footprint (blue, the ACT idiom)
const COLOR_SELECTED = "#f59e0b"; // amber highlight
const COLOR_MISSING = "#ef4444"; // object not in the catalog → red dashed placeholder
const COLOR_HANDLE = "#06b6d4"; // rotate grip — cyan (complementary to the amber selection) so the drag control never reads as the object itself
const PLACEHOLDER_M = 5; // half-extent of the 10×10 m square drawn for catalog-missing objects
const PH_MIN: Vec3 = [-PLACEHOLDER_M, -PLACEHOLDER_M, 0];
const PH_MAX: Vec3 = [PLACEHOLDER_M, PLACEHOLDER_M, 0];
const SNAP_DEG = 5; // Shift-snap increment for the rotate handle (design §5)
const HANDLE_MARGIN_M = 6; // gap in metres between the footprint's farthest corner and the handle

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface Entry {
  obj: PlacedXref;
  selected: boolean;
  missing: boolean;
  poly: L.Polygon;
  anchor: L.CircleMarker;
  heading: L.Polyline;
  handle?: L.CircleMarker; // present only while selected & unlocked (the rotate grip)
}

// One drag at a time; `mode` routes the shared mousemove/mouseup. A move tracks the cursor delta from
// grab and keeps the latest previewed `anchor` (so a release OUTSIDE the map — where there is no map
// latlng — still commits the right spot, Fable I2); a rotate tracks the bearing anchor→cursor (and the
// start angle, to skip a no-op release), already release-position-independent via `bearing`.
type Drag =
  | { mode: "move"; id: string; startAnchor: LonLat; startMouse: L.LatLng; anchor: LonLat; moved: boolean }
  | {
      mode: "rotate";
      id: string;
      anchor: LonLat;
      startDir: number;
      bearing: number;
      moved: boolean;
    };

export class FootprintLayer {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry>();
  private index: Map<string, CatalogObject> = new Map();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: FootprintCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    map.on("mousemove", this.onMouseMove);
    // mouseup on the DOCUMENT, not the map: the Inspector and catalog flank the map, so releasing a drag
    // over them never fired the map's mouseup — the object stayed glued to the cursor with the button up
    // and the next click committed the move anywhere (Fable I2). document-level catches the release anywhere.
    document.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.group.remove();
    this.entries.clear();
  }

  /** Reconcile the drawn layers with the current objects + selection. O(changed). */
  sync(objects: PlacedXref[], index: Map<string, CatalogObject>, selection: Set<string>): void {
    // A Rescan swaps in a fresh catalog Map (loadCatalog), so every footprint's bbox / missing state may
    // differ even though the object references are untouched — force a rebuild of existing entries (I3).
    const indexChanged = this.index !== index;
    this.index = index;
    const seen = new Set<string>();
    for (const obj of objects) {
      seen.add(obj.id);
      const selected = selection.has(obj.id);
      const prev = this.entries.get(obj.id);
      switch (diffEntry(prev, obj, selected, indexChanged)) {
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

  // ── geometry helpers (the optional `direction` lets a rotate-drag preview an un-committed bearing) ──
  private cornersAt(
    anchor: LonLat,
    obj: PlacedXref,
    cat: CatalogObject | undefined,
    direction = obj.direction,
  ): LonLat[] {
    const [min, max] = cat ? [cat.bbMin, cat.bbMax] : [PH_MIN, PH_MAX];
    return footprintCorners(anchor, min, max, direction, obj.scale);
  }

  private headingAt(
    anchor: LonLat,
    obj: PlacedXref,
    cat: CatalogObject | undefined,
    direction = obj.direction,
  ): LonLat {
    return headingMarker(anchor, cat ? cat.bbMax : PH_MAX, direction, obj.scale);
  }

  /** Distance from the anchor to the rotate handle: past the farthest bbox corner so the grip always
   *  sits clear of the footprint whatever the box's shape (RCT's handleDistFor idiom). */
  private handleDist(obj: PlacedXref, cat: CatalogObject | undefined): number {
    const [min, max] = cat ? [cat.bbMin, cat.bbMax] : [PH_MIN, PH_MAX];
    const ext = Math.max(Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[1]), Math.abs(max[1]));
    return ext * obj.scale + HANDLE_MARGIN_M;
  }

  private handleAt(
    anchor: LonLat,
    obj: PlacedXref,
    cat: CatalogObject | undefined,
    direction = obj.direction,
  ): LonLat {
    return destination(anchor, this.handleDist(obj, cat), direction);
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
    const entry: Entry = { obj, selected, missing, poly, anchor, heading };
    this.entries.set(obj.id, entry);
    this.syncHandle(entry, selected); // draw the grip if this object came in selected
  }

  private restyle(entry: Entry, selected: boolean): void {
    const color = selected ? COLOR_SELECTED : entry.missing ? COLOR_MISSING : COLOR;
    entry.poly.setStyle({ color, weight: selected ? 3 : 2 });
    entry.heading.setStyle({ color });
    entry.anchor.setStyle({ color });
    this.syncHandle(entry, selected); // a restyle is a selection flip (same ref) → add/remove the grip
    entry.selected = selected;
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.group.removeLayer(e.poly);
    this.group.removeLayer(e.heading);
    this.group.removeLayer(e.anchor);
    if (e.handle) this.group.removeLayer(e.handle);
    this.entries.delete(id);
  }

  // ── the rotate handle (drawn only while selected & unlocked) ──
  private syncHandle(entry: Entry, selected: boolean): void {
    const want = selected && !entry.obj.locked;
    if (want && !entry.handle) {
      entry.handle = this.makeHandle(entry.obj);
      this.group.addLayer(entry.handle);
    } else if (!want && entry.handle) {
      this.group.removeLayer(entry.handle);
      entry.handle = undefined;
    }
  }

  private makeHandle(obj: PlacedXref): L.CircleMarker {
    const cat = this.index.get(obj.name);
    const handle = L.circleMarker(toLatLng(this.handleAt(obj.position, obj, cat)), {
      radius: 6,
      color: COLOR_HANDLE,
      weight: 2,
      fillColor: COLOR_HANDLE, // solid cyan grip — distinct from the object's hollow amber anchor dot
      fillOpacity: 1,
      className: "pct-rotate-handle",
      bubblingMouseEvents: false, // grabbing the grip never starts a map pan or a place-click
    });
    handle.on("mousedown", () => this.onGrabHandle(obj.id));
    return handle;
  }

  // ── drag (layer-local preview → one commit on release) ──
  private onGrab = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!entry || entry.obj.locked) return;
    this.map.dragging.disable();
    this.drag = {
      mode: "move",
      id,
      startAnchor: entry.obj.position,
      startMouse: e.latlng,
      anchor: entry.obj.position, // latest previewed spot; updated each mousemove, committed on release
      moved: false,
    };
  };

  private onGrabHandle = (id: string): void => {
    const entry = this.entries.get(id);
    if (!entry || entry.obj.locked) return;
    this.map.dragging.disable();
    this.drag = {
      mode: "rotate",
      id,
      anchor: entry.obj.position,
      startDir: entry.obj.direction,
      bearing: entry.obj.direction,
      moved: false,
    };
  };

  private onMouseMove = (e: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (!d) return;
    const entry = this.entries.get(d.id);
    if (!entry) return;
    const cat = this.index.get(entry.obj.name);
    d.moved = true;
    if (d.mode === "move") {
      const anchor: LonLat = {
        lon: d.startAnchor.lon + (e.latlng.lng - d.startMouse.lng),
        lat: d.startAnchor.lat + (e.latlng.lat - d.startMouse.lat),
      };
      d.anchor = anchor; // remember it so a release outside the map commits this spot (I2)
      entry.poly.setLatLngs(this.cornersAt(anchor, entry.obj, cat).map(toLatLng));
      entry.anchor.setLatLng(toLatLng(anchor));
      entry.heading.setLatLngs([toLatLng(anchor), toLatLng(this.headingAt(anchor, entry.obj, cat))]);
      entry.handle?.setLatLng(toLatLng(this.handleAt(anchor, entry.obj, cat)));
    } else {
      let bearing = initialBearing(d.anchor, { lon: e.latlng.lng, lat: e.latlng.lat });
      if (e.originalEvent.shiftKey) bearing = snapAngle(bearing, SNAP_DEG);
      d.bearing = bearing;
      entry.poly.setLatLngs(this.cornersAt(d.anchor, entry.obj, cat, bearing).map(toLatLng));
      entry.heading.setLatLngs([
        toLatLng(d.anchor),
        toLatLng(this.headingAt(d.anchor, entry.obj, cat, bearing)),
      ]);
      entry.handle?.setLatLng(toLatLng(this.handleAt(d.anchor, entry.obj, cat, bearing)));
    }
  };

  // A DOM listener (document-level), so it needs no map latlng: a move commits the last previewed
  // `anchor` and a rotate the last `bearing`, both tracked during onMouseMove (Fable I2).
  private onMouseUp = (): void => {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.map.dragging.enable();
    if (!d.moved) return; // a click, not a drag — selection is handled by the polygon click
    if (d.mode === "move") {
      // Wrap only at COMMIT, never in the live preview: dragging across the antimeridian stays visually
      // continuous, while the spot handed to the store is normalised into the loader's range (Fable B1).
      this.cb.onMove(d.id, { lon: wrapLon(d.anchor.lon), lat: d.anchor.lat });
    } else if (d.bearing !== d.startDir) {
      this.cb.onRotate(d.id, d.bearing); // skip a no-op release (snapped back to the start angle)
    }
  };
}
