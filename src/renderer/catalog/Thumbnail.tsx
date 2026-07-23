// Thumbnail.tsx — the per-row object icon (v0.6). If the object's `name` has a user photo in the
// configured folder it shows that photo (cover-cropped to the 40px square); otherwise it falls back to
// the generated <CategoryIcon> glyph — the exact element every row drew before this feature, so a row
// can only be upgraded, never broken. The photo load + cache lives in useThumbnailSrc, shared with the
// hover-preview so enlarging a card reuses the already-fetched bytes.
import { memo } from "react";
import { CategoryIcon } from "./categoryIcon";
import { useThumbnailSrc } from "./useThumbnailSrc";

export const Thumbnail = memo(function Thumbnail({
  name,
  category,
}: {
  name: string | null;
  category: string;
}): React.ReactElement {
  const src = useThumbnailSrc(name);
  // No photo for this object, or it hasn't loaded / failed to load → the generated category glyph.
  if (src === null) return <CategoryIcon category={category} />;
  return (
    <img className="pct-thumb pct-thumb-photo" src={src} alt="" aria-hidden="true" draggable={false} />
  );
});
