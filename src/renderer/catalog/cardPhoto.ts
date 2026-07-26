// cardPhoto.ts — what the three photo surfaces (thumbnail, hover-preview, right-click menu) need from a
// catalog card, and the handlers a section wires them to (v0.8).
//
// Until v0.7 those surfaces took a `CatalogObject` and read `object.name`, which silently made "has a
// photo" a privilege of the XREF gallery: the Lights and Plants sections build their cards from
// CatalogAirportLight and CatalogPlant, which have no `name` at all, so they drew a bare glyph and had
// neither hover-preview nor menu. Narrowing the props to this pair is the whole unlock — a section
// supplies a photo key (core/catalog/photoKey) and a label, and gets all three surfaces for free.
import type { CatalogObject } from "../../core/project/types";
import { photoKey } from "../../core/catalog/photoKey";

export interface CardPhoto {
  /** The photo file-name stem — `photoKey(...)`. Also the string the hover-preview shows in monospace,
   *  because it IS what the user must name the file (forum #160). */
  photoName: string;
  /** The human label, used in the "Remove the photo for …?" confirm. Never a file name. */
  displayName: string;
}

/** The handlers a card fires. Owned by CatalogPanel (one hover popup and one menu for the WHOLE panel,
 *  so a menu open in Plants and a hover in Objects can't stack) and passed down to each section. */
export interface CardPopovers {
  onShow: (card: CardPhoto, anchor: DOMRect) => void;
  onHide: () => void;
  onMenu: (card: CardPhoto, x: number, y: number) => void;
}

/** The hover-preview anchors to the thumbnail (the card's left edge) so the popup appears beside the
 *  image, as in Michael's mock; fall back to the whole card if the thumb somehow isn't there. */
export function anchorRectOf(card: HTMLElement): DOMRect {
  return (card.querySelector(".pct-thumb") ?? card).getBoundingClientRect();
}

/** The CardPhoto for an XREF gallery object. Its key is the bare `name` (v0.6 compatibility), so this is
 *  a rename rather than a change — kept as a function anyway so no call site hard-codes that equivalence. */
export function xrefCardPhoto(o: CatalogObject): CardPhoto {
  return { photoName: photoKey({ kind: "xref", name: o.name }), displayName: o.displayName };
}
