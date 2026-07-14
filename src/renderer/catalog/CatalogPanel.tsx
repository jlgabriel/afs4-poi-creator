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
import { memo, useCallback, useDeferredValue, useMemo } from "react";
import { List, type RowComponentProps } from "react-window";
import type { CatalogObject } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import type { PlacingSpec } from "../state/store";
import { matchesFilter } from "./catalogFilter";
import { isBrowsable } from "./browseVisibility";
import { buildCatalogTree } from "./catalogTree";
import { CategoryTree } from "./CategoryTree";
import { CategoryIcon } from "./categoryIcon";
import { LightsSection } from "./LightsSection";

const ROW_H = 64; // must match .pct-row height budget in styles.css (card + row padding)

interface ObjectCardProps {
  o: CatalogObject;
  armed: boolean;
  onArm: (name: string) => void;
}

const ObjectCard = memo(function ObjectCard({ o, armed, onArm }: ObjectCardProps): React.ReactElement {
  return (
    <button
      type="button"
      className={armed ? "pct-obj-card armed" : "pct-obj-card"}
      title={o.name}
      aria-pressed={armed}
      onClick={() => onArm(o.name)}
    >
      <CategoryIcon category={o.category} />
      <span className="pct-obj-text">
        <span className="pct-obj-name">{o.displayName}</span>
        <span className="pct-obj-meta">
          {o.size.x.toFixed(1)} × {o.size.y.toFixed(1)} × {o.size.z.toFixed(1)} m
        </span>
        <span className="pct-obj-cat">{o.category}</span>
      </span>
    </button>
  );
});

interface RowProps {
  objects: CatalogObject[];
  placing: PlacingSpec | null;
  onArm: (name: string) => void;
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
}: RowComponentProps<RowProps>): React.ReactElement {
  const o = objects[index];
  const armed = placing?.kind === "xref" && placing.name === o.name;
  return (
    <div className="pct-row" style={style} {...ariaAttributes}>
      <ObjectCard o={o} armed={armed} onArm={onArm} />
    </div>
  );
}

export function CatalogPanel(): React.ReactElement {
  const catalog = useEditor((s) => s.catalog);
  const filter = useEditor((s) => s.filter);
  const placing = useEditor((s) => s.placing);

  // Browse view hides objects that only make sense assembled inside an airport (the loose jetway
  // parts) — a DISPLAY filter, so the tree counts and the gallery agree while the full catalog and
  // its name→object index keep every object placeable/exportable. Computed once per catalog load.
  const browsable = useMemo(() => (catalog ? catalog.xref.filter(isBrowsable) : []), [catalog]);

  const tree = useMemo(() => (catalog ? buildCatalogTree(browsable) : null), [catalog, browsable]);

  // The input reflects filter.query immediately; the list filters on the DEFERRED query so typing is
  // never blocked by the row re-render (see the perf note above).
  const deferredQuery = useDeferredValue(filter.query);
  const objects = useMemo(
    () => browsable.filter((o) => matchesFilter(o, { category: filter.category, query: deferredQuery })),
    [browsable, filter.category, deferredQuery],
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

  const rowProps = useMemo<RowProps>(() => ({ objects, placing, onArm }), [objects, placing, onArm]);

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
      {/* The XREF objects live in their own collapsible section so folding it lifts the Lights section
          into view instead of leaving it pinned to the bottom (forum #86-1). Mirrors LightsSection. */}
      <details className="pct-objects" open>
        <summary className="pct-section-summary">Objects ({browsable.length})</summary>
        {tree && <CategoryTree tree={tree} active={filter.category} onSelect={onSelectCategory} />}
        <div className="pct-catalog-list">
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
      <LightsSection />
    </section>
  );
}
