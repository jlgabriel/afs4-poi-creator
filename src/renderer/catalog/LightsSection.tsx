// LightsSection.tsx — lights palette in the Catalog panel. A collapsible section listing the scanned
// airport-light fixtures plus one parametric "Point light" card. Arming a card sets the store's
// `placing` spec (by kind); the map then drops the light on click, exactly like an xref. Non-virtualized:
// the fixture list is short, unlike the xref gallery.
//
// Cards get the same photo treatment as the xref gallery (keyed by the fixture's unique `typeName`):
// different fixtures share one generated glyph, and a screenshot shows what a fixture looks like lit.
import { memo, useCallback, useMemo } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { Thumbnail } from "./Thumbnail";
import { anchorRectOf, cardFor, type CardPhoto, type CardPopovers } from "./cardPhoto";
import { sizeSuffix } from "./sizeLabel";

interface LightCardProps {
  icon: string; // a category path → CategoryIcon glyph (the fallback when there's no photo)
  card: CardPhoto;
  subtitle: string;
  armed: boolean;
  onArm: () => void;
  popovers: CardPopovers;
}

const LightCard = memo(function LightCard({
  icon,
  card,
  subtitle,
  armed,
  onArm,
  popovers,
}: LightCardProps): React.ReactElement {
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
      <Thumbnail name={card.photoName} category={icon} />
      <span className="pct-obj-text">
        <span className="pct-obj-name">{card.displayName}</span>
        <span className="pct-obj-cat">{subtitle}</span>
      </span>
    </button>
  );
});

const POINT_TITLE = "Point light (custom)";

export function LightsSection({ popovers }: { popovers: CardPopovers }): React.ReactElement {
  const lights = useEditor((s) => s.catalog?.airportLights);
  const placing = useEditor((s) => s.placing);
  // The search box sits ABOVE every section, so it filters this one too. Not deferred like the gallery's:
  // a short list re-renders for free.
  const query = useEditor((s) => s.filter.query);
  const q = query.trim().toLowerCase();

  const sorted = useMemo(() => {
    const all = lights ? [...lights].sort((a, b) => a.displayName.localeCompare(b.displayName)) : [];
    if (!q) return all;
    return all.filter(
      (l) => l.displayName.toLowerCase().includes(q) || l.typeName.toLowerCase().includes(q),
    );
  }, [lights, q]);

  const showPoint = !q || POINT_TITLE.toLowerCase().includes(q);

  const armAirportLight = useCallback((typeName: string) => {
    const cur = editorStore.getState().placing;
    const armed = cur?.kind === "airport_light" && cur.name === typeName;
    editorStore.getState().armPlacement(armed ? null : { kind: "airport_light", name: typeName });
  }, []);

  const armPointLight = useCallback(() => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur?.kind === "light" ? null : { kind: "light" });
  }, []);

  return (
    <details className="pct-lights">
      <summary className="pct-lights-summary">Lights ({sorted.length + (showPoint ? 1 : 0)})</summary>
      <div className="pct-lights-list" onWheel={popovers.onHide}>
        {showPoint && (
          <LightCard
            icon="lights/point"
            // The point light has no catalog entry — it's fully described by its parameters — but it's a
            // card like any other, so it gets a photo key rather than an exception. A screenshot of one
            // configuration is still a better hint than a glyph at what a point light looks like lit.
            card={cardFor({ kind: "light" }, POINT_TITLE)}
            subtitle="parametric · colour + intensity + flash"
            armed={placing?.kind === "light"}
            onArm={armPointLight}
            popovers={popovers}
          />
        )}
        {sorted.map((l) => (
          <LightCard
            key={l.typeName}
            icon={l.category}
            card={cardFor({ kind: "airport_light", typeName: l.typeName }, l.displayName)}
            // The measured size joins the subtitle once there is one: some fixtures differ only in size.
            subtitle={`${l.typeName}${sizeSuffix(l)}`}
            armed={placing?.kind === "airport_light" && placing.name === l.typeName}
            onArm={() => armAirportLight(l.typeName)}
            popovers={popovers}
          />
        ))}
        {/* Two different empty states. With a query it's "your search found nothing here"; with no query
            it's "you have no fixtures at all" — which for an old cached catalog (or a first boot) means
            Rescan, since the fixtures come from the install scan (the point light above needs none). */}
        {sorted.length === 0 && !showPoint && <p className="pct-empty">No matching lights</p>}
        {sorted.length === 0 && !q && (
          <p className="pct-empty pct-lights-hint">Rescan to load airport lights from your install.</p>
        )}
      </div>
    </details>
  );
}
