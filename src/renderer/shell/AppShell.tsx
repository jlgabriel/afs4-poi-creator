// AppShell.tsx — the editor layout: a spanning TopBar over a 3-panel grid (Catalog | Map | Inspector).
// All four are direct children of the `.pct-app` CSS grid (design §5). The Inspector is a placeholder
// here; the real one arrives in M1e-5b, the global keyboard hook in M1e-5c, and the Export/Rescan
// dialogs get wired into TopBar in M1e-5f / M1e-5e.
import { TopBar } from "./TopBar";
import { CatalogPanel } from "../catalog/CatalogPanel";
import { MapView } from "../map/MapView";
import { useEditor } from "../state/editorStore";

function InspectorPlaceholder(): React.ReactElement {
  const selCount = useEditor((s) => s.selection.length);
  return (
    <aside className="pct-inspector">
      <h2 className="pct-panel-title">Inspector</h2>
      <p className="pct-empty">
        {selCount === 0 ? "Select an object on the map" : `${selCount} selected`}
      </p>
    </aside>
  );
}

export function AppShell(): React.ReactElement {
  return (
    <div className="pct-app">
      <TopBar />
      <CatalogPanel />
      <MapView />
      <InspectorPlaceholder />
    </div>
  );
}
