// useThumbnailSync.ts — keeps the store's object-photo set (v0.6) in step with the folder on disk.
// Runs once from the composition root: it refreshes on mount and again every time the window regains
// focus, which is exactly the moment the user comes back after dropping a photo in the folder (or after
// their in-sim capture wrote one) — so a new photo appears without a manual reload. A no-op refresh is
// cheap: listThumbnails is one readdir, and setThumbnails skips the write when the set is unchanged.
//
// No bridge (browser preview) → getPct() is null and this does nothing, leaving every card on its glyph.
import { useEffect } from "react";
import { editorStore } from "../state/editorStore";
import { getPct } from "./pct";

/** Fetch the current photo-name list and hand it to the store. Best-effort: a failed IPC read just
 *  leaves the previous set in place (the cards keep whatever they were showing). */
export function refreshThumbnails(): void {
  const pct = getPct();
  if (pct === null) return;
  void pct
    .listThumbnails()
    .then((names) => editorStore.getState().setThumbnails(names))
    .catch(() => {
      /* transient IPC failure — keep the last known set */
    });
}

export function useThumbnailSync(): void {
  useEffect(() => {
    refreshThumbnails(); // initial load (the folder may already hold photos from a past session)
    window.addEventListener("focus", refreshThumbnails);
    return () => window.removeEventListener("focus", refreshThumbnails);
  }, []);
}
