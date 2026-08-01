// padLabel.ts — how the helipad's source object is named back to the user. Shared by the Export dialog's
// template section and the Create-heliport dialog, so the two never disagree about which object is meant.
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
