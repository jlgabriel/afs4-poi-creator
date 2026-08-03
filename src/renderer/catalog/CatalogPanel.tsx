// CatalogPanel.tsx — the left panel: a category tree over a virtualized, searchable gallery of
// catalog objects. Clicking a card arms placement (click the armed card again to disarm); the map
// then drops the object on click. M2a fills in what the M1e-5 plain-text list deferred: the §2.4
// category tree, generic per-category icons, and react-window virtualization.
//
// Perf (the Bug A lesson, now structural): the ~900-object list is virtualized, so only the ~15
// visible rows are ever in the DOM — a keystroke re-renders those, never 900 cards, and the giant
// element array the M1e-6 fix had to memoize simply no longer exists. The input still echoes at
// urgent priority via useDeferredValue while the filtered `objects` array is a deferred pass, and
// `onArm` is stable so arming re-renders only the affected rows.
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { List, type RowComponentProps } from "react-window";
import type { CatalogObject } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import type { PlacingSpec } from "../state/store";
import { getPct } from "../app/pct";
import { RegisterDialog } from "../dialogs/RegisterDialog";
import { matchesFilter } from "./catalogFilter";
import { isBrowsable } from "./browseVisibility";
import { buildCatalogTree, hasCategory } from "./catalogTree";
import { CategoryTree } from "./CategoryTree";
import { Thumbnail } from "./Thumbnail";
import { HoverPreview } from "./HoverPreview";
import { ObjectContextMenu } from "./ObjectContextMenu";
import { AirportSection } from "./AirportSection";
import { LightsSection } from "./LightsSection";
import { PlantsSection } from "./PlantsSection";
import { anchorRectOf, xrefCardPhoto, type CardPhoto, type CardPopovers } from "./cardPhoto";
import { sizeLabel } from "./sizeLabel";
import { FootprintDialog } from "../dialogs/FootprintDialog";

const ROW_H = 64; // must match .pct-row height budget in styles.css (card + row padding)
// Rest-before-show, so sweeping the mouse down the list doesn't strobe popups. 250 ms turned out to be
// too eager in practice (forum #172): the popup kept opening while people were only reading the rows, and
// they had to jiggle the mouse to stop it. 1 s is the floor of the "at least 1 s, 2 s is long" band
// ApfelFlieger gave at #178: enough rest that reading the list never triggers it, while still feeling
// responsive when you do stop on a card (1.5 s and 1.2 s both read as sluggish when actually flown).
const HOVER_DELAY_MS = 1000;

interface ObjectCardProps {
  o: CatalogObject;
  armed: boolean;
  onArm: (name: string) => void;
  popovers: CardPopovers;
}

const ObjectCard = memo(function ObjectCard({
  o,
  armed,
  onArm,
  popovers,
}: ObjectCardProps): React.ReactElement {
  const card = xrefCardPhoto(o);
  // A loose user `.tmb` can't be placed until it's registered (it wouldn't resolve in the sim), so its
  // card is disabled and badged — the Register banner above turns it into a normal, placeable object.
  const unregistered = o.unregistered === true;
  return (
    <button
      type="button"
      className={armed ? "pct-obj-card armed" : "pct-obj-card"}
      // The real object name now lives in the hover-preview (reliable on every OS); the native `title`
      // tooltip was flaky on macOS (#166). Kept ONLY for the disabled/unregistered card — its preview
      // never fires (disabled buttons emit no hover) and this text is a placement hint, not the name.
      title={unregistered ? `${o.name} — a loose user .tmb; use Register (above) before placing it` : undefined}
      aria-pressed={armed}
      disabled={unregistered}
      onClick={() => onArm(o.name)}
      // Right-click arms nothing — it opens the photo menu at the cursor (preventDefault stops the OS menu).
      onContextMenu={(e) => {
        e.preventDefault();
        popovers.onMenu(card, e.clientX, e.clientY);
      }}
      onMouseEnter={(e) => popovers.onShow(card, anchorRectOf(e.currentTarget))}
      onMouseLeave={popovers.onHide}
      onFocus={(e) => popovers.onShow(card, anchorRectOf(e.currentTarget))}
      onBlur={popovers.onHide}
    >
      <Thumbnail key={card.photoName} name={card.photoName} category={o.category} />
      <span className="pct-obj-text">
        <span className="pct-obj-name">
          {o.displayName}
          {unregistered && <span className="pct-badge">unregistered</span>}
        </span>
        <span className="pct-obj-meta">
          {o.sizeUnknown ? "size unknown" : sizeLabel(o.size)}
          {/* Say when the numbers are the user's own rather than the scan's — an overridden object looks
              identical otherwise, and "why is this one 2 m wide" should be answerable from the card. */}
          {o.footprintSource === "user" && <span className="pct-badge">custom</span>}
        </span>
        <span className="pct-obj-cat">{o.category}</span>
      </span>
    </button>
  );
});

