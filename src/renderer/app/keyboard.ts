// keyboard.ts — pure helpers behind the global shortcuts hook. Kept React/DOM-global free (duck-typed,
// no `instanceof HTMLElement`) so they unit-test under the node config.

/** True when focus is in a text-entry control — the P1-4 focus guard: global keys (Del, Ctrl+D/Z/Y,
 *  arrows, R) must NOT fire while the user is typing in an inspector number field / the search box. */
export function isEditableTarget(el: EventTarget | null): boolean {
  const node = el as { tagName?: string; isContentEditable?: boolean } | null;
  if (!node || typeof node.tagName !== "string") return false;
  const tag = node.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true;
}

/** Does Delete/Backspace have anything to act on? It has to ask about BOTH selections, because they are
 *  mutually exclusive: selecting an airport part empties `selection` and fills `airportSelection`
 *  (store.ts, selectAirportPart). Asking only about `selection` is exactly what left the key dead on
 *  every airport element in v1.4.0 — "the DELETE key still works on the objects, but not on the elements
 *  from the airfield" (forum #253, refined in #258) — while the Delete BUTTON, which asks about both,
 *  went on working. Named rather than inlined in the hook so the regression has a test of its own.
 *
 *  `object | null` rather than the store's AirportSelection: this file stays import-free on purpose, and
 *  the only thing the guard needs to know is whether there is one. */
export function hasDeletable(selection: readonly string[], airportSelection: object | null): boolean {
  return selection.length > 0 || airportSelection !== null;
}

export interface NudgeVec {
  deltaM: number;
  bearingDeg: number; // compass, clockwise, 0 = North (matches PlacedXref.direction + geo.destination)
}

export type LifecycleAction = "save" | "save-as" | "open" | "new";

/** Map a Ctrl/Cmd chord to a project-lifecycle action (design §5): Ctrl+S save, Ctrl+Shift+S Save As,
 *  Ctrl+O open, Ctrl+N new. Null for anything else. Unlike the edit shortcuts these fire regardless of
 *  input focus (you save mid-edit), so the hook resolves them BEFORE the focus guard. */
export function lifecycleShortcut(key: string, mod: boolean, shift: boolean): LifecycleAction | null {
  if (!mod) return null;
  switch (key.toLowerCase()) {
    case "s":
      return shift ? "save-as" : "save";
    case "o":
      return "open";
    case "n":
      return "new";
    default:
      return null;
  }
}

/** Map an arrow key to a metre nudge along a compass bearing (Shift = the 5 m big step). Null for any
 *  non-arrow key. Up = North, Down = South, Right = East, Left = West. */
export function arrowToVector(key: string, shift: boolean): NudgeVec | null {
  const deltaM = shift ? 5 : 0.5;
  switch (key) {
    case "ArrowUp":
      return { deltaM, bearingDeg: 0 };
    case "ArrowDown":
      return { deltaM, bearingDeg: 180 };
    case "ArrowRight":
      return { deltaM, bearingDeg: 90 };
    case "ArrowLeft":
      return { deltaM, bearingDeg: 270 };
    default:
      return null;
  }
}
