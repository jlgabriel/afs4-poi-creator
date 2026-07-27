// ObjectContextMenu.tsx — the right-click menu on a catalog card (v0.7). It turns "I photographed this
// object in the sim" into "this object now shows that photo", named right by construction: the card already
// knows the object's exact photo key, so Paste writes `<key>.png` with zero typing (main/ipc.ts
// saveObjectPhoto reads the clipboard itself — the renderer only NAMES the object; P0-2).
//
// v0.8: the key comes from core/catalog/photoKey rather than being an XREF's `name`, so this same menu
// now serves the Lights and Plants cards. main/ipc.ts is untouched — it always took an opaque, guarded
// name string, and a namespaced key is just another one.
//
// v0.9 adds a second, separated group: the object's FOOTPRINT. It belongs on this menu for the same reason
// the photo does — the card knows which object it names, so neither action needs the user to type an id —
// and it is the answer to forum #126/#129: an airport light has no `.tmi` and therefore no size, so it
// draws as a bare point until somebody measures it. The editing itself lives in FootprintDialog; this menu
// only routes to it (the panel owns the dialog, since every menu action closes the menu).
//
// The three photo actions map 1:1 to the PctApi write side: Paste photo (clipboard → file), Remove photo
// (delete every extension of the stem, behind a confirm), Open photos folder. The two EXPECTED snags surface INLINE
// — the menu stays open showing the reason — because each has a fix the user acts on next: no folder yet
// (→ Open Settings) and an empty clipboard (→ go capture one). Any other failure shows its message verbatim.
//
// Portalled to <body> (position:fixed) so the panel's overflow:hidden can't clip it, and it closes on the
// usual triggers: Escape, a pointerdown anywhere outside, a scroll, or a completed action.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CardPhoto } from "./cardPhoto";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { refreshThumbnails } from "../app/useThumbnailSync";
import { computeContextMenuPosition, type Pos } from "./contextMenuPosition";

interface InlineError {
  text: string;
  settings?: boolean; // show an "Open Settings" affordance (the no-photos-dir case)
}

export function ObjectContextMenu({
  card,
  x,
  y,
  onClose,
  onEditFootprint,
}: {
  card: CardPhoto;
  x: number;
  y: number;
  onClose: () => void;
  /** Hand the card up to the panel, which owns the dialog — this menu closes on every action, and a
   *  dialog rendered from here would be unmounted by its own opening click. */
  onEditFootprint: (card: CardPhoto) => void;
}): React.ReactElement {
  const key = card.photoName.toLowerCase();
  const hasPhoto = useEditor((s) => s.thumbnailNames.has(key));
  // The footprint key is the photo key VERBATIM (not lowercased): a file name has to survive a
  // case-insensitive Windows disk, but this is a JSON key both written and read through photoKey.
  const hasFootprint = useEditor((s) => s.footprints.entries[card.photoName] !== undefined);
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
    const r = await pct.saveObjectPhoto(card.photoName);
    setBusy(false);
    if (r.ok) {
      editorStore.getState().invalidateThumbnail(card.photoName); // the card shows the new photo at once
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
    if (!window.confirm(`Remove the photo for "${card.displayName}"?`)) return;
    setBusy(true);
    setError(null);
    const r = await pct.deleteObjectPhoto(card.photoName);
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
      <div className="pct-context-menu-name">{card.photoName}</div>
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
      <hr className="pct-context-menu-sep" />
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          onEditFootprint(card);
          onClose();
        }}
      >
        {hasFootprint ? "Edit footprint…" : "Set footprint…"}
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
