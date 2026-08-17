// GliderLayer.ts — the two glider starts on the map: AEROTOW and WINCH LAUNCH.
//
// ONE layer for both, because they are one family. ApfelFlieger delivered them in one breath (forum
// #237/#238), both live ONLY in the `.wad`, both are named by the user after the runway they serve, and
// both are a glider on the ground with a rope leading away from it. Splitting them would mean a fourth and
// a fifth copy of the same drag state machine — this file has one, with four modes.
//
// WHAT MAKES THEM DIFFERENT, and it is the whole reason the winch is not just an aerotow:
//
//   AEROTOW  — a point and a HEADING. The tug pulls that way; the rope is drawn a fixed 60 m, his figure.
//   WINCH    — a PAIR of points and no heading at all. "The length and direction then result from the two
//              positions GLIDER and WINCH", so the rope (800–1000 m of it) IS the geometry, and storing a
//              heading beside it would let the two disagree. Same shape as a runway, one dimension poorer.
//
// ✅ WINCH LAUNCH IS REPAIRED IN FS 4 (forum #261) — it came out twisted in the ground through v1.4.0
// (#229), which is why this file carried a ⛔ and why the shape drawn here had never been confirmed
// against the simulator. He reported both the bug and the fix; the warnings in the UI went with it.
//
// The three contracts every layer here keeps: reference-diff sync, layer-local drag preview with exactly
// one commit on release, and select on the shape's own `click` while `mousedown` starts the drag — never
// onSelect from the mouseup, which any stray mousemove eats.
import * as L from "leaflet";
import type { AirportAerotow, AirportWinch, LonLat } from "../../core/project/types";
import { destination, initialBearing, wrapLon } from "../../core/geo/geo";
import { snapAngle } from "./rotate";

export type GliderKind = "aerotow" | "winch";
/** Which point of a winch launch a drag has hold of. */
export type WinchPoint = "glider" | "winch";

export interface GliderCallbacks {
  onMoveAerotow(id: string, p: LonLat): void;
  onRotateAerotow(id: string, headingDeg: number): void;
  onMoveWinchPoint(id: string, which: WinchPoint, p: LonLat): void;
  /** The rope itself was dragged: BOTH points, so the store commits them as one undo entry. */
  onMoveWinch(id: string, glider: LonLat, winch: LonLat): void;
  onSelect(kind: GliderKind, id: string): void;
}

/** Pink: the last free slot in this map's palette (blue footprints, white pad, green plants, amber
 *  selection, red missing, cyan grips, violet stands, pale slate runway). Both glider starts share it
 *  deliberately — they are the same kind of thing, and the shape says which one you are looking at. */
const GLIDER_STROKE = "#ec4899";
const GLIDER_CASING = "#0f172a";
const GLIDER_SELECTED = "#f59e0b";
const COLOR_HANDLE = "#06b6d4";
const SNAP_DEG = 5;
const MARK_PX = 6; // the glider itself is a POINT fixture, so pixels, not metres — a 10 m glider is
// invisible at the zoom an airport is laid out at (the same call FootprintLayer makes for a light).
/** The winch drum's side, in pixels. Matched to the glider dot's DIAMETER (2 × MARK_PX) so the two ends
 *  of a launch read as the same weight — a square that circumscribed the circle would look bigger. */
const WINCH_BOX_PX = 2 * MARK_PX;
/** How much rope to draw for an aerotow. His figure; the file stores no length, only the heading. */
const AEROTOW_ROPE_M = 60;
const HANDLE_MARGIN_M = 25; // gap between the rope's end and the rotate grip

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

