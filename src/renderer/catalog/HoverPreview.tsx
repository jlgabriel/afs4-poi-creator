// HoverPreview.tsx — the floating popup shown while the mouse rests on a catalog card (forum #170/#166,
// requested by ApfelFlieger). It does two jobs the small 40px row can't:
//   • shows the user photo ENLARGED (~3× the thumb — Michael asked for 2× min, 3× max) and UNCROPPED
//     (object-fit:contain, so the whole object is visible; the row thumb is cover-cropped to a square),
//   • shows the object's REAL catalog name in monospace — the string a photo file must be named after
//     (`<name>.ext`, see useThumbnailSrc). That name was previously only the native `title` tooltip,
//     which is unreliable on macOS (#166) and is exactly what blocked Michael from naming his photos
//     for the objects that still have none (#160). A custom popup renders identically on every OS.
//
// It is portalled to <body> so the panel's overflow:hidden (and the map's stacking context) can't clip
// it, and it's pointer-events:none so it never steals the hover from the card underneath.
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogObject } from "../../core/project/types";
import { useThumbnailSrc } from "./useThumbnailSrc";
import { computePreviewPosition, type Pos } from "./previewPosition";

export function HoverPreview({
  object,
  anchor,
}: {
  object: CatalogObject;
  anchor: DOMRect;
}): React.ReactElement {
  const src = useThumbnailSrc(object.name);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  // Measure the popup (its size depends on whether there's a photo and how long the name is), then place
  // it. useLayoutEffect runs before paint, so the measured position is applied without a visible flash;
  // until then the box is hidden. Re-runs when the anchor moves (new card) or the photo arrives.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setPos(
      computePreviewPosition(
        anchor,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, src, object.name]);

  return createPortal(
    <div
      ref={ref}
      className="pct-hover-preview"
      role="tooltip"
      style={{
        left: pos?.left ?? anchor.right + 12,
        top: pos?.top ?? anchor.top,
        visibility: pos === null ? "hidden" : "visible",
      }}
    >
      {src !== null && (
        <span className="pct-hover-preview-imgbox">
          <img className="pct-hover-preview-img" src={src} alt="" draggable={false} />
        </span>
      )}
      <span className="pct-hover-preview-name">{object.name}</span>
    </div>,
    document.body,
  );
}
