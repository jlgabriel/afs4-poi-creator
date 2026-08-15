// AirportLayer.ts — the AIRPORT's own point on the map: one draggable ⊕, and nothing else.
//
// WHY IT EXISTS (forum #255, ApfelFlieger). "It is very important that Airport has its own coordinates.
// The coordinates of the airport must be possible for the user both by clicking on the map and by
// entering the two fields LON and LAT." Through v1.4 the airport had a `position` field that nothing
// could set and nothing drew, so in practice it followed the first helipad — and his third reason is
// exactly that this must stop: "the airfield coordinates must not change if any other element changes
// coordinates." A point you cannot see is a point you cannot trust to stay put.
//
// ★ THE GLYPH IS HIS. "each airfield also needs a corresponding symbol on the map. A plus sign that has a
// circle around its center is common." He attached it. It is the aeronautical convention, so it needs no
// legend — which is the entire argument for using it rather than inventing another coloured dot.
//
// ★ WHY A MARKER AND NOT A PATH, unlike every other layer here. A stand, a pad and a runway have a real
// SIZE in metres, so they are drawn in world units and grow as you zoom in. An airport's point has no
// size — it is a map symbol, and a symbol that doubles every zoom step stops being one. HelipadLayer
// already reaches for L.marker + L.divIcon for exactly this reason (its H), so this follows that
// precedent rather than setting a new one, and it gets Leaflet's own drag handling with it: one dragend
// per gesture is the same "one commit on release" contract the hand-rolled drags keep.
//
// ★ WHITE, AND TOLD APART BY SHAPE. Every colour on this map is spoken for — blue footprints, white pads,
// green plants, violet stands, amber selection, red missing, cyan grips — and the one after this (his
// ruler, #264) will want a free one too. So this does not spend one: ⊕ cannot be mistaken for the pad's
// H-in-a-ring at any size, which is the same "distinguish by shape, never by colour" call he makes
// himself in #264. Selected turns amber, because that is what selected looks like everywhere in PCT.
import * as L from "leaflet";
import type { LonLat } from "../../core/project/types";
import { wrapLon } from "../../core/geo/geo";

export interface AirportPointCallbacks {
  /** Fired once, on drag END — the same contract every other layer keeps. */
  onMove(p: LonLat): void;
  /** A click that was not a drag: the airport becomes the Inspector's subject. */
  onSelect(): void;
}

const BOX = 28; // px, the icon's box — a symbol, so it does not scale with zoom
const STROKE = "#ffffff";
const STROKE_SELECTED = "#f59e0b"; // FootprintLayer's COLOR_SELECTED, so selection reads the same
const CASING = "#0f172a"; // the dark under-stroke every layer here uses to stay legible on satellite

/** The ⊕, drawn twice: a heavy dark casing first, the bright glyph over it. Same trick as the stand's
 *  two concentric circles — a thin white line alone disappears over concrete and snow. */
function glyphHtml(selected: boolean): string {
  const color = selected ? STROKE_SELECTED : STROKE;
  const d = "M14 2v24M2 14h24";
  return (
    `<svg viewBox="0 0 28 28" width="${BOX}" height="${BOX}" fill="none" aria-hidden="true">` +
    `<circle cx="14" cy="14" r="7.5" stroke="${CASING}" stroke-width="5"/>` +
    `<path d="${d}" stroke="${CASING}" stroke-width="5" stroke-linecap="round"/>` +
    `<circle cx="14" cy="14" r="7.5" stroke="${color}" stroke-width="2"/>` +
    `<path d="${d}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` +
    `</svg>`
  );
}

const toLatLng = (p: LonLat): L.LatLngExpression => [p.lat, p.lon];

export class AirportLayer {
  private readonly group: L.LayerGroup;
  private marker: L.Marker | null = null;
  /** What the marker was BUILT from — the reference-diff the other layers use, in its simplest form:
   *  one point and one flag, so an unrelated repaint never rebuilds the icon under the cursor. */
  private at: LonLat | null = null;
  private selected = false;
  private dragging = false;

  constructor(
    private readonly map: L.Map,
    private readonly cb: AirportPointCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
  }

  destroy(): void {
    this.marker = null;
    this.at = null;
    this.group.remove();
  }

  /** Reconcile with the document. `position` is null for an airport that has no point yet — an
   *  identity-only block, which is legal and is his "(1) DATA" example — and for a project with no
   *  airport at all. */
  sync(position: LonLat | null, selected: boolean): void {
    if (position === null) {
      if (this.marker !== null) {
        this.group.removeLayer(this.marker);
        this.marker = null;
        this.at = null;
      }
      return;
    }
    if (this.marker === null) {
      this.marker = this.build(position, selected);
      this.at = position;
      this.selected = selected;
      return;
    }
    // Mid-drag the marker holds a preview the store has not been told about; rebuilding from the stored
    // value would snap it back under the cursor on any unrelated repaint.
    if (this.dragging) return;
    if (this.selected !== selected) {
      this.selected = selected;
      this.marker.setIcon(icon(selected));
    }
    if (this.at === null || this.at.lon !== position.lon || this.at.lat !== position.lat) {
      this.at = position;
      this.marker.setLatLng(toLatLng(position));
    }
  }

  private build(position: LonLat, selected: boolean): L.Marker {
    const marker = L.marker(toLatLng(position), {
      icon: icon(selected),
      draggable: true,
      // Above the pads and stands: it is one symbol on top of whatever the airport is made of, and it is
      // the smallest click target on the map.
      zIndexOffset: 1000,
      keyboard: false,
    }).addTo(this.group);
    marker.on("click", () => this.cb.onSelect());
    marker.on("dragstart", () => {
      this.dragging = true;
    });
    marker.on("dragend", () => {
      this.dragging = false;
      const ll = marker.getLatLng();
      // Wrap only at COMMIT: dragging across the antimeridian stays visually continuous while the value
      // handed to the store is normalised into the range the loader accepts.
      const at = { lon: wrapLon(ll.lng), lat: ll.lat };
      this.at = at;
      this.cb.onMove(at);
    });
    return marker;
  }
}

function icon(selected: boolean): L.DivIcon {
  return L.divIcon({
    html: glyphHtml(selected),
    className: "pct-airport-glyph",
    iconSize: [BOX, BOX],
    iconAnchor: [BOX / 2, BOX / 2],
  });
}
