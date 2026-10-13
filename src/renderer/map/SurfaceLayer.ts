// SurfaceLayer.ts — the airport's TARMAC polygons and painted LINEs on the map: any number of each, one
// PolyShape per element (the gestures live there). One class for both, configured as a ring layer or a
// line layer.
//
// Unselected, a click on the body selects (selectByBody): a tarmac is an apron-sized patch, not the whole
// field, and a click inside it reading as "this one" is what the user expects. The map still pans from a
// press on it — nothing grabs the mouse until the element is selected.
//
// The colours are a HINT of the material, not a picture of it: green ground, grey apron, dark runway,
// a dashed outline for the invisible flatten; and a line in its paint colour, dashed when its name is.
import * as L from "leaflet";
import type { AirportLine, AirportTarmac, LonLat } from "../../core/project/types";
import { tarmacMaterial } from "../../core/project/surfaces";
import { PolyShape } from "./PolyShape";

export interface SurfaceCallbacks {
  onChange(id: string, points: LonLat[]): void;
  onSelect(id: string): void;
}

const SELECTED = "#f59e0b";

/** The look of one tarmac, from its material's group. */
function tarmacStyle(material: string, selected: boolean): L.PathOptions {
  const group = tarmacMaterial(material)?.group;
  const blue = material.includes("typeblue");
  const [stroke, fill, opacity, dash] =
    material === "hole"
      ? ["#f87171", "#f87171", 0.1, "4 4"]
      : group === "flatten"
        ? ["#e2e8f0", "#e2e8f0", 0.05, "2 5"]
        : group === "ground"
          ? ["#4ade80", "#22c55e", 0.25, undefined]
          : group === "apron"
            ? ["#e2e8f0", blue ? "#64748b" : "#94a3b8", 0.45, undefined]
            : material === "grass01"
              ? ["#a3e635", "#65a30d", 0.4, undefined]
              : group === "runway"
                ? ["#cbd5e1", blue ? "#334155" : "#475569", 0.55, undefined]
                : ["#e2e8f0", "#94a3b8", 0.35, "6 4"]; // a name PCT does not list
  return {
    color: selected ? SELECTED : stroke,
    weight: selected ? 3 : 1.5,
    dashArray: dash,
    fillColor: fill,
    fillOpacity: selected ? Math.min(0.7, opacity + 0.1) : opacity,
  };
}

/** The look of one line, from its name: blue, orange, white and the red safety lines in their colour,
 *  everything else yellow; dashed when the name says so. */
function lineStyle(name: string, selected: boolean): L.PathOptions {
  const color = name.includes("blue")
    ? "#3b82f6"
    : name.includes("orange")
      ? "#f97316"
      : name.includes("white")
        ? "#f8fafc"
        : name.startsWith("stand_safety_line")
          ? "#dc2626"
          : "#facc15";
  return {
    color: selected ? SELECTED : color,
    weight: selected ? 4 : 3,
    dashArray: name.includes("dashed") ? "6 5" : undefined,
    lineCap: "butt",
  };
}

interface Element {
  id: string;
  points: LonLat[];
}

interface ShapeKind<T> {
  closed: boolean;
  minPoints: number;
  className: string;
  style(item: T, selected: boolean): L.PathOptions;
  /** What the style depends on: when it changes, the shape is restyled. */
  styleKey(item: T): string;
}

/** A keyed list of PolyShapes, reconciled with the document by id. */
class ShapeList<T extends Element> {
  private readonly group: L.LayerGroup;
  /** Each shape with the element it last drew — its style reads the element from here. */
  private readonly entries = new Map<string, { shape: PolyShape; item: T }>();

  constructor(
    private readonly map: L.Map,
    private readonly kind: ShapeKind<T>,
    private readonly panes: { shape: string; handles: string },
    private readonly cb: SurfaceCallbacks,
  ) {
    this.group = L.layerGroup().addTo(map);
  }

  destroy(): void {
    for (const e of this.entries.values()) e.shape.destroy();
    this.entries.clear();
    this.group.remove();
  }

  sync(items: readonly T[], selectedId: string | null, editable: boolean): void {
    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.id);
      let entry = this.entries.get(item.id);
      if (entry === undefined) entry = this.create(item);
      entry.item = item;
      entry.shape.sync(item.points, item.id === selectedId, editable, this.kind.styleKey(item));
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      e.shape.destroy();
      this.entries.delete(id);
    }
  }

  private create(item: T): { shape: PolyShape; item: T } {
    const id = item.id;
    const { closed, minPoints, className } = this.kind;
    const entry = { item } as { shape: PolyShape; item: T };
    entry.shape = new PolyShape(
      this.map,
      this.group,
      {
        closed,
        minPoints,
        className,
        selectByBody: true,
        pane: this.panes.shape,
        handlePane: this.panes.handles,
        style: (selected) => this.kind.style(entry.item, selected),
      },
      { onChange: (p) => this.cb.onChange(id, p), onSelect: () => this.cb.onSelect(id) },
    );
    this.entries.set(id, entry);
    return entry;
  }
}

export class TarmacLayer {
  private readonly list: ShapeList<AirportTarmac>;
  constructor(map: L.Map, panes: { shape: string; handles: string }, cb: SurfaceCallbacks) {
    this.list = new ShapeList<AirportTarmac>(
      map,
      {
        closed: true,
        minPoints: 3,
        className: "pct-tarmac",
        style: (t, selected) => tarmacStyle(t.material, selected),
        styleKey: (t) => t.material,
      },
      panes,
      cb,
    );
  }
  destroy(): void {
    this.list.destroy();
  }
  sync(tarmacs: readonly AirportTarmac[], selectedId: string | null, editable: boolean): void {
    this.list.sync(tarmacs, selectedId, editable);
  }
}

export class LineLayer {
  private readonly list: ShapeList<AirportLine>;
  constructor(map: L.Map, panes: { shape: string; handles: string }, cb: SurfaceCallbacks) {
    this.list = new ShapeList<AirportLine>(
      map,
      {
        closed: false,
        minPoints: 2,
        className: "pct-line",
        style: (l, selected) => lineStyle(l.name, selected),
        styleKey: (l) => l.name,
      },
      panes,
      cb,
    );
  }
  destroy(): void {
    this.list.destroy();
  }
  sync(lines: readonly AirportLine[], selectedId: string | null, editable: boolean): void {
    this.list.sync(lines, selectedId, editable);
  }
}