interface AerotowEntry {
  kind: "aerotow";
  model: AirportAerotow;
  selected: boolean;
  mark: L.CircleMarker;
  rope: L.Polyline;
  handle?: L.CircleMarker;
}
interface WinchEntry {
  kind: "winch";
  model: AirportWinch;
  selected: boolean;
  mark: L.CircleMarker; // the glider
  // ★ THE ONLY SQUARE ON THIS MAP, and a Marker rather than a Path for that reason (#278): "The symbol at
  // the position of the winch must be rectangular instead of a round circle." Leaflet's vector shapes are
  // circles and lat/lng polygons — a rectangle drawn in degrees would grow and shrink with the zoom,
  // while the glider dot beside it stayed 12 px. So it is a divIcon, the way AirportLayer draws its ⊕ and
  // HelipadLayer its H, and it is styled through setIcon instead of setStyle.
  far: L.Marker; // the winch itself: a drum, and it looks like one
  rope: L.Polyline;
}

type Drag =
  | { kind: "aerotow"; id: string; mode: "move"; startAt: LonLat; startMouse: L.LatLng; at: LonLat; moved: boolean }
  | { kind: "aerotow"; id: string; mode: "rotate"; at: LonLat; startHeading: number; heading: number; moved: boolean }
  | {
      kind: "winch";
      id: string;
      which: WinchPoint;
      startAt: LonLat;
      startMouse: L.LatLng;
      at: LonLat;
      moved: boolean;
    }
  /** The rope: both points by the same offset, so the launch keeps its length and direction. */
  | {
      kind: "winch-body";
      id: string;
      startGlider: LonLat;
      startWinch: LonLat;
      startMouse: L.LatLng;
      glider: LonLat;
      winch: LonLat;
      moved: boolean;
    };

