// Thumbnail.tsx — the per-row object icon (v0.6). If the object's `name` has a user photo in the
// configured folder it shows that photo; otherwise it falls back to the generated <CategoryIcon> glyph
// — the exact element every row drew before this feature, so a row can only be upgraded, never broken.
//
// The store holds only the SET of names that have a photo (cheap, one IPC call on boot/focus); the image
// bytes are fetched lazily, per visible card, and cached module-side so react-window recycling a row on
// scroll doesn't re-fetch. `name` is null for placed kinds that have no catalog photo (lights, plants).
import { memo, useEffect, useState } from "react";
import { useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import { CategoryIcon } from "./categoryIcon";

// `${lowercased-name}#${epoch}` → data URL. Module-level so it survives row remounts; the epoch in the
// key means a real folder change (which bumps thumbnailEpoch) is a cache MISS and re-fetches, while a
// no-op refresh keeps hitting the same entries.
const cache = new Map<string, string>();

export const Thumbnail = memo(function Thumbnail({
  name,
  category,
}: {
  name: string | null;
  category: string;
}): React.ReactElement {
  const key = name === null ? "" : name.toLowerCase();
  const hasPhoto = useEditor((s) => key !== "" && s.thumbnailNames.has(key));
  const epoch = useEditor((s) => s.thumbnailEpoch);
  const [src, setSrc] = useState<string | null>(() => (hasPhoto ? (cache.get(`${key}#${epoch}`) ?? null) : null));

  useEffect(() => {
    if (!hasPhoto || name === null) {
      setSrc(null);
      return;
    }
    const cacheKey = `${key}#${epoch}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      setSrc(cached);
      return;
    }
    let alive = true;
    void getPct()
      ?.getThumbnail(name)
      .then((url) => {
        if (!alive || url === null) return; // gone/unreadable → stay on the glyph
        cache.set(cacheKey, url);
        setSrc(url);
      });
    return () => {
      alive = false;
    };
  }, [name, key, epoch, hasPhoto]);

  // No photo for this object, or it hasn't loaded / failed to load → the generated category glyph.
  if (!hasPhoto || src === null) return <CategoryIcon category={category} />;
  return (
    <img className="pct-thumb pct-thumb-photo" src={src} alt="" aria-hidden="true" draggable={false} />
  );
});
