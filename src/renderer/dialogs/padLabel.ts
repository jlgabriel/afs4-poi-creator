// padLabel.ts — how a placed object is named back to the user in the Create-heliport dialog, for the one
// button that offers to copy its position and heading onto the pad ("Move the pad onto …"). A COPY: the
// pad is its own point and is never bound to an object.
import type { PlacedObject } from "../../core/project/types";

export function padLabel(o: PlacedObject): string {
  switch (o.kind) {
    case "xref":
      return o.name;
    case "plant":
      return `${o.group} ${o.species}`;
    case "airport_light":
      return o.typeName;
    default:
      return "point light";
  }
}
