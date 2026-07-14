// LightsSection.tsx — v0.2 lights palette in the Catalog panel. A collapsible section listing the
// scanned airport-light fixtures plus one parametric "Point light" card. Arming a card sets the store's
// `placing` spec (by kind); the map then drops the light on click, exactly like an xref. Kept small +
// non-virtualized (23 items, not the catalog's ~900) so it stays a simple, self-contained addition
// that leaves the proven virtualized xref gallery untouched.
import { memo, useCallback, useMemo } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { CategoryIcon } from "./categoryIcon";

interface LightCardProps {
  icon: string; // a category path → CategoryIcon glyph
  title: string;
  subtitle: string;
  armed: boolean;
  onArm: () => void;
}

const LightCard = memo(function LightCard({
  icon,
  title,
  subtitle,
  armed,
  onArm,
}: LightCardProps): React.ReactElement {
  return (
    <button
      type="button"
      className={armed ? "pct-obj-card armed" : "pct-obj-card"}
      aria-pressed={armed}
      title={subtitle}
      onClick={onArm}
    >
      <CategoryIcon category={icon} />
      <span className="pct-obj-text">
        <span className="pct-obj-name">{title}</span>
        <span className="pct-obj-cat">{subtitle}</span>
      </span>
    </button>
  );
});

const POINT_TITLE = "Point light (custom)";

export function LightsSection(): React.ReactElement {
  const lights = useEditor((s) => s.catalog?.airportLights);
  const placing = useEditor((s) => s.placing);
  // The search box sits ABOVE both sections, so it has to filter both — it used to silently skip Lights,
  // leaving all 23 fixtures on screen while the xref gallery narrowed to one hit. Not deferred like the
  // gallery's: 23 cards re-render for free, the ~900 are the ones that needed the deferred pass.
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
      <div className="pct-lights-list">
        {showPoint && (
          <LightCard
            icon="lights/point"
            title={POINT_TITLE}
            subtitle="parametric · colour + intensity + flash"
            armed={placing?.kind === "light"}
            onArm={armPointLight}
          />
        )}
        {sorted.map((l) => (
          <LightCard
            key={l.typeName}
            icon={l.category}
            title={l.displayName}
            subtitle={l.typeName}
            armed={placing?.kind === "airport_light" && placing.name === l.typeName}
            onArm={() => armAirportLight(l.typeName)}
          />
        ))}
        {/* Two different empty states. With a query it's "your search found nothing here"; with no query
            it's "you have no fixtures at all" — which for a catalog cached before v0.2 (or a first boot)
            means Rescan, since the fixtures come from the install scan (the point light above needs none). */}
        {sorted.length === 0 && !showPoint && <p className="pct-empty">No matching lights</p>}
        {sorted.length === 0 && !q && (
          <p className="pct-empty pct-lights-hint">Rescan to load airport lights from your install.</p>
        )}
      </div>
    </details>
  );
}
