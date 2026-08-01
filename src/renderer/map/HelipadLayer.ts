// HelipadLayer.ts — the helicopter's start pad on the map: a circle at its real radius, an H, a heading
// tick and a rotate grip. Drag it to move it, drag the grip to turn it.
//
// WHY IT EXISTS. Until v1.2 the pad had no representation at all — it was derived at export time from
// whichever object happened to be selected, so "where does the helicopter actually start, and which way
// does it face" was a question you answered by flying there. ApfelFlieger asked for exactly this (forum
// #170): the start position should be something you can see on the map for "positioning, alignment and
// size", and — separately, #168 — it must not be an XREF, "because this will lead to collisions too
// quickly". Both wants are the same object: a pad of its own, drawn.
//
// WHY A SEPARATE LAYER, not a third `Entry` shape in FootprintLayer. The pad is not a placed object: there
// is exactly ONE per project, it is never in `selection`, it has no catalog entry, no height and no
// missing state, and it is drawn whether or not anything is selected. Threading that through
// FootprintLayer's diff/restyle/drag machinery would mean widening `Entry`, `Drag` and four dispatch
// sites so every one of them could ask "…unless it's the pad". This class carries its own six-line drag
// instead. The two layers share the map and nothing else.
//
// The H is drawn only when the circle is big enough to hold it (see H_MIN_PX): at world zoom a 10 m pad
// is a pixel, and a fixed-size glyph over it reads as a label pinned to the ocean.

import * as L from "leaflet";
import type { LonLat, ProjectAirport } from "../../core/project/types";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { snapAngle } from "./rotate";

export interface HelipadCallbacks {
  onMove(p: LonLat): void; // fired once on drag END (undo-friendly), like FootprintLayer's
  onRotate(headingDeg: number): void; // TRUE compass degrees
}

/** White, because a helipad IS white — and because every other colour on this map is spoken for
 *  (blue footprints, amber selection, cyan grips, green plants). A dark casing underneath keeps it
 *  readable on pale satellite imagery. */
const PAD_STROKE = "#ffffff";
const PAD_CASING = "#0f172a";
const COLOR_HANDLE = "#06b6d4"; // the same cyan grip the footprints use — it is the same control
const SNAP_DEG = 5; // Shift-snap, as everywhere else

/** Gap in metres between the pad's rim and its rotate grip. */
const HANDLE_MARGIN_M = 6;
/** Don't draw the H until the pad's on-screen radius reaches this many pixels. */
const H_MIN_PX = 14;

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

