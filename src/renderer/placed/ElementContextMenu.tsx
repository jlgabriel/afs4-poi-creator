// ElementContextMenu.tsx — the right-click menu of a placed element, on the map or in the placed list.
//
// ★ THIS IS WHERE THE MOUSE DELETES. There is no Delete button: a button beside Hide and Duplicate is one
// slip away from a deletion nobody meant. The Del key stays, and with the mouse it takes a right-click
// and then a choice, which cannot happen by accident.
//
// The right-click selects first (map/pick.ts, PlacedList), so the menu acts on the SELECTION, through
// the same deleteSelection the Del key uses. The airport itself still asks twice: its first choice arms
// the delete and the menu stays open with the question; the second goes through.
//
// Portalled to <body> (position:fixed), placed like the catalog's menu, and closed by Escape, a pointerdown
// outside, a scroll or a completed action.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editorStore, useEditor } from "../state/editorStore";
import { closeElementMenu, useElementMenu } from "../state/elementMenu";
import { computeContextMenuPosition, type Pos } from "../catalog/contextMenuPosition";

export function ElementContextMenu(): React.ReactElement | null {
  const at = useElementMenu((s) => s.at);
  return at === null ? null : <Menu x={at.x} y={at.y} />;
}

function Menu({ x, y }: { x: number; y: number }): React.ReactElement {
  const count = useEditor((s) => s.selection.length);
  const airportSel = useEditor((s) => s.airportSelection);
  const pending = useEditor((s) => s.pendingAirportDelete);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setPos(
      computeContextMenuPosition(
        x,
        y,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [x, y, pending]);

  useEffect(() => {
    // Leaving the menu with the airport's delete armed disarms it: the question belongs to the menu.
    const close = (): void => {
      const s = editorStore.getState();
      if (s.pendingAirportDelete && s.airportSelection?.kind === "data") s.selectAirportPart({ kind: "data" });
      closeElementMenu();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onWheel = (): void => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  const isAirport = airportSel?.kind === "data";
  const nothing = count === 0 && airportSel === null;
  const label = isAirport
    ? pending
      ? "Really delete the airport and everything in it?"
      : "Delete airport…"
    : count > 1
      ? `Delete ${count} objects`
      : "Delete";

  const remove = (): void => {
    editorStore.getState().deleteSelection();
    // The airport's first choice only arms the delete: stay open so the second can answer it.
    if (!editorStore.getState().pendingAirportDelete) closeElementMenu();
  };

  return createPortal(
    <div
      ref={ref}
      className="pct-context-menu"
      role="menu"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos === null ? "hidden" : "visible" }}
    >
      <button
        type="button"
        role="menuitem"
        className={isAirport && pending ? "pct-context-menu-danger" : undefined}
        disabled={nothing}
        title="Same as the Delete key. Ctrl+Z brings it back"
        onClick={remove}
      >
        {label}
      </button>
    </div>,
    document.body,
  );
}
