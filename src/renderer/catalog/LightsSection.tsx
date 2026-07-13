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

export function LightsSection(): React.ReactElement {
  const lights = useEditor((s) => s.catalog?.airportLights);
  const placing = useEditor((s) => s.placing);

  const sorted = useMemo(
    () => (lights ? [...lights].sort((a, b) => a.displayName.localeCompare(b.displayName)) : []),
    [lights],
  );

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
      <summary className="pct-lights-summary">Lights ({sorted.length + 1})</summary>
      <div className="pct-lights-list">
        <LightCard
          icon="lights/point"
          title="Point light (custom)"
          subtitle="parametric · colour + intensity + flash"
          armed={placing?.kind === "light"}
          onArm={armPointLight}
        />
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
        {/* Airport-light fixtures come from the install scan. A catalog cached before v0.2 (or the very
            first boot) carries none, so nudge the user to Rescan — the point light above needs no scan. */}
        {sorted.length === 0 && (
          <p className="pct-empty pct-lights-hint">Rescan to load airport lights from your install.</p>
        )}
      </div>
    </details>
  );
}