export class GliderLayer {
  private readonly group: L.LayerGroup;
  private readonly aerotows = new Map<string, AerotowEntry>();
  private readonly winches = new Map<string, WinchEntry>();
  private drag: Drag | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly cb: GliderCallbacks,
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
    this.aerotows.clear();
    this.winches.clear();
    this.group.remove();
  }

  sync(
    aerotows: readonly AirportAerotow[],
    winches: readonly AirportWinch[],
    selected: { kind: GliderKind; id: string } | null = null,
  ): void {
    const selAerotow = selected?.kind === "aerotow" ? selected.id : null;
    const selWinch = selected?.kind === "winch" ? selected.id : null;

    const liveA = new Set<string>();
    for (const a of aerotows) {
      liveA.add(a.id);
      const isSel = a.id === selAerotow;
      const cur = this.aerotows.get(a.id);
      if (cur !== undefined && this.drag?.kind === "aerotow" && this.drag.id === a.id) {
        cur.model = a;
        continue;
      }
      if (cur === undefined) {
        this.aerotows.set(a.id, this.buildAerotow(a, isSel));
        continue;
      }
      if (cur.model === a && cur.selected === isSel) continue;
      if (cur.model === a) {
        cur.selected = isSel;
        this.restyleAerotow(cur);
        continue;
      }
      this.removeAerotow(a.id);
      this.aerotows.set(a.id, this.buildAerotow(a, isSel));
    }
    for (const id of [...this.aerotows.keys()]) if (!liveA.has(id)) this.removeAerotow(id);

    const liveW = new Set<string>();
    for (const w of winches) {
      liveW.add(w.id);
      const isSel = w.id === selWinch;
      const cur = this.winches.get(w.id);
      if (cur !== undefined && this.drag?.kind === "winch" && this.drag.id === w.id) {
        cur.model = w;
        continue;
      }
      if (cur === undefined) {
        this.winches.set(w.id, this.buildWinch(w, isSel));
        continue;
      }
      if (cur.model === w && cur.selected === isSel) continue;
      if (cur.model === w) {
        cur.selected = isSel;
        this.restyleWinch(cur);
        continue;
      }
      this.removeWinch(w.id);
      this.winches.set(w.id, this.buildWinch(w, isSel));
    }
    for (const id of [...this.winches.keys()]) if (!liveW.has(id)) this.removeWinch(id);
  }

  // ── build / remove ──

  private markerAt(p: LonLat, selected: boolean): L.CircleMarker {
    return L.circleMarker(toLatLng(p), {
      radius: MARK_PX,
      color: GLIDER_CASING,
      weight: 2,
      fillColor: selected ? GLIDER_SELECTED : GLIDER_STROKE,
      fillOpacity: 1,
      bubblingMouseEvents: false,
    });
  }

  /** The winch drum. Not draggable in Leaflet's sense — the launch has its own drag machinery below, and
   *  handing this one end to Leaflet would give it a different feel from the glider and the rope. */
  private winchBoxAt(p: LonLat, selected: boolean): L.Marker {
    return L.marker(toLatLng(p), {
      icon: winchIcon(selected),
      keyboard: false,
      bubblingMouseEvents: false,
      // Markers already sit above the vector panes; this only orders it against the pads and stands, the
      // way AirportLayer orders its ⊕ — the rope runs right into this square and must not cover it.
      zIndexOffset: 400,
    });
  }

  private ropeLine(a: LonLat, b: LonLat, selected: boolean): L.Polyline {
    return L.polyline([toLatLng(a), toLatLng(b)], {
      color: selected ? GLIDER_SELECTED : GLIDER_STROKE,
      weight: selected ? 3 : 2,
      opacity: 0.9,
      // The rope is grabbable too: it is the longest part of a winch launch, and asking the user to hit a
      // 6 px dot to select an 800 m object would be a joke.
      bubblingMouseEvents: false,
    });
  }

  private buildAerotow(a: AirportAerotow, selected: boolean): AerotowEntry {
    const tip = destination(a.position, AEROTOW_ROPE_M, a.heading);
    const rope = this.ropeLine(a.position, tip, selected).addTo(this.group);
    const mark = this.markerAt(a.position, selected).addTo(this.group);
    rope.on("click", () => this.cb.onSelect("aerotow", a.id));
    mark.on("click", () => this.cb.onSelect("aerotow", a.id));
    mark.on("mousedown", (e: L.LeafletMouseEvent) => this.grabAerotow(a.id, e));
    rope.on("mousedown", (e: L.LeafletMouseEvent) => this.grabAerotow(a.id, e));
    const entry: AerotowEntry = { kind: "aerotow", model: a, selected, mark, rope };
    if (selected) this.addAerotowHandle(entry);
    return entry;
  }

  private addAerotowHandle(e: AerotowEntry): void {
    const a = e.model;
    const at = destination(a.position, AEROTOW_ROPE_M + HANDLE_MARGIN_M, a.heading);
    const handle = L.circleMarker(toLatLng(at), {
      radius: 6,
      color: COLOR_HANDLE,
      weight: 2,
      fillColor: COLOR_HANDLE,
      fillOpacity: 1,
      className: "pct-rotate-handle",
      bubblingMouseEvents: false,
    }).addTo(this.group);
    handle.on("mousedown", (ev: L.LeafletMouseEvent) => this.grabAerotowHandle(a.id, ev));
    e.handle = handle;
  }

  private buildWinch(w: AirportWinch, selected: boolean): WinchEntry {
    const rope = this.ropeLine(w.position, w.winch, selected).addTo(this.group);
    const mark = this.markerAt(w.position, selected).addTo(this.group);
    const far = this.winchBoxAt(w.winch, selected).addTo(this.group);
    for (const shape of [rope, mark, far]) shape.on("click", () => this.cb.onSelect("winch", w.id));
    mark.on("mousedown", (e: L.LeafletMouseEvent) => this.grabWinch(w.id, "glider", e));
    far.on("mousedown", (e: L.LeafletMouseEvent) => this.grabWinch(w.id, "winch", e));
    // The rope moves the WHOLE launch. Without this it would have no mousedown at all, and pressing the
    // longest part of an 800 m object would pan the map — the exact failure the runway strip shipped with.
    rope.on("mousedown", (e: L.LeafletMouseEvent) => this.grabWinchBody(w.id, e));
    return { kind: "winch", model: w, selected, mark, far, rope };
  }

  private removeAerotow(id: string): void {
    const e = this.aerotows.get(id);
    if (e === undefined) return;
    this.group.removeLayer(e.mark);
    this.group.removeLayer(e.rope);
    if (e.handle) this.group.removeLayer(e.handle);
    this.aerotows.delete(id);
  }

  private removeWinch(id: string): void {
    const e = this.winches.get(id);
    if (e === undefined) return;
    for (const shape of [e.mark, e.far, e.rope]) this.group.removeLayer(shape);
    this.winches.delete(id);
  }

  private restyleAerotow(e: AerotowEntry): void {
    e.mark.setStyle({ fillColor: e.selected ? GLIDER_SELECTED : GLIDER_STROKE });
    e.rope.setStyle({ color: e.selected ? GLIDER_SELECTED : GLIDER_STROKE, weight: e.selected ? 3 : 2 });
    if (e.selected && e.handle === undefined) {
      this.addAerotowHandle(e);
      return;
    }
    if (!e.selected && e.handle !== undefined) {
      this.group.removeLayer(e.handle);
      e.handle = undefined;
    }
  }

  private restyleWinch(e: WinchEntry): void {
    const fill = e.selected ? GLIDER_SELECTED : GLIDER_STROKE;
    e.mark.setStyle({ fillColor: fill });
    e.far.setIcon(winchIcon(e.selected)); // a divIcon has no setStyle — the colour is in the html
    e.rope.setStyle({ color: fill, weight: e.selected ? 3 : 2 });
  }

  // ── drag ──

  private grabAerotow = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.aerotows.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const at = entry.model.position;
    this.drag = { kind: "aerotow", id, mode: "move", startAt: at, startMouse: e.latlng, at, moved: false };
  };

  private grabAerotowHandle = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.aerotows.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const { position, heading } = entry.model;
    this.drag = { kind: "aerotow", id, mode: "rotate", at: position, startHeading: heading, heading, moved: false };
    entry.handle
      ?.bindTooltip(`${Math.round(heading)}°`, {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "pct-rotate-tip",
      })
      .openTooltip();
  };

  private grabWinch = (id: string, which: WinchPoint, e: L.LeafletMouseEvent): void => {
    const entry = this.winches.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const at = which === "glider" ? entry.model.position : entry.model.winch;
    this.drag = { kind: "winch", id, which, startAt: at, startMouse: e.latlng, at, moved: false };
  };

  private previewAerotow(e: AerotowEntry, at: LonLat, heading: number): void {
    e.mark.setLatLng(toLatLng(at));
    e.rope.setLatLngs([toLatLng(at), toLatLng(destination(at, AEROTOW_ROPE_M, heading))]);
    e.handle?.setLatLng(toLatLng(destination(at, AEROTOW_ROPE_M + HANDLE_MARGIN_M, heading)));
  }

  private grabWinchBody = (id: string, e: L.LeafletMouseEvent): void => {
    const entry = this.winches.get(id);
    if (e.originalEvent.button !== 0 || entry === undefined) return;
    this.map.dragging.disable();
    const { position, winch } = entry.model;
    this.drag = {
      kind: "winch-body",
      id,
      startGlider: position,
      startWinch: winch,
      startMouse: e.latlng,
      glider: position,
      winch,
      moved: false,
    };
  };

  /** Redraw from the two points, whichever of them the drag is changing. */
  private previewWinchAt(e: WinchEntry, glider: LonLat, far: LonLat): void {
    e.mark.setLatLng(toLatLng(glider));
    e.far.setLatLng(toLatLng(far));
    e.rope.setLatLngs([toLatLng(glider), toLatLng(far)]);
  }

  private previewWinch(e: WinchEntry, which: WinchPoint, at: LonLat): void {
    this.previewWinchAt(
      e,
      which === "glider" ? at : e.model.position,
      which === "winch" ? at : e.model.winch,
    );
  }

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    const d = this.drag;
    if (d === null) return;
    d.moved = true;
    // Not hoisted above the branches: the aerotow ROTATE drag has no `startMouse` — it tracks a bearing
    // from a fixed anchor, not an offset — so there is no delta to compute for it.
    const delta = (from: L.LatLng): { dLon: number; dLat: number } => ({
      dLon: ev.latlng.lng - from.lng,
      dLat: ev.latlng.lat - from.lat,
    });
    if (d.kind === "winch") {
      const e = this.winches.get(d.id);
      if (e === undefined) return;
      const { dLon, dLat } = delta(d.startMouse);
      d.at = { lon: d.startAt.lon + dLon, lat: d.startAt.lat + dLat };
      this.previewWinch(e, d.which, d.at);
      return;
    }
    if (d.kind === "winch-body") {
      const e = this.winches.get(d.id);
      if (e === undefined) return;
      const { dLon, dLat } = delta(d.startMouse);
      d.glider = { lon: d.startGlider.lon + dLon, lat: d.startGlider.lat + dLat };
      d.winch = { lon: d.startWinch.lon + dLon, lat: d.startWinch.lat + dLat };
      this.previewWinchAt(e, d.glider, d.winch);
      return;
    }
    const e = this.aerotows.get(d.id);
    if (e === undefined) return;
    if (d.mode === "move") {
      d.at = {
        lon: d.startAt.lon + (ev.latlng.lng - d.startMouse.lng),
        lat: d.startAt.lat + (ev.latlng.lat - d.startMouse.lat),
      };
      this.previewAerotow(e, d.at, e.model.heading);
      return;
    }
    let heading = initialBearing(d.at, { lon: ev.latlng.lng, lat: ev.latlng.lat });
    if (ev.originalEvent.shiftKey) heading = snapAngle(heading, SNAP_DEG);
    d.heading = heading;
    this.previewAerotow(e, d.at, heading);
    e.handle?.setTooltipContent(`${Math.round(heading)}°`);
  };

  private onMouseUp = (): void => {
    const d = this.drag;
    if (d === null) return;
    this.drag = null;
    this.map.dragging.enable();

    if (d.kind === "winch" || d.kind === "winch-body") {
      const e = this.winches.get(d.id);
      if (!d.moved) {
        if (e !== undefined) this.previewWinchAt(e, e.model.position, e.model.winch);
        return;
      }
      if (d.kind === "winch") {
        this.cb.onMoveWinchPoint(d.id, d.which, { lon: wrapLon(d.at.lon), lat: d.at.lat });
        return;
      }
      this.cb.onMoveWinch(
        d.id,
        { lon: wrapLon(d.glider.lon), lat: d.glider.lat },
        { lon: wrapLon(d.winch.lon), lat: d.winch.lat },
      );
      return;
    }

    const e = this.aerotows.get(d.id);
    if (d.mode === "rotate") e?.handle?.unbindTooltip();
    if (!d.moved) {
      if (e !== undefined) this.previewAerotow(e, e.model.position, e.model.heading);
      return;
    }
    if (d.mode === "move") {
      this.cb.onMoveAerotow(d.id, { lon: wrapLon(d.at.lon), lat: d.at.lat });
      return;
    }
    if (d.heading !== d.startHeading) this.cb.onRotateAerotow(d.id, d.heading);
  };
}

/** The drum, drawn as a square (#278). Module-level and rebuilt on every restyle rather than mutated,
 *  which is what a divIcon costs and what AirportLayer's ⊕ already pays: the colour lives in the html,
 *  so changing it means a new icon. The casing is the same dark ring the glider dot wears, so the two
 *  ends of a launch stay legible over satellite imagery. */
function winchIcon(selected: boolean): L.DivIcon {
  const fill = selected ? GLIDER_SELECTED : GLIDER_STROKE;
  return L.divIcon({
    className: "pct-winch-glyph",
    html: `<span class="pct-winch-box" style="background:${fill};border-color:${GLIDER_CASING}"></span>`,
    iconSize: [WINCH_BOX_PX, WINCH_BOX_PX],
    iconAnchor: [WINCH_BOX_PX / 2, WINCH_BOX_PX / 2],
  });
}
