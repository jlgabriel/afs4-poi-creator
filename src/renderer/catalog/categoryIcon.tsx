// categoryIcon.tsx — a generic per-category glyph for each catalog row. The scanner only recovers a
// name + bounding box from the .tmi index files; the real 3D meshes are opaque IPACS .tmb binaries
// with no reader, so we CAN'T draw the actual object. A category icon at least tells the user WHAT a
// row is (tower vs car vs plane) at a glance — the "x × y × z m" text carries the real size. Icons are
// inline SVG (no assets, sandbox-safe) in a shared line style; several categories share a glyph where
// the distinction doesn't help (e.g. every reservoir/fuel/water tank is a cylinder).
import { memo } from "react";

type IconKey =
  | "plane"
  | "truck"
  | "car"
  | "tower"
  | "hangar"
  | "factory"
  | "tank"
  | "house"
  | "building"
  | "church"
  | "antenna"
  | "crane"
  | "chair"
  | "person"
  | "jetway"
  | "light"
  | "box"
  | "generic";

/** Map a display-taxonomy category path to an icon key. Prefix-aware so it works for both the exact
 *  sub-category ("buildings/tower") and, defensively, a bare top-level. */
function iconKey(category: string): IconKey {
  const c = category.toLowerCase();
  if (c === "aircraft") return "plane";
  if (c.startsWith("lights/")) return "light"; // v0.2 airport lights

  if (c.startsWith("vehicles/")) {
    if (c.includes("truck") || c.includes("airport") || c.includes("caravan")) return "truck";
    return "car";
  }
  if (c.startsWith("buildings/")) {
    if (c.includes("tower")) return "tower";
    if (c.includes("hangar")) return "hangar";
    if (c.includes("factory")) return "factory";
    if (c.includes("reservoir") || c.includes("fuel")) return "tank";
    if (c.includes("residential")) return "house";
    return "building"; // office, terminal
  }
  if (c === "churches") return "church";
  if (c === "comm-towers") return "antenna";
  if (c === "construction") return "crane";
  if (c === "furniture") return "chair";
  if (c === "people") return "person";
  if (c === "jetways") return "jetway";
  if (c.startsWith("items/")) {
    if (c.includes("lighting")) return "light";
    if (c.includes("watertank")) return "tank";
    return "box"; // barrel, box, container, trashcan, technical, other
  }
  return "generic"; // various + anything unmapped
}

// Each entry is the inner geometry of a 0 0 24 24 line-icon (stroke = currentColor, no fill).
const ICONS: Record<IconKey, React.ReactElement> = {
  plane: (
    <path d="M12 2c1 0 1.4 1.6 1.4 3.2V9l7.6 4.4v1.9L13.4 13v3.6l2.3 1.9v1.4L12 20l-3.7.9v-1.4l2.3-1.9V13l-7.6 2.3v-1.9L10.6 9V5.2C10.6 3.6 11 2 12 2Z" />
  ),
  truck: (
    <>
      <rect x="2" y="8" width="12" height="8" />
      <path d="M14 10h4l3 3v3h-7z" />
      <circle cx="6" cy="17.5" r="1.7" />
      <circle cx="17" cy="17.5" r="1.7" />
    </>
  ),
  car: (
    <>
      <path d="M3 16v-3l3-1 2-4h8l2 4 3 1v3" />
      <line x1="3" y1="16" x2="21" y2="16" />
      <circle cx="7.5" cy="16.5" r="1.7" />
      <circle cx="16.5" cy="16.5" r="1.7" />
    </>
  ),
  tower: (
    <>
      <rect x="9" y="6" width="6" height="15" />
      <line x1="12" y1="6" x2="12" y2="3" />
      <line x1="9" y1="11" x2="15" y2="11" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </>
  ),
  hangar: (
    <>
      <path d="M3 21v-8a9 8 0 0 1 18 0v8" />
      <line x1="2" y1="21" x2="22" y2="21" />
      <path d="M9 21v-5h6v5" />
    </>
  ),
  factory: (
    <>
      <path d="M3 21V12l5 3V12l5 3V12l5 3v6z" />
      <rect x="16.5" y="6" width="2.5" height="6" />
    </>
  ),
  tank: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12a7 2.5 0 0 0 14 0V6" />
      <path d="M5 12h14" />
    </>
  ),
  house: (
    <>
      <path d="M4 21V10l8-6 8 6v11z" />
      <rect x="10" y="15" width="4" height="6" />
    </>
  ),
  building: (
    <>
      <rect x="6" y="3" width="12" height="18" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="6" y1="13" x2="18" y2="13" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </>
  ),
  church: (
    <>
      <path d="M6 21V11l6-5 6 5v10z" />
      <line x1="12" y1="6" x2="12" y2="2" />
      <line x1="10" y1="3.5" x2="14" y2="3.5" />
      <rect x="10" y="16" width="4" height="5" />
    </>
  ),
  antenna: (
    <>
      <path d="M8 21 12 4l4 17" />
      <line x1="9.3" y1="16" x2="14.7" y2="16" />
      <line x1="10.2" y1="11" x2="13.8" y2="11" />
    </>
  ),
  crane: (
    <>
      <path d="M7 21V4h12" />
      <line x1="7" y1="4" x2="4" y2="8" />
      <line x1="19" y1="4" x2="19" y2="8" />
      <line x1="4" y1="21" x2="10" y2="21" />
    </>
  ),
  chair: <path d="M8 4v16M8 13h9v7M8 13h9" />,
  person: (
    <>
      <circle cx="12" cy="6" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
    </>
  ),
  jetway: (
    <>
      <path d="M3 9h10l8 6v3H11L3 12z" />
      <line x1="3" y1="9" x2="3" y2="12" />
    </>
  ),
  light: (
    <>
      <line x1="12" y1="21" x2="12" y2="11" />
      <path d="M8 11a4 4 0 0 1 8 0z" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </>
  ),
  box: (
    <>
      <path d="M12 3 21 8v8l-9 5-9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <line x1="12" y1="13" x2="12" y2="21" />
    </>
  ),
  generic: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="12" y1="5" x2="12" y2="19" />
    </>
  ),
};

export const CategoryIcon = memo(function CategoryIcon({
  category,
}: {
  category: string;
}): React.ReactElement {
  return (
    <svg
      className="pct-thumb"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[iconKey(category)]}
    </svg>
  );
});
