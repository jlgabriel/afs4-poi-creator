// HelipadLayer.ts — the helicopter start pads on the map: a circle at each pad's real radius, an H, a
// heading tick, and a rotate grip on the selected one. Drag one to move it, drag its grip to turn it.
//
// WHY IT EXISTS. Until v1.2 the pad had no representation at all — it was derived at export time from
// whichever object happened to be selected, so "where does the helicopter actually start, and which way
// does it face" was a question you answered by flying there. ApfelFlieger asked for exactly this (forum
// #170): the start position should be something you can see on the map for "positioning, alignment and
// size", and — separately, #168 — it must not be an XREF, "because this will lead to collisions too
// quickly". Both wants are the same object: a pad of its own, drawn.
//
// ★ A LIST SINCE v1.4 (forum #221: "this element can now be used as often as desired" — his own SCLC
// ships three). This class was a SINGLETON that reached for `pads[0]`, which is the last place the UI
// knew less than the model. It now takes ParkingLayer's shape verbatim — a Map of entries keyed by id,
// reference-diff sync, drag state that names an id — because that shape was written for this (see its
// header, which says so) and a second list machine would be a second thing to keep correct.
//
// ★★ AND THE REWRITE FIXES A KNOWN BUG, which is half the reason it is a rewrite and not a widening.
// This class used to fire `onSelect` from the DOCUMENT's mouseup when a drag had never `moved`, and
// `moved` is set on the first mousemove with no threshold — so any tremor between pressing and releasing
// ate the click and the pad did not select. ParkingLayer hit this on day one and fixed it by splitting
// the gestures: `click` on the shape selects, `mousedown` starts the drag, and Leaflet decides which is
// which. The note left behind then said this file still had the fragile spelling. It does not now.
//
// WHY NOT FOLD INTO ParkingLayer OUTRIGHT. A pad is not a stand where it is drawn: the white-on-satellite
// ring, and the H — which turns with the heading and vanishes below a pixel threshold, because at world
// zoom a 10 m pad is one pixel and a fixed-size glyph over it reads as a label pinned to the ocean. That
// is a real amount of behaviour keyed to zoom, and a shared class carrying it for one of its two callers
// would be worse than two classes that share a shape.
//
// The three contracts it keeps, the same three every layer here keeps:
//   • Reference-diff sync — mutate.ts guarantees structural sharing, so a pad whose reference AND
//     selected flag are unchanged is SKIPPED; a selection-only change RESTYLES; geometry REBUILDS.
//   • Drag is layer-local — the store is untouched until mouseup fires exactly ONE callback.
//   • The rotate grip exists only on the SELECTED pad. N grips on N pads is clutter, and it is the call
//     FootprintLayer and ParkingLayer already make.

import * as L from "leaflet";
import type { AirportPad, LonLat } from "../../core/project/types";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { glyphPx } from "./glyph";
import { snapAngle } from "./rotate";

export interface HelipadCallbacks {
  onMove(id: string, p: LonLat): void; // fired once on drag END (undo-friendly), like every other layer's
  onRotate(id: string, headingDeg: number): void; // TRUE compass degrees
  /** A click that was not a drag — the pad becomes the Inspector's subject (v1.3, forum #173). Carries
   *  the pad's own id: there are several airport parts and the store needs to know WHICH one was hit. */
  onSelect(id: string): void;
}

/** White, because a helipad IS white — and because every other colour on this map is spoken for
 *  (blue footprints, violet stands, amber selection, cyan grips, green plants). A dark casing underneath
 *  keeps it readable on pale satellite imagery. */
const PAD_STROKE = "#ffffff";
const PAD_CASING = "#0f172a";
/** Selected: the same amber every other selected thing on this map wears (FootprintLayer's
 *  COLOR_SELECTED). v1.3 — before it, the pad could not be selected at all. */
const PAD_SELECTED = "#f59e0b";
const COLOR_HANDLE = "#06b6d4"; // the same cyan grip the footprints use — it is the same control
const SNAP_DEG = 5; // Shift-snap, as everywhere else

