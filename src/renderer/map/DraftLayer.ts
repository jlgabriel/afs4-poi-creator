// DraftLayer.ts — the shape being DRAWN (a boundary, a tarmac or a line): the points clicked so far and a
// dashed band to the cursor. Each map click adds a point (the store's placeAt) and a double click finishes
// (finishShape); this layer only draws — every click while drawing belongs to the map, so nothing here
// takes the mouse.
import * as L from "leaflet";
import type { LonLat } from "../../core/project/types";

const COLOR = "#f59e0b";
const VERTEX_FILL = "#ffffff";
const CASING = "#0f172a";
const NONE: LonLat[] = [];

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

export class DraftLayer {
  private readonly group: L.LayerGroup;
  private draft: LonLat[] = NONE;
  private closed = false;
  private line: L.Polyline | null = null;
  private band: L.Polyline | null = null;
  private dots: L.CircleMarker[] = [];
  private cursor: L.LatLng | null = null;

  constructor(
    private readonly map: L.Map,
    private readonly pane: string,
  ) {
    this.group = L.layerGroup().addTo(map);
    this.map.on("mousemove", this.onMouseMove);
  }

  destroy(): void {
    this.map.off("mousemove", this.onMouseMove);
    this.group.remove();
  }

  /** The points drawn so far, or null when nothing is being drawn. `closed`: the band also runs back to
   *  the first point, showing the ring as it would close. */
  sync(points: LonLat[] | null, closed: boolean): void {
    const next = points ?? NONE;
    if (next === this.draft && closed === this.closed) return;
    this.draft = next;
    this.closed = closed;
    this.redraw();
  }

  private redraw(): void {
    for (const l of [this.line, this.band, ...this.dots]) if (l) this.group.removeLayer(l);
    this.line = null;
    this.band = null;
    this.dots = [];
    if (this.draft.length === 0) return;
    this.line = L.polyline(this.draft.map(toLatLng), {
      pane: this.pane,
      color: COLOR,
      weight: 2,
      interactive: false,
    }).addTo(this.group);
    this.dots = this.draft.map((p) =>
      L.circleMarker(toLatLng(p), {
        pane: this.pane,
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

  private onMouseMove = (ev: L.LeafletMouseEvent): void => {
    this.cursor = ev.latlng;
    if (this.draft.length > 0) this.drawBand();
  };

  /** The dashed line from the last point to the cursor (and on back to the first, for a ring): the shape
   *  as it would be if the next click were the double click. */
  private drawBand(): void {
    const c = this.cursor;
    if (c === null || this.draft.length === 0) return;
    const latlngs: L.LatLngExpression[] = [toLatLng(this.draft[this.draft.length - 1]!), c];
    if (this.closed && this.draft.length >= 2) latlngs.push(toLatLng(this.draft[0]!));
    if (this.band === null) {
      this.band = L.polyline(latlngs, {
        pane: this.pane,
        color: COLOR,
        weight: 1.5,
        dashArray: "4 4",
        interactive: false,
      }).addTo(this.group);
    } else {
      this.band.setLatLngs(latlngs);
    }
  }
}
