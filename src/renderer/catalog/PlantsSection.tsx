// PlantsSection.tsx — v0.4 plants palette in the Catalog panel. Same shape as LightsSection: a
// collapsible section of scanned plants, arming a card sets the store's `placing` spec and the map
// drops the plant on click, exactly like an xref. 41 items (not the catalog's ~900), so it stays
// non-virtualized and leaves the proven virtualized xref gallery untouched.
import { memo, useCallback, useMemo } from "react";
import { plantKey } from "../../core/catalog/plants";
import { editorStore, useEditor } from "../state/editorStore";
import { CategoryIcon } from "./categoryIcon";

interface PlantCardProps {
  title: string;
  subtitle: string;
  armed: boolean;
  onArm: () => void;
}

const PlantCard = memo(function PlantCard({
  title,
  subtitle,
  armed,
  onArm,
}: PlantCardProps): React.ReactElement {
  return (
    <button
      type="button"
      className={armed ? "pct-obj-card armed" : "pct-obj-card"}
      aria-pressed={armed}
      title={subtitle}
      onClick={onArm}
    >
      <CategoryIcon category="plants/tree" />
      <span className="pct-obj-text">
        <span className="pct-obj-name">{title}</span>
        <span className="pct-obj-cat">{subtitle}</span>
      </span>
    </button>
  );
});

export function PlantsSection(): React.ReactElement {
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
      <div className="pct-lights-list">
        {shown.map((p) => (
          <PlantCard
            key={plantKey(p)}
            title={p.displayName}
            // The height IS the differentiator: Broadleaf 00 and 01 are the same tree at 17.5 m and
            // 16.5 m, so a subtitle of just "broadleaf" would make the 9 cards indistinguishable.
            subtitle={`${p.naturalHeight} m · ${plantKey(p)}`}
            armed={placing?.kind === "plant" && placing.group === p.group && placing.species === p.species}
            onArm={() => arm(p.group, p.species, p.naturalHeight)}
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
