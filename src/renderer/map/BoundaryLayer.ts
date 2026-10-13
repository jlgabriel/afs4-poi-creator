// BoundaryLayer.ts — the airport's BOUNDARY on the map: the closed polygon around the whole field. The
// gestures are PolyShape's (drag a white point, drag a grey one to add a point, right-click to remove,
// drag inside to move it all); the ring being drawn is DraftLayer's.
//
// ★★ UNSELECTED, ONLY THE OUTLINE ANSWERS (selectByBody false). A boundary covers the whole airport —
// everything else is placed INSIDE it. A fill that took the mouse would turn every pan inside the field
// into a boundary drag and swallow every click meant for something there.
//
// Colour: yellow and dashed — the one line on this map that is not a thing in the sim but the edge of the
// airport — turning amber and solid when selected, like everything else.
import * as L from "leaflet";
import type { LonLat } from "../../core/project/types";
import { PolyShape } from "./PolyShape";

export interface BoundaryCallbacks {
  /** The ring after one finished gesture — one commit, so one undo entry. Always at least three points. */
  onChange(points: LonLat[]): void;
  /** A click on the outline or inside the selected ring. */
  onSelect(): void;
}

const LINE = "#fde047";
const SELECTED = "#f59e0b";

export class BoundaryLayer {
  private readonly group: L.LayerGroup;
  private readonly shape: PolyShape;

  constructor(map: L.Map, panes: { shape: string; handles: string }, cb: BoundaryCallbacks) {
    this.group = L.layerGroup().addTo(map);
    this.shape = new PolyShape(
      map,
      this.group,
      {
        closed: true,
        minPoints: 3,
        selectByBody: false,
        pane: panes.shape,
        handlePane: panes.handles,
        className: "pct-boundary",
        style: (selected) => ({
          color: selected ? SELECTED : LINE,
          weight: selected ? 3 : 2,
          dashArray: selected ? undefined : "8 6",
          fillColor: selected ? SELECTED : LINE,
          fillOpacity: selected ? 0.08 : 0.03,
        }),
      },
      cb,
    );
  }

  destroy(): void {
    this.shape.destroy();
    this.group.remove();
  }

  /** `editable` = nothing armed: only then does anything here take the mouse. */
  sync(ring: LonLat[] | null, selected: boolean, editable: boolean): void {
    this.shape.sync(ring, selected, editable);
  }
}