/** A banner shown when the catalog holds user `.tmb` that no `.tmi` indexes yet (design B2). It counts
 *  and opens; the plan, the confirmation and the result all live in RegisterDialog.
 *
 *  Q4 chose "a simple banner + confirm/alert, not a bespoke modal", and that held right up until a user
 *  arrived with ~2000 objects: a native alert doesn't scroll, so his skipped list ran off the bottom of
 *  the screen (#125). The banner itself stayed simple — only the surface behind it grew. */
function RegisterBanner({ count }: { count: number }): React.ReactElement | null {
  const pct = getPct();
  const [open, setOpen] = useState(false);
  if (count === 0) return null;

  return (
    <>
      <div className="pct-register-banner">
        <span>
          {count} user object{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} registering before you can place{" "}
          {count === 1 ? "it" : "them"}.
        </span>
        <button
          type="button"
          disabled={!pct}
          title={pct ? undefined : "Registration runs in the desktop app"}
          onClick={() => setOpen(true)}
        >
          Register…
        </button>
      </div>
      {open && <RegisterDialog onClose={() => setOpen(false)} />}
    </>
  );
}

interface RowProps {
  objects: CatalogObject[];
  placing: PlacingSpec | null;
  onArm: (name: string) => void;
  popovers: CardPopovers;
}

// react-window renders this per visible index. `style` positions the row absolutely and MUST land on
// the outer element; the inter-card gap lives in .pct-row padding (border-box, inside ROW_H).
function Row({
  index,
  style,
  ariaAttributes,
  objects,
  placing,
  onArm,
  popovers,
}: RowComponentProps<RowProps>): React.ReactElement {
  const o = objects[index];
  const armed = placing?.kind === "xref" && placing.name === o.name;
  return (
    <div className="pct-row" style={style} {...ariaAttributes}>
      <ObjectCard o={o} armed={armed} onArm={onArm} popovers={popovers} />
    </div>
  );
}

