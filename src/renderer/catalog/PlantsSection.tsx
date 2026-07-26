// PlantsSection.tsx — v0.4 plants palette in the Catalog panel. Same shape as LightsSection: a
// collapsible section of scanned plants, arming a card sets the store's `placing` spec and the map
// drops the plant on click, exactly like an xref. 41 items (not the catalog's ~900), so it stays
// non-virtualized and leaves the proven virtualized xref gallery untouched.
//
// v0.8 gives these cards the photo treatment the xref gallery got in v0.6/v0.7 — thumbnail, hover
// preview and the right-click Paste/Remove menu. The plants NEEDED it more than most: a plant's whole
// identity is a group and a two-digit species, so Broadleaf 00 and Broadleaf 01 are one metre of height
// apart and otherwise indistinguishable behind the same generated glyph. The blocker was never the UI —
// it was that `plantKey` joins the pair with a `/`, which no file name can hold; see core/catalog/photoKey.
import { memo, useCallback, useMemo } from "react";
import { plantKey } from "../../core/catalog/plants";
import { photoKey } from "../../core/catalog/photoKey";
import { editorStore, useEditor } from "../state/editorStore";
import { Thumbnail } from "./Thumbnail";
import { anchorRectOf, type CardPhoto, type CardPopovers } from "./cardPhoto";

interface PlantCardProps {
  card: CardPhoto;
  subtitle: string;
  category: string;
  armed: boolean;
  onArm: () => void;
  popovers: CardPopovers;
}

const PlantCard = memo(function PlantCard({
  card,
  subtitle,
  category,
  armed,
  onArm,
  popovers,
}: PlantCardProps): React.ReactElement {
  return (
    <button
      type="button"
      className={armed ? "pct-obj-card armed" : "pct-obj-card"}
      aria-pressed={armed}
      title={subtitle}
      onClick={onArm}
      // Right-click arms nothing — it opens the photo menu at the cursor, exactly as on an xref card.
      onContextMenu={(e) => {
        e.preventDefault();
        popovers.onMenu(card, e.clientX, e.clientY);
      }}
      onMouseEnter={(e) => popovers.onShow(card, anchorRectOf(e.currentTarget))}
      onMouseLeave={popovers.onHide}
      onFocus={(e) => popovers.onShow(card, anchorRectOf(e.currentTarget))}
      onBlur={popovers.onHide}
    >
      <Thumbnail name={card.photoName} category={category} />
      <span className="pct-obj-text">
        <span className="pct-obj-name">{card.displayName}</span>
        <span className="pct-obj-cat">{subtitle}</span>
      </span>
    </button>
  );
});

export function PlantsSection({ popovers }: { popovers: CardPopovers }): React.ReactElement {
  const plants = useEditor((s) => s.catalog?.plants);
  const placing = useEditor((s) => s.placing);
  // The search box sits ABOVE every section, so it has to filter this one too — a query that narrows
  // the xref gallery to one hit while leaving all 41 plants on screen is the bug LightsSection already
  // had to fix. Not deferred: 41 cards re-render for free.
  const query = useEditor((s) => s.filter.query);
  const q = query.trim().toLowerCase();

  // buildPlants already sorts by group then species, which is exactly the browse order we want (each
  // group in one block) — so this only filters. Height is part of the haystack on purpose: the groups
  // are few and the species indices are opaque, so "17" is a realistic way to look for a 17 m tree.
  const shown = useMemo(() => {
    const all = plants ?? [];
    if (!q) return all;
    return all.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q) ||
        `${p.naturalHeight}`.includes(q),
    );
  }, [plants, q]);

  const arm = useCallback((group: string, species: string, naturalHeight: number) => {
    const cur = editorStore.getState().placing;
    const armed = cur?.kind === "plant" && cur.group === group && cur.species === species;
    editorStore
      .getState()
      .armPlacement(armed ? null : { kind: "plant", group, species, naturalHeight });
  }, []);

  return (
    <details className="pct-lights">
      <summary className="pct-lights-summary">Plants ({shown.length})</summary>
      <div className="pct-lights-list" onWheel={popovers.onHide}>
        {shown.map((p) => (
          <PlantCard
            key={plantKey(p)}
            card={{
              photoName: photoKey({ kind: "plant", group: p.group, species: p.species }),
              displayName: p.displayName,
            }}
            // The height IS the differentiator: Broadleaf 00 and 01 are the same tree at 17.5 m and
            // 16.5 m, so a subtitle of just "broadleaf" would make the 9 cards indistinguishable. The
            // `group/species` here is also what keeps the sim's own identity on screen now that the
            // hover-preview's monospace line shows the PHOTO key instead.
            subtitle={`${p.naturalHeight} m · ${plantKey(p)}`}
            // The glyph every plant card has always drawn — one generic tree, not p.category, so a
            // photo-less card looks exactly as it did before this feature.
            category="plants/tree"
            armed={placing?.kind === "plant" && placing.group === p.group && placing.species === p.species}
            onArm={() => arm(p.group, p.species, p.naturalHeight)}
            popovers={popovers}
          />
        ))}
        {/* Two different empty states, same split as Lights: with a query it's "your search found
            nothing here"; with no query it's "you have no plants at all", which for a catalog cached
            before v0.4 (`plants: []` has been in the type since M0, so it upgrades to an empty list
            rather than a crash) means Rescan. */}
        {shown.length === 0 && q && <p className="pct-empty">No matching plants</p>}
        {shown.length === 0 && !q && (
          <p className="pct-empty pct-lights-hint">Rescan to load plants from your install.</p>
        )}
      </div>
    </details>
  );
}
