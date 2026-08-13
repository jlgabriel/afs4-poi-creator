// ParkingLayer.ts — the airport's parking positions on the map: a circle at each stand's real size, a
// heading tick, and a rotate grip on the selected one.
//
// WHY IT EXISTS (forum #232, ApfelFlieger). A stand is its own point, for the same reason the helipad is
// (#168): one that borrowed an XREF's coordinates parks the aircraft inside the building. Its mask is his
// — LON · LAT · HEADING TRUE · SIZE m · NAME · TYPE — and "any number of parking positions can be
// created", which is the whole difference from the pad.
//
// WHY NOT HelipadLayer, WIDENED. That class is a SINGLETON with tuned pad visuals (white ring, the H that
// turns with the heading, the H that disappears below a pixel threshold), and it is in production and
// flown. Widening it to a list while also changing what it draws would put two risks in one change. This
// class is the LIST shape, and it is deliberately written so the other repeatable point kinds — pads once
// #221 lands, aerotows, winches — can fold into it later. A runway will not: it is two points, not one.
//
// The three contracts it inherits from FootprintLayer, because they are the reason the map stays at 60 fps
// and the reason a drag is one undo entry:
//   • Reference-diff sync — mutate.ts guarantees structural sharing, so a stand whose reference AND
//     selected flag are unchanged is SKIPPED; a selection-only change RESTYLES; geometry REBUILDS.
//   • Drag is layer-local — the store is untouched until mouseup fires exactly ONE callback.
//   • The rotate grip exists only on the SELECTED stand. N grips on N stands is clutter, and it is the
//     same call FootprintLayer already makes ("present only while selected").
import * as L from "leaflet";
import type { AirportParking, LonLat } from "../../core/project/types";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { snapAngle } from "./rotate";

export interface ParkingCallbacks {
  onMove(id: string, p: LonLat): void; // fired once on drag END, like every other layer's
  onRotate(id: string, headingDeg: number): void; // TRUE compass degrees
  /** A click that was not a drag — the stand becomes the Inspector's subject. */
  onSelect(id: string): void;
}

/** Violet, because every other colour on this map is already spoken for: blue footprints, white pads,
 *  green plants, amber selection, red missing, cyan grips. A dark casing underneath keeps it readable on
 *  pale satellite imagery, exactly as the pad does. */
const STAND_STROKE = "#a855f7";
const STAND_CASING = "#0f172a";
/** Selected: the same amber every other selected thing on this map wears (FootprintLayer's
 *  COLOR_SELECTED), so selection reads identically whatever you selected. */
const STAND_SELECTED = "#f59e0b";
const COLOR_HANDLE = "#06b6d4"; // the same cyan grip the footprints and the pad use — it is the same control
const SNAP_DEG = 5; // Shift-snap, as everywhere else
/** Gap in metres between the stand's rim and its rotate grip, so the grip never overlaps what it turns. */
const HANDLE_MARGIN_M = 6;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface Entry {
  /** The stand this entry was BUILT from — the reference the diff compares against. */
  parking: AirportParking;
  selected: boolean;
  casing: L.Circle;
  ring: L.Circle;
  tick: L.Polyline;
  handle?: L.CircleMarker; // present only while selected
}