type Drag =
  | { mode: "move"; startPad: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  | { mode: "rotate"; at: LonLat; startHeading: number; heading: number; moved: boolean };

export class HelipadLayer {
  private readonly group: L.LayerGroup;
  private airport: ProjectAirport | null = null;
  private drag: Drag | null = null;

  private casing: L.Circle | null = null;
  private ring: L.Circle | null = null;
  private glyph: L.Marker | null = null;
  private tick: L.Polyline | null = null;
  private grip: L.CircleMarker | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: HelipadCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
    map.on("mousemove", this.onMouseMove);
    map.on("zoomend", this.onZoomEnd);
    // document-level, for the same reason FootprintLayer uses it: the Inspector and catalog flank the
    // map, so a release over them never reaches the map's own mouseup and the pad stays glued to the
    // cursor with the button up.
    document.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    this.map.off("zoomend", this.onZoomEnd);
    document.removeEventListener("mouseup", this.onMouseUp);
    if (this.drag) this.map.dragging.enable();
    this.drag = null;
    this.group.remove();
  }

  /** Reconcile with the document. `undefined` (a project with no airport block) clears the pad. */
  sync(airport: ProjectAirport | undefined): void {
    const next = airport ?? null;
    if (next === null) {
      if (this.airport !== null) this.clear();
      this.airport = null;
      return;
    }
    // Mid-drag the shapes hold a PREVIEW the store hasn't been told about yet; rebuilding from the
    // stored (pre-drag) values would snap the pad back under the cursor on every unrelated repaint.
    if (this.drag !== null) {
      this.airport = next;
      return;
    }
    const changed =
      this.airport === null ||
      this.airport.pad.position !== next.pad.position ||
      this.airport.pad.heading !== next.pad.heading ||
      this.airport.pad.radius !== next.pad.radius;
    this.airport = next;
    if (changed) this.rebuild();
  }

  private clear(): void {
    this.group.clearLayers();
    this.casing = this.ring = null;
    this.glyph = null;
    this.tick = null;
    this.grip = null;
  }

  private rebuild(): void {
    const a = this.airport;
    if (a === null) return;
    this.clear();
    const { position, radius } = a.pad;

    // Two concentric circles rather than one: Leaflet strokes a single path in one colour, and a white
    // rim alone vanishes over concrete or snow. The casing is the same circle, one step wider and dark.
    this.casing = L.circle(toLatLng(position), {
      radius,
      color: PAD_CASING,
      weight: 5,
      opacity: 0.55,
      fill: false,
      interactive: false,
    }).addTo(this.group);
    this.ring = L.circle(toLatLng(position), {
      radius,
      color: PAD_STROKE,
      weight: 2,
      fillColor: PAD_STROKE,
      fillOpacity: 0.12,
      className: "pct-helipad",
      bubblingMouseEvents: false, // grabbing the pad never starts a map pan or a place-click
    }).addTo(this.group);
    this.ring.on("mousedown", this.onGrab);

    this.tick = L.polyline([toLatLng(position), toLatLng(this.tipAt(position))], {
      color: PAD_STROKE,
      weight: 2,
      opacity: 0.9,
      interactive: false,
    }).addTo(this.group);

    this.grip = L.circleMarker(toLatLng(this.gripAt(position)), {
      radius: 6,
      color: COLOR_HANDLE,
      weight: 2,
      fillColor: COLOR_HANDLE,
      fillOpacity: 1,
      className: "pct-rotate-handle",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    this.grip.on("mousedown", this.onGrabHandle);

    this.layoutGlyph();
  }

  // ── geometry (the optional `heading` previews an un-committed angle mid-drag) ──

  /** Where the heading tick ends: on the rim. */
  private tipAt(at: LonLat, heading = this.airport?.pad.heading ?? 0): LonLat {
    return destination(at, this.airport?.pad.radius ?? 0, heading);
  }

  /** Where the rotate grip sits: just past the rim, so it never overlaps the pad it turns. */
  private gripAt(at: LonLat, heading = this.airport?.pad.heading ?? 0): LonLat {
    return destination(at, (this.airport?.pad.radius ?? 0) + HANDLE_MARGIN_M, heading);
  }

  /** The pad's on-screen radius in pixels — how the H decides whether it fits. */
  private radiusPx(): number {
    const a = this.airport;
    if (a === null) return 0;
    const c = this.map.latLngToLayerPoint(toLatLng(a.pad.position));
    const edge = this.map.latLngToLayerPoint(toLatLng(destination(a.pad.position, a.pad.radius, 90)));
    return Math.abs(edge.x - c.x);
  }

  /** Create, move or drop the H. Called on rebuild and on every zoom, because whether it fits is a
   *  function of the zoom and nothing else. */
  private layoutGlyph(at?: LonLat, heading?: number): void {
    const a = this.airport;
    if (a === null) return;
    const where = at ?? a.pad.position;
    const rot = heading ?? a.pad.heading;
    if (this.radiusPx() < H_MIN_PX) {
      if (this.glyph !== null) {
        this.group.removeLayer(this.glyph);
        this.glyph = null;
      }
      return;
    }
    // The H turns WITH the pad — a helipad's H is painted along the approach, so a pad heading 090 shows
    // an H lying on its side. That is also the cheapest readout of the heading at a glance.
    const html = `<div class="pct-helipad-h" style="transform:rotate(${rot}deg)">H</div>`;
    if (this.glyph === null) {
      this.glyph = L.marker(toLatLng(where), {
        icon: L.divIcon({ html, className: "pct-helipad-glyph", iconSize: [24, 24], iconAnchor: [12, 12] }),
        interactive: false,
        keyboard: false,
      }).addTo(this.group);
      return;
    }
    this.glyph.setLatLng(toLatLng(where));
    const el = this.glyph.getElement()?.firstElementChild as HTMLElement | undefined;
    if (el) el.style.transform = `rotate(${rot}deg)`;
  }

  private onZoomEnd = (): void => {
    if (this.airport !== null) this.layoutGlyph();
  };

  // ── drag: layer-local preview, one commit on release (the same contract FootprintLayer keeps) ──

  private static isPrimary(e: L.LeafletMouseEvent): boolean {
    return e.originalEvent.button === 0;
  }

  private onGrab = (e: L.LeafletMouseEvent): void => {
    if (!HelipadLayer.isPrimary(e) || this.airport === null) return;
    this.map.dragging.disable();
    const at = this.airport.pad.position;
    this.drag = { mode: "move", startPad: at, startMouse: e.latlng, at, moved: false };
  };

  private onGrabHandle = (e: L.LeafletMouseEvent): void => {
    if (!HelipadLayer.isPrimary(e) || this.airport === null) return;
    this.map.dragging.disable();
    const { position, heading } = this.airport.pad;
    this.drag = { mode: "rotate", at: position, startHeading: heading, heading, moved: false };
    // The store isn't touched until release, so without a live readout the angle being dragged to is
    // invisible. Degrees here are TRUE — the sim shows magnetic, which is why the dialog says so too.
    this.grip
      ?.bindTooltip(`${Math.round(heading)}°`, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "pct-rotate-tip",
      })
      .openTooltip();
  };

  private preview(at: LonLat, heading: number): void {
    this.casing?.setLatLng(toLatLng(at));
    this.ring?.setLatLng(toLatLng(at));
    this.tick?.setLatLngs([toLatLng(at), toLatLng(this.tipAt(at, heading))]);
    this.grip?.setLatLng(toLatLng(this.gripAt(at, heading)));
    this.layoutGlyph(at, heading);
  }

  private onMouseMove = (e: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null || this.airport === null) return;
    d.moved = true;
    if (d.mode === "move") {
      d.at = {
        lon: d.startPad.lon + (e.latlng.lng - d.startMouse.lng),
        lat: d.startPad.lat + (e.latlng.lat - d.startMouse.lat),
      };
      this.preview(d.at, this.airport.pad.heading);
    } else {
      let heading = initialBearing(d.at, { lon: e.latlng.lng, lat: e.latlng.lat });
      if (e.originalEvent.shiftKey) heading = snapAngle(heading, SNAP_DEG);
      d.heading = heading;
      this.preview(d.at, heading);
      this.grip?.setTooltipContent(`${Math.round(heading)}°`);
    }
  };

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.drag = null;
    this.map.dragging.enable();
    // The tooltip belongs to the gesture, not the grip: it goes on ANY release, drag or not.
    if (d.mode === "rotate") this.grip?.unbindTooltip();
    if (!d.moved) {
      this.rebuild(); // a click, not a drag — drop any half-applied preview
      return;
    }
    if (d.mode === "move") {
      // Wrap only at COMMIT: dragging across the antimeridian stays visually continuous while the value
      // handed to the store is normalised into the range the loader accepts.
      this.cb.onMove({ lon: wrapLon(d.at.lon), lat: d.at.lat });
    } else if (d.heading !== d.startHeading) {
      this.cb.onRotate(d.heading);
    }
  };
}