export function CatalogPanel(): React.ReactElement {
  const catalog = useEditor((s) => s.catalog);
  const filter = useEditor((s) => s.filter);
  const placing = useEditor((s) => s.placing);

  // Hover-preview (forum #170/#166): the card the mouse is resting on, plus where its thumbnail sits.
  // A short rest-delay via `hoverTimer` keeps a fast scan down the list from strobing popups.
  //
  // Both popups are owned HERE, for the whole panel, and handed to the Lights and Plants sections as
  // `popovers` (v0.8). Per-section state would have been less plumbing but would let a menu opened in
  // Plants sit on screen underneath a hover-preview raised in Objects — the exact stacking the
  // "suppress hover while the menu is open" rule below exists to prevent.
  const [hovered, setHovered] = useState<{ card: CardPhoto; anchor: DOMRect } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Right-click "Paste photo" menu (v0.7): which card, and where the click landed (viewport coords).
  const [menu, setMenu] = useState<{ card: CardPhoto; x: number; y: number } | null>(null);
  // The footprint editor (v0.9), opened from that menu. Owned here rather than inside the menu, which
  // closes on every action — a dialog rendered from a closing menu unmounts with it.
  const [footprintCard, setFootprintCard] = useState<CardPhoto | null>(null);

  // Browse view hides objects that only make sense assembled inside an airport (the loose jetway
  // parts) — a DISPLAY filter, so the tree counts and the gallery agree while the full catalog and
  // its name→object index keep every object placeable/exportable. Computed once per catalog load.
  const browsable = useMemo(() => (catalog ? catalog.xref.filter(isBrowsable) : []), [catalog]);

  // Loose user `.tmb` waiting to be registered (design B2) — drives the Register banner.
  const unregisteredCount = useMemo(
    () => (catalog ? catalog.xref.filter((o) => o.unregistered).length : 0),
    [catalog],
  );

  const tree = useMemo(() => (catalog ? buildCatalogTree(browsable) : null), [catalog, browsable]);

  // A category the current catalog no longer has is no filter at all — see hasCategory. DERIVED, not
  // synced back into the store: the user's choice is still their choice, so a rescan that brings the
  // node back re-applies it, and we never write to the store from a render.
  const category = useMemo(
    () => (tree !== null && filter.category !== null && !hasCategory(tree, filter.category) ? null : filter.category),
    [tree, filter.category],
  );

  // The input reflects filter.query immediately; the list filters on the DEFERRED query so typing is
  // never blocked by the row re-render (see the perf note above).
  const deferredQuery = useDeferredValue(filter.query);
  const objects = useMemo(
    () => browsable.filter((o) => matchesFilter(o, { category, query: deferredQuery })),
    [browsable, category, deferredQuery],
  );

  // Stable across renders: reads the live `placing` at click time rather than closing over this
  // render's value, so rows don't all re-render on every keystroke.
  const onArm = useCallback((name: string) => {
    const cur = editorStore.getState().placing;
    const armed = cur?.kind === "xref" && cur.name === name;
    editorStore.getState().armPlacement(armed ? null : { kind: "xref", name });
  }, []);

  const onSelectCategory = useCallback(
    (category: string | null) => editorStore.getState().setFilter({ category }),
    [],
  );

  const onShowPreview = useCallback((card: CardPhoto, anchor: DOMRect) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered({ card, anchor }), HOVER_DELAY_MS);
  }, []);
  const onHidePreview = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
  }, []);
  // Opening the menu hides any hover-preview and cancels a pending one, so the popup and the menu never
  // stack. Coords come straight from the contextmenu event (the menu is portalled + position:fixed).
  const onOpenMenu = useCallback((card: CardPhoto, x: number, y: number) => {
    clearTimeout(hoverTimer.current);
    setHovered(null);
    setMenu({ card, x, y });
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []); // never fire after unmount

  // One stable object for all three sections — stable so the memoized cards don't re-render on a
  // keystroke (the same reason `onArm` is a useCallback).
  const popovers = useMemo<CardPopovers>(
    () => ({ onShow: onShowPreview, onHide: onHidePreview, onMenu: onOpenMenu }),
    [onShowPreview, onHidePreview, onOpenMenu],
  );

  const rowProps = useMemo<RowProps>(
    () => ({ objects, placing, onArm, popovers }),
    [objects, placing, onArm, popovers],
  );

  return (
    <section className="pct-catalog">
      <h2 className="pct-panel-title">Catalog</h2>
      <input
        className="pct-search"
        type="search"
        placeholder="Search objects…"
        value={filter.query}
        onChange={(e) => editorStore.getState().setFilter({ query: e.target.value })}
      />
      <RegisterBanner count={unregisteredCount} />
      {/* The XREF objects live in their own collapsible section so folding it lifts the Lights section
          into view instead of leaving it pinned to the bottom (forum #86-1). Starts COLLAPSED like
          Lights and Plants so all three families and their counts are visible at a glance on open,
          instead of Objects pushing the other two off-screen (forum #163). */}
      <details className="pct-objects">
        <summary className="pct-section-summary">Objects ({browsable.length})</summary>
        {tree && <CategoryTree tree={tree} active={category} onSelect={onSelectCategory} />}
        {/* Wheel-scrolling slides the rows out from under a shown popup → hide it (it reappears on the
            next mouse rest). onWheel bubbles from the virtualized list; the scroll event doesn't. */}
        <div className="pct-catalog-list" onWheel={onHidePreview}>
          {objects.length === 0 ? (
            <p className="pct-empty">{catalog ? "No matching objects" : "No catalog loaded"}</p>
          ) : (
            <List
              className="pct-vlist"
              rowComponent={Row}
              rowCount={objects.length}
              rowHeight={ROW_H}
              rowProps={rowProps}
              defaultHeight={400}
            />
          )}
        </div>
      </details>
      <LightsSection popovers={popovers} />
      <PlantsSection popovers={popovers} />
      {/* Last, and collapsed like the other three (#184): 1.3.0 left it open to advertise the one card
          people could not find, and ApfelFlieger — who asked for the card in the first place — said he
          would rather have the four headers line up. A section that is the only one hanging open reads
          as a state, not as an invitation. */}
      <AirportSection />
      {/* Suppress the hover-preview while the menu is open so the two popups never stack. */}
      {hovered !== null && menu === null && <HoverPreview card={hovered.card} anchor={hovered.anchor} />}
      {menu !== null && (
        <ObjectContextMenu
          card={menu.card}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEditFootprint={setFootprintCard}
        />
      )}
      {footprintCard !== null && (
        <FootprintDialog card={footprintCard} onClose={() => setFootprintCard(null)} />
      )}
    </section>
  );
}
