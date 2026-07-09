// CatalogPanel.tsx — the left panel: a search box over a plain list of catalog objects. Clicking a
// card arms placement (click the armed card again to disarm); the map then drops the object on click.
// M1e-5 scope: plain text cards (displayName · size · category), no SVG thumbnails / virtualization —
// those are M2. The filtered list is derived with useMemo over stably-selected catalog + filter (never
// build arrays inside a selector, or every unrelated store change re-renders the panel).
//
// Bug A (M1e-6) — "search rejects typing after a wizard boot": this addresses a REAL, measured perf
// defect, but is NOT confirmed to be the reported bug's root cause. The ~900-object list is not
// virtualized (M2), so filtering re-rendered the whole list synchronously on every keystroke (~33ms in
// a fast browser; worse under Electron dev + StrictMode). Genuine contributor, fixed here. BUT the
// reported symptom is wizard-boot-conditional and per-keystroke cost is path-INdependent, so a
// session-scoped FOCUS failure remains the prime suspect (Electron native-dialog focus desync after the
// wizard's Browse, or the pre-b9fb4e2 map-pane overlay) — neither of which this can fix. Keep Bug A open
// pending the on-machine in-sim protocol before closing it.
//
// The perf fix, both parts off the critical path: (1) useDeferredValue lets the input echo each keystroke
// at urgent priority while the heavy list re-render is a deferred, interruptible pass; (2) the row is a
// memo'd component with a STABLE onArm + a memoized element array, so an urgent keystroke creates zero
// elements and arming re-renders only the two affected cards.
import { memo, useCallback, useDeferredValue, useMemo } from "react";
import type { CatalogObject } from "../../core/project/types";
import { editorStore, useEditor } from "../state/editorStore";
import { matchesFilter } from "./catalogFilter";

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
      <span className="pct-obj-name">{o.displayName}</span>
      <span className="pct-obj-meta">
        {o.size.x.toFixed(1)} × {o.size.y.toFixed(1)} × {o.size.z.toFixed(1)} m
      </span>
      <span className="pct-obj-cat">{o.category}</span>
    </button>
  );
});

export function CatalogPanel(): React.ReactElement {
  const catalog = useEditor((s) => s.catalog);
  const filter = useEditor((s) => s.filter);
  const placing = useEditor((s) => s.placing);

  // The input reflects filter.query immediately; the list filters on the DEFERRED query so typing is
  // never blocked by the row re-render (see the bug-A note above).
  const deferredQuery = useDeferredValue(filter.query);
  const objects = useMemo(
    () =>
      catalog
        ? catalog.xref.filter((o) => matchesFilter(o, { category: filter.category, query: deferredQuery }))
        : [],
    [catalog, filter.category, deferredQuery],
  );

  // Stable across renders (empty deps): reads the live `placing` from the store at click time rather
  // than closing over this render's value, so the memo'd rows don't all re-render on every keystroke.
  const onArm = useCallback((name: string) => {
    const cur = editorStore.getState().placing;
    editorStore.getState().armPlacement(cur === name ? null : name);
  }, []);

  // Memoize the row ELEMENTS too, not just each card: an urgent (typing) render reuses the SAME
  // `objects` (deferredQuery unchanged) and `placing`, so this returns the cached array and the
  // keystroke creates zero elements — the ~900-element rebuild only happens on the deferred filter
  // pass or on arm. This is what flattens the urgent keystroke path to O(1).
  // Key is source:bundle:name, not name alone: buildCatalog deliberately keeps duplicates (an install
  // and a user bundle can share a name), so name-only keys would collide → wrong row recycling + a
  // flood of React key warnings on every deferred render.
  const rows = useMemo(
    () =>
      objects.map((o) => (
        <ObjectCard
          key={`${o.source}:${o.bundle}:${o.name}`}
          o={o}
          armed={placing === o.name}
          onArm={onArm}
        />
      )),
    [objects, placing, onArm],
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
      <div className="pct-catalog-list">
        {objects.length === 0 ? (
          <p className="pct-empty">{catalog ? "No matching objects" : "No catalog loaded"}</p>
        ) : (
          rows
        )}
      </div>
    </section>
  );
}