/** Gap in metres between a pad's rim and its rotate grip. */
const HANDLE_MARGIN_M = 6;
/** Don't draw the H until the pad's on-screen radius reaches this many pixels. */
const H_MIN_PX = 14;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface Entry {
  /** The pad this entry was BUILT from — the reference the diff compares against. */
  pad: AirportPad;
  selected: boolean;
  casing: L.Circle;
  ring: L.Circle;
  tick: L.Polyline;
  glyph?: L.Marker; // the H — present only while the pad is big enough on screen to hold it
  handle?: L.CircleMarker; // present only while selected
}

type Drag =
  | { id: string; mode: "move"; startAt: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  | { id: string; mode: "rotate"; at: LonLat; startHeading: number; heading: number; moved: boolean };

export class HelipadLayer {
  private readonly group: L.LayerGroup;
  private readonly entries = new Map<string, Entry>();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: HelipadCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    map.on("mousemove", this.onMouseMove);
    map.on("zoomend", this.onZoomEnd);
    // document-level, for the same reason FootprintLayer uses it: the Inspector and catalog flank the
    // map, so a release over them never reaches the map's own mouseup and a pad stays glued to the
    // cursor with the button up.
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

  /** Reconcile with the document. An empty list clears everything, which is what a project with no
   *  airport — or an airport with no pads, legal since the DATA submenu — draws.
   *
   *  `selectedId` is an ID rather than the store's AirportSelection on purpose: this class stays
   *  store-agnostic, exactly like FootprintLayer taking a `Set<string>`. MapView does the narrowing.
   *
   *  Mid-drag the dragged pad is left alone: its shapes hold a PREVIEW the store has not been told about,
   *  and rebuilding from the stored value would snap it back under the cursor on any unrelated repaint. */
  sync(pads: readonly AirportPad[], selectedId: string | null = null): void {
    const live = new Set<string>();
    for (const p of pads) {
      live.add(p.id);
      const selected = p.id === selectedId;
      const cur = this.entries.get(p.id);
      if (cur !== undefined && this.drag?.id === p.id) {
        cur.pad = p; // keep the reference fresh; the shapes stay where the drag put them
        continue;
      }
      if (cur === undefined) {
        this.entries.set(p.id, this.build(p, selected));
        continue;
      }
      if (cur.pad === p && cur.selected === selected) continue; // untouched → skip
      if (cur.pad === p) {
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
    if (e.glyph) this.group.removeLayer(e.glyph);
    if (e.handle) this.group.removeLayer(e.handle);
    this.entries.delete(id);
  }

  private build(p: AirportPad, selected: boolean): Entry {
    const { position, radius } = p;
    // Two concentric circles rather than one: Leaflet strokes a single path in one colour, and a white
    // rim alone vanishes over concrete or snow. The casing is the same circle, one step wider and dark.
    const casing = L.circle(toLatLng(position), {
      radius,
      color: PAD_CASING,
      weight: 5,
      opacity: 0.55,
      fill: false,
      interactive: false,
    }).addTo(this.group);
    const ring = L.circle(toLatLng(position), {
      radius,
      ...ringStyle(selected),
      className: "pct-helipad",
      bubblingMouseEvents: false, // grabbing a pad never starts a map pan or a place-click
    }).addTo(this.group);
    // Select on CLICK, drag on MOUSEDOWN — see the header. This split is the whole fix.
    ring.on("click", () => this.cb.onSelect(p.id));
    ring.on("mousedown", (e: L.LeafletMouseEvent) => this.onGrab(p.id, e));

    const tick = L.polyline([toLatLng(position), toLatLng(tipAt(p, position, p.heading))], {
      color: PAD_STROKE,
      weight: 2,
      opacity: 0.9,
      interactive: false,
    }).addTo(this.group);

    const entry: Entry = { pad: p, selected, casing, ring, tick };
    if (selected) this.addHandle(entry);
    this.layoutGlyph(entry);
    return entry;
  }

  private addHandle(e: Entry): void {
    const p = e.pad;
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
    if (e.selected && e.handle === undefined) {
      this.addHandle(e);
      return;
    }
    if (!e.selected && e.handle !== undefined) {
      this.group.removeLayer(e.handle);
      e.handle = undefined;
    }
  }

  /** A pad's on-screen radius in pixels — how the H decides whether it fits. */
  private radiusPx(p: AirportPad): number {
    const c = this.map.latLngToLayerPoint(toLatLng(p.position));
    const edge = this.map.latLngToLayerPoint(toLatLng(destination(p.position, p.radius, 90)));
    return Math.abs(edge.x - c.x);
  }

  /** Create, move or drop one pad's H. Called on build, on every zoom and through the drag preview,
   *  because whether it fits is a function of the zoom and nothing else. */
  private layoutGlyph(e: Entry, at?: LonLat, heading?: number): void {
    const p = e.pad;
    const where = at ?? p.position;
    const rot = heading ?? p.heading;
    if (this.radiusPx(p) < H_MIN_PX) {
      if (e.glyph !== undefined) {
        this.group.removeLayer(e.glyph);
        e.glyph = undefined;
      }
      return;
    }
    // The H turns WITH the pad — a helipad's H is painted along the approach, so a pad heading 090 shows
    // an H lying on its side. That is also the cheapest readout of the heading at a glance.
    //
    // ★ AND IT IS SIZED FROM THE PAD, not from the screen (v1.8) — see glyph.ts. The icon box is 0×0 and
    // the letter centres itself with translate(-50%,-50%), because a fixed box cannot hold a letter whose
    // size changes with the zoom.
    const size = glyphPx(this.radiusPx(p));
    const style = `font-size:${size}px;transform:translate(-50%,-50%) rotate(${rot}deg)`;
    const html = `<div class="pct-helipad-h" style="${style}">H</div>`;
    if (e.glyph === undefined) {
      e.glyph = L.marker(toLatLng(where), {
        icon: L.divIcon({ html, className: "pct-helipad-glyph", iconSize: [0, 0], iconAnchor: [0, 0] }),
        interactive: false,
        keyboard: false,
      }).addTo(this.group);
      return;
    }
    e.glyph.setLatLng(toLatLng(where));
    const el = e.glyph.getElement()?.firstElementChild as HTMLElement | undefined;
    if (el) el.setAttribute("style", style);
  }

  private onZoomEnd = (): void => {
    for (const e of this.entries.values()) this.layoutGlyph(e);
  };

  // ── drag: layer-local preview, one commit on release (the contract every layer here keeps) ──

  private static isPrimary(e: L.LeafletMouseEvent): boolean {
    return e.originalEvent.button === 0;
  }

  private onGrab = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!HelipadLayer.isPrimary(e) || entry === undefined) return;
    this.map.dragging.disable();
    const at = entry.pad.position;
    this.drag = { id, mode: "move", startAt: at, startMouse: e.latlng, at, moved: false };
  };

  private onGrabHandle = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.entries.get(id);
    if (!HelipadLayer.isPrimary(e) || entry === undefined) return;
    this.map.dragging.disable();
    const { position, heading } = entry.pad;
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
    e.tick.setLatLngs([toLatLng(at), toLatLng(tipAt(e.pad, at, heading))]);
    e.handle?.setLatLng(toLatLng(gripAt(e.pad, at, heading)));
    this.layoutGlyph(e, at, heading);
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
      this.preview(e, d.at, e.pad.heading);
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
      if (e !== undefined) this.preview(e, e.pad.position, e.pad.heading);
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
  const color = selected ? PAD_SELECTED : PAD_STROKE;
  return { color, weight: selected ? 3 : 2, fillColor: color, fillOpacity: 0.12 };
}

/** Where the heading tick ends: on the rim. */
function tipAt(p: AirportPad, at: LonLat, heading: number): LonLat {
  return destination(at, p.radius, heading);
}

/** Where the rotate grip sits: just past the rim, so it never overlaps the pad it turns. */
function gripAt(p: AirportPad, at: LonLat, heading: number): LonLat {
  return destination(at, p.radius + HANDLE_MARGIN_M, heading);
}
