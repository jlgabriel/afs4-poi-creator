// PlantsSection.tsx — plants palette in the Catalog panel. Same shape as LightsSection: a collapsible
// section of scanned plants, arming a card sets the store's `placing` spec and the map drops the plant
// on click, exactly like an xref. The list is short, so it stays non-virtualized.
//
// Cards get the same photo treatment as the xref gallery — thumbnail, hover preview and the right-click
// Paste/Remove menu. A plant's whole identity is a group and a two-digit species, so species of one group
// are indistinguishable behind the same generated glyph. The photo key is NOT `plantKey` (which joins the
// pair with a `/`, which no file name can hold); see core/catalog/photoKey.
import { memo, useCallback, useMemo } from "react";
import { plantKey } from "../../core/catalog/plants";
import { editorStore, useEditor } from "../state/editorStore";
import { Thumbnail } from "./Thumbnail";
import { anchorRectOf, cardFor, type CardPhoto, type CardPopovers } from "./cardPhoto";
import { sizeSuffix } from "./sizeLabel";

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
  // The search box sits ABOVE every section, so it filters this one too. Not deferred: a short list
  // re-renders for free.
  const query = useEditor((s) => s.filter.query);
  const q = query.trim().toLowerCase();

  // buildPlants already sorts by group then species, which is exactly the browse order we want (each
  // group in one block) — so this only filters. Height is part of the haystack on purpose: the groups
  // are few and the species indices carry no meaning, so "17" is a realistic way to look for a 17 m tree.
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
            card={cardFor({ kind: "plant", group: p.group, species: p.species }, p.displayName)}
            // The height IS the differentiator: species of one group can be the same tree at slightly
            // different heights, so a subtitle of just the group would make them indistinguishable. The
            // `group/species` here keeps the sim's own identity on screen, since the hover-preview's
            // monospace line shows the PHOTO key instead. A measured footprint joins the tail — the
            // sim's own height, then the canopy the user measured.
            subtitle={`${p.naturalHeight} m · ${plantKey(p)}${sizeSuffix(p)}`}
            // The glyph every plant card has always drawn — one generic tree, not p.category, so a
            // photo-less card looks exactly as it did before this feature.
            category="plants/tree"
            armed={placing?.kind === "plant" && placing.group === p.group && placing.species === p.species}
            onArm={() => arm(p.group, p.species, p.naturalHeight)}
            popovers={popovers}
          />
        ))}
        {/* Two different empty states, same split as Lights: with a query it's "your search found
            nothing here"; with no query it's "you have no plants at all", which for an old cached
            catalog (it loads with an empty `plants` list rather than crashing) means Rescan. */}
        {shown.length === 0 && q && <p className="pct-empty">No matching plants</p>}
        {shown.length === 0 && !q && (
          <p className="pct-empty pct-lights-hint">Rescan to load plants from your install.</p>
        )}
      </div>
    </details>
  );
}
