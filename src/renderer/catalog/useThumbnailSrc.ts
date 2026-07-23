// useThumbnailSrc.ts — resolves a catalog object's user photo (v0.6) to a data URL, or null when it has
// none / hasn't loaded / failed. Extracted from Thumbnail so the hover-preview (forum #170) can reuse
// the SAME module-level cache: hovering a card that already drew its photo is a cache HIT, never a
// second IPC fetch. The store holds only the SET of names that have a photo (one cheap IPC on
// boot/focus); the image bytes are fetched lazily, per name, and cached here.
import { useEffect, useState } from "react";
import { useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";

// `${lowercased-name}#${epoch}` → data URL. Module-level so it survives row remounts (react-window
// recycles rows on scroll) AND is shared between the thumbnail and its hover-preview. The epoch in the
// key means a real folder change (which bumps thumbnailEpoch) is a cache MISS and re-fetches, while a
// no-op refresh keeps hitting the same entries.
const cache = new Map<string, string>();

/** The photo data URL for `name`, or null. `name` is null for placed kinds with no catalog photo. */
export function useThumbnailSrc(name: string | null): string | null {
  const key = name === null ? "" : name.toLowerCase();
  const hasPhoto = useEditor((s) => key !== "" && s.thumbnailNames.has(key));
  const epoch = useEditor((s) => s.thumbnailEpoch);
  const [src, setSrc] = useState<string | null>(() =>
    hasPhoto ? (cache.get(`${key}#${epoch}`) ?? null) : null,
  );

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
        if (!alive || url === null) return; // gone/unreadable → stay null (caller falls back)
        cache.set(cacheKey, url);
        setSrc(url);
      });
    return () => {
      alive = false;
    };
  }, [name, key, epoch, hasPhoto]);

  return hasPhoto ? src : null;
}
