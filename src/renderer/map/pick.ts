// pick.ts — how a drawn element is picked: a click selects it, a right-click selects it and opens the
// element menu (placed/ElementContextMenu.tsx), which is where Delete lives for the mouse. One helper, so
// every layer's shapes answer the right button the same way.
import type * as L from "leaflet";
import { openElementMenu } from "../state/elementMenu";

/** Right-click on `layer`: `select`, then open the element menu at the cursor. */
export function onMenu(layer: L.Layer, select: () => void): void {
  layer.on("contextmenu", (e) => {
    const ev = (e as L.LeafletMouseEvent).originalEvent;
    ev.preventDefault();
    select();
    openElementMenu(ev.clientX, ev.clientY);
  });
}

/** Click selects; right-click selects and opens the element menu. */
export function onPick(layer: L.Layer, select: () => void): void {
  layer.on("click", select);
  onMenu(layer, select);
}
