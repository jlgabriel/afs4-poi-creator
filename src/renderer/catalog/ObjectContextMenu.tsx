// ObjectContextMenu.tsx — the right-click menu on a catalog card (v0.7). It turns "I photographed this
// object in the sim" into "this object now shows that photo", named right by construction: the card already
// knows the object's exact catalog name, so Paste writes `<name>.png` with zero typing (main/ipc.ts
// saveObjectPhoto reads the clipboard itself — the renderer only NAMES the object; P0-2).
//
// The three actions map 1:1 to the PctApi write side: Paste photo (clipboard → file), Remove photo (delete
// every extension of the stem, behind a confirm), Open photos folder. The two EXPECTED snags surface INLINE
// — the menu stays open showing the reason — because each has a fix the user acts on next: no folder yet
// (→ Open Settings) and an empty clipboard (→ go capture one). Any other failure shows its message verbatim.
//
// Portalled to <body> (position:fixed) so the panel's overflow:hidden can't clip it, and it closes on the
// usual triggers: Escape, a pointerdown anywhere outside, a scroll, or a completed action.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogObject } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { refreshThumbnails } from "../app/useThumbnailSync";
import { computeContextMenuPosition, type Pos } from "./contextMenuPosition";

interface InlineError {
  text: string;
  settings?: boolean; // show an "Open Settings" affordance (the no-photos-dir case)
}

export function ObjectContextMenu({
  object,
  x,
  y,
  onClose,
}: {
  object: CatalogObject;
  x: number;
  y: number;
  onClose: () => void;
}): React.ReactElement {
  const key = object.name.toLowerCase();
  const hasPhoto = useEditor((s) => s.thumbnailNames.has(key));
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState<InlineError | null>(null);
  const [busy, setBusy] = useState(false);

  // Measure, then place (the menu's size depends on whether Remove is shown and whether an error line is
  // visible). useLayoutEffect runs before paint so there's no visible jump; until measured it's hidden.
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
  }, [x, y, error, hasPhoto]);

  // Close on Escape or any outside interaction. Capture-phase pointerdown so a click on the card/map
  // underneath closes the menu FIRST (it doesn't also arm placement on that same click). Scrolling closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onWheel = (): void => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("wheel", onWheel);
    };
  }, [onClose]);

  const paste = async (): Promise<void> => {
    const pct = getPct();
    if (pct === null || busy) return;
    setBusy(true);
    setError(null);
    const r = await pct.saveObjectPhoto(object.name);
    setBusy(false);
    if (r.ok) {
      editorStore.getState().invalidateThumbnail(object.name); // the card shows the new photo at once
      onClose();
      return;
    }
    if (r.error.code === "no-photos-dir") {
      setError({ text: "Choose your photos folder in Settings to save the capture.", settings: true });
    } else if (r.error.code === "clipboard-empty") {
      setError({ text: "No image on the clipboard. Capture one with Win+Shift+S and try again." });
    } else {
      setError({ text: r.error.message });
    }
  };

  const remove = async (): Promise<void> => {
    const pct = getPct();
    if (pct === null || busy) return;
    // Deleting the user's own file is deliberate and only undone by pasting again — confirm first.
    if (!window.confirm(`Remove the photo for "${object.displayName}"?`)) return;
    setBusy(true);
    setError(null);
    const r = await pct.deleteObjectPhoto(object.name);
    setBusy(false);
    if (r.ok) {
      refreshThumbnails(); // the name leaves the set → the card falls back to its generated glyph
      onClose();
      return;
    }
    setError({ text: r.error.message });
  };

  const openFolder = (): void => {
    void getPct()?.openPhotosDir();
    onClose();
  };

  const openSettings = (): void => {
    window.dispatchEvent(new CustomEvent("pct:open-settings")); // AppShell listens and opens the dialog
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className="pct-context-menu"
      role="menu"
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos === null ? "hidden" : "visible" }}
    >
      <div className="pct-context-menu-name">{object.name}</div>
      <button type="button" role="menuitem" disabled={busy} onClick={paste}>
        Paste photo from clipboard
      </button>
      {hasPhoto && (
        <button type="button" role="menuitem" disabled={busy} onClick={remove}>
          Remove photo
        </button>
      )}
      <button type="button" role="menuitem" disabled={busy} onClick={openFolder}>
        Open photos folder
      </button>
      {error !== null && (
        <div className="pct-context-menu-error">
          <span>{error.text}</span>
          {error.settings === true && (
            <button type="button" className="pct-context-menu-link" onClick={openSettings}>
              Open Settings
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