type Drag =
  | { id: string; mode: "move"; startAt: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  | { id: string; mode: "rotate"; at: LonLat; startHeading: number; heading: number; moved: boolean };

export class ParkingLayer {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry>();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: ParkingCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    this.map.on("mousemove", this.onMouseMove);
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

  /** Reconcile with the document. Mid-drag the dragged stand is left alone: its shapes hold a PREVIEW the
   *  store has not been told about, and rebuilding from the stored value would snap it back under the
   *  cursor on any unrelated repaint. */
  sync(parkings: readonly AirportParking[], selectedId: string | null = null): void {
    const live = new Set<string>();
    for (const p of parkings) {
      live.add(p.id);
      const selected = p.id === selectedId;
      const cur = this.entries.get(p.id);
      if (cur !== undefined && this.drag?.id === p.id) {
        cur.parking = p; // keep the reference fresh; the shapes stay where the drag put them
        continue;
      }
      if (cur === undefined) {
        this.entries.set(p.id, this.build(p, selected));
        continue;
      }
      if (cur.parking === p && cur.selected === selected) continue; // untouched → skip (P1-5)
      if (cur.parking === p) {
        cur.selected = selected;
        this.restyle(cur);
        continue;
      }
      this.remove(p.id);
      this.entries.set(p.id, this.build(p, selected));
    }
    for (const id of [...this.entries.keys()]) if (!live.has(id)) this.remove(id);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (e === undefined) return;
    this.group.removeLayer(e.casing);
    this.group.removeLayer(e.ring);
    this.group.removeLayer(e.tick);
    if (e.handle) this.group.removeLayer(e.handle);
    this.entries.delete(id);
  }

  private build(p: AirportParking, selected: boolean): Entry {
    const { position, size } = p;
    // Two concentric circles rather than one: Leaflet strokes a single path in one colour, and a thin rim
    // alone vanishes over concrete. The casing is the same circle, one step wider and dark.
    const casing = L.circle(toLatLng(position), {
      radius: size,
      color: STAND_CASING,
      weight: 5,
      opacity: 0.55,
      fill: false,
      interactive: false,
    }).addTo(this.group);
    const ring = L.circle(toLatLng(position), {
      radius: size,
      ...ringStyle(selected),
      className: "pct-parking",
      bubblingMouseEvents: false, // grabbing a stand never starts a map pan or a place-click
    }).addTo(this.group);
    // Select on CLICK, drag on MOUSEDOWN — the split FootprintLayer uses, and it is not cosmetic. The
    // other spelling (fire onSelect from the document mouseup when the drag never `moved`) loses the
    // selection to any stray mousemove that lands between the press and the release, because `moved` is
    // set unconditionally on the first move. Leaflet already decides what counts as a click; let it.
    ring.on("click", () => this.cb.onSelect(p.id));
    ring.on("mousedown", (e: L.LeafletMouseEvent) => this.onGrab(p.id, e));

    const tick = L.polyline([toLatLng(position), toLatLng(tipAt(p, position, p.heading))], {
      color: selected ? STAND_SELECTED : STAND_STROKE,
      weight: 2,
      opacity: 0.9,
      interactive: false,
    }).addTo(this.group);

    const entry: Entry = { parking: p, selected, casing, ring, tick };
    if (selected) this.addHandle(entry);
    return entry;
  }

  private addHandle(e: Entry): void {
    const p = e.parking;
    const handle = L.circleMarker(toLatLng(gripAt(p, p.position, p.heading)), {
      radius: 6,
      color: COLOR_HANDLE,
      weight: 2,
      fillColor: COLOR_HANDLE,
      fillOpacity: 1,
      className: "pct-rotate-handle",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    handle.on("mousedown", (ev: L.LeafletMouseEvent) => this.onGrabHandle(p.id, ev));
    e.handle = handle;
  }

  /** Selection changed but the geometry did not — repaint without tearing the shapes down, and add or
   *  drop the grip, which is the one shape selection creates. */
  private restyle(e: Entry): void {
    e.ring.setStyle(ringStyle(e.selected));
    e.tick.setStyle({ color: e.selected ? STAND_SELECTED : STAND_STROKE });
    if (e.selected && e.handle === undefined) {
      this.addHandle(e);
      return;
    }
    if (!e.selected && e.handle !== undefined) {
      this.group.removeLayer(e.handle);
      e.handle = undefined;
    }
  }

  // ── drag: layer-local preview, one commit on release ──

  private static isPrimary(e: L.LeafletMouseEvent): boolean {
    return e.originalEvent.button === 0;
  }

  private onGrab = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!ParkingLayer.isPrimary(e) || entry === undefined) return;
    this.map.dragging.disable();
    const at = entry.parking.position;
    this.drag = { id, mode: "move", startAt: at, startMouse: e.latlng, at, moved: false };
  };

  private onGrabHandle = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!ParkingLayer.isPrimary(e) || entry === undefined) return;
    this.map.dragging.disable();
    const { position, heading } = entry.parking;
    this.drag = { id, mode: "rotate", at: position, startHeading: heading, heading, moved: false };
    // The store isn't touched until release, so without a live readout the angle being dragged to is
    // invisible. Degrees here are TRUE — the sim shows magnetic, which is why the panel says so too.
    entry.handle
      ?.bindTooltip(`${Math.round(heading)}°`, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "pct-rotate-tip",
      })
      .openTooltip();
  };

  private preview(e: Entry, at: LonLat, heading: number): void {
    e.casing.setLatLng(toLatLng(at));
    e.ring.setLatLng(toLatLng(at));
    e.tick.setLatLngs([toLatLng(at), toLatLng(tipAt(e.parking, at, heading))]);
    e.handle?.setLatLng(toLatLng(gripAt(e.parking, at, heading)));
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
      this.preview(e, d.at, e.parking.heading);
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
    // The tooltip belongs to the gesture, not the grip: it goes on ANY release, drag or not.
    if (d.mode === "rotate") e?.handle?.unbindTooltip();
    if (!d.moved) {
      // A press with no movement: drop any half-applied preview. Selecting is the ring's own `click`
      // handler's job, not this one's — see build().
      if (e !== undefined) this.preview(e, e.parking.position, e.parking.heading);
      return;
    }
    if (d.mode === "move") {
      // Wrap only at COMMIT: dragging across the antimeridian stays visually continuous while the value
      // handed to the store is normalised into the range the loader accepts.
      this.cb.onMove(d.id, { lon: wrapLon(d.at.lon), lat: d.at.lat });
    } else if (d.heading !== d.startHeading) {
      this.cb.onRotate(d.id, d.heading);
    }
  };
}

/** The ring's paint, which is what selection changes. One place, so build and restyle cannot drift. */
function ringStyle(selected: boolean): L.PathOptions {
  const color = selected ? STAND_SELECTED : STAND_STROKE;
  return { color, weight: selected ? 3 : 2, fillColor: color, fillOpacity: 0.12 };
}

/** Where the heading tick ends: on the rim. */
function tipAt(p: AirportParking, at: LonLat, heading: number): LonLat {
  return destination(at, p.size, heading);
}

/** Where the rotate grip sits: just past the rim. */
function gripAt(p: AirportParking, at: LonLat, heading: number): LonLat {
  return destination(at, p.size + HANDLE_MARGIN_M, heading);
}
