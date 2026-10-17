// visibility.ts — what the MAP leaves out. Hiding is a way of looking at the document, not an edit of it:
// it never reaches the project, never enters undo and never marks it dirty, and it affects no export.
//
// Two levels:
//   • a GROUP — every element of one kind (all tarmacs, all plants…), toggled from the map's Show menu;
//   • single ELEMENTS, by id — hidden from the placed list's Hide button. The airport's point and its
//     boundary have no id (one per airport), so for them the group is the element.
// An element is drawn only when neither its group nor its id is hidden. The placed list keeps every row,
// hidden or not, so a hidden element can always be found and shown again.
import type { PlacedObject, ProjectAirport } from "../../core/project/types";

export type VisGroup =
  | "objects"
  | "lights"
  | "plants"
  | "airport"
  | "boundary"
  | "runways"
  | "gliders"
  | "helipads"
  | "parkings"
  | "tarmacs"
  | "lines"
  | "groundtexts"
  | "taxisigns"
  | "jetways"
  | "carlots";

/** The Show menu, in two blocks: the POI's objects, then the airport in the catalog's order. */
export const VIS_GROUPS: readonly { group: VisGroup; label: string; airport: boolean }[] = [
  { group: "objects", label: "Objects", airport: false },
  { group: "lights", label: "Lights", airport: false },
  { group: "plants", label: "Plants", airport: false },
  { group: "airport", label: "Airport point", airport: true },
  { group: "boundary", label: "Boundary", airport: true },
  { group: "runways", label: "Runways", airport: true },
  { group: "gliders", label: "Aerotows & winches", airport: true },
  { group: "helipads", label: "Helipads", airport: true },
  { group: "parkings", label: "Parkings", airport: true },
  { group: "tarmacs", label: "Tarmacs", airport: true },
  { group: "lines", label: "Lines", airport: true },
  { group: "groundtexts", label: "Ground texts", airport: true },
  { group: "taxisigns", label: "Taxi signs", airport: true },
  { group: "jetways", label: "Jetways", airport: true },
  { group: "carlots", label: "Car lots", airport: true },
];

/** The group a placed object belongs to. Airport lights are lights. */
export function objectGroup(o: PlacedObject): VisGroup {
  if (o.kind === "xref") return "objects";
  if (o.kind === "plant") return "plants";
  return "lights";
}

export interface Visibility {
  hiddenGroups: ReadonlySet<VisGroup>;
  hiddenIds: ReadonlySet<string>;
}

/** The items of one group that the map draws. */
export function visibleOf<T extends { id: string }>(
  v: Visibility,
  group: VisGroup,
  items: readonly T[] | undefined,
): T[] {
  if (items === undefined || v.hiddenGroups.has(group)) return [];
  // Nothing hidden: the document's own array, so a layer sees the same list it always did.
  return v.hiddenIds.size === 0 ? (items as T[]) : items.filter((i) => !v.hiddenIds.has(i.id));
}

/** How many elements of the document the map leaves out — what the Show button reports. */
export function hiddenCount(v: Visibility, objects: readonly PlacedObject[], airport: ProjectAirport | undefined): number {
  const n = (group: VisGroup, items: readonly { id: string }[] | undefined): number => {
    if (items === undefined) return 0;
    if (v.hiddenGroups.has(group)) return items.length;
    return items.filter((i) => v.hiddenIds.has(i.id)).length;
  };
  const objs = objects.filter((o) => v.hiddenGroups.has(objectGroup(o)) || v.hiddenIds.has(o.id)).length;
  if (airport === undefined) return objs;
  return (
    objs +
    (v.hiddenGroups.has("airport") && airport.position !== undefined ? 1 : 0) +
    (v.hiddenGroups.has("boundary") && airport.boundary !== undefined ? 1 : 0) +
    n("runways", airport.runways) +
    n("gliders", airport.aerotows) +
    n("gliders", airport.winches) +
    n("helipads", airport.pads) +
    n("parkings", airport.parkings) +
    n("tarmacs", airport.tarmacs) +
    n("lines", airport.lines) +
    n("groundtexts", airport.groundtexts) +
    n("taxisigns", airport.taxisigns) +
    n("jetways", airport.jetways) +
    n("carlots", airport.carlots)
  );
}
