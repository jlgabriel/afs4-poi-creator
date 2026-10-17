// ShowMenu.tsx — the top bar's Show menu: one checkbox per kind of element, to leave whole groups off the
// map, and Show all to bring back everything, single elements hidden from the placed list included.
// Hiding changes only what the map draws (state/visibility.ts): the document, undo and every export are
// untouched. The button says how many elements are hidden, so a map that looks emptier than it should
// always has its explanation in sight.
import { useEffect, useRef, useState } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { VIS_GROUPS, hiddenCount } from "../state/visibility";

export function ShowMenu(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hiddenGroups = useEditor((s) => s.hiddenGroups);
  const hiddenIds = useEditor((s) => s.hiddenIds);
  const objects = useEditor((s) => s.project.objects);
  const airport = useEditor((s) => s.project.airport);
  const hidden = hiddenCount({ hiddenGroups, hiddenIds }, objects, airport);

  // Closes on a click anywhere else and on Escape, like a menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (box.current !== null && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const store = editorStore.getState;
  const row = (group: (typeof VIS_GROUPS)[number]): React.ReactElement => (
    <label key={group.group} className="pct-check">
      <input
        type="checkbox"
        checked={!hiddenGroups.has(group.group)}
        onChange={(e) => store().setGroupHidden(group.group, !e.target.checked)}
      />
      {group.label}
    </label>
  );

  return (
    <div className="pct-showmenu" ref={box}>
      <button
        type="button"
        className={hidden > 0 ? "pct-showmenu-btn on" : "pct-showmenu-btn"}
        aria-expanded={open}
        title="Choose what the map shows. Hiding changes nothing in the project or the exports"
        onClick={() => setOpen(!open)}
      >
        Show{hidden > 0 ? ` · ${hidden} hidden` : ""} ▾
      </button>
      {open && (
        <div className="pct-showmenu-panel" role="dialog" aria-label="What the map shows">
          <div className="pct-showmenu-head">Objects</div>
          <div className="pct-check-grid">{VIS_GROUPS.filter((g) => !g.airport).map(row)}</div>
          <div className="pct-showmenu-head">Airport</div>
          <div className="pct-check-grid">{VIS_GROUPS.filter((g) => g.airport).map(row)}</div>
          <p className="pct-field-meta">
            To hide one element, select it and click <strong>Hide</strong> above the placed list.
          </p>
          <button type="button" disabled={hidden === 0} onClick={() => store().showAll()}>
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
