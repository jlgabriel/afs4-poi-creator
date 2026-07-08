// AppShell.tsx — the editor layout: a spanning TopBar over a 3-panel grid (Catalog | Map | Inspector).
// All four are direct children of the `.pct-app` CSS grid (design §5). The global keyboard hook arrives
// in M1e-5c; the Export/Rescan dialogs get wired into TopBar in M1e-5f / M1e-5e.
import { TopBar } from "./TopBar";
import { CatalogPanel } from "../catalog/CatalogPanel";
import { MapView } from "../map/MapView";
import { Inspector } from "../inspector/Inspector";

export function AppShell(): React.ReactElement {
  return (
    <div className="pct-app">
      <TopBar />
      <CatalogPanel />
      <MapView />
      <Inspector />
    </div>
  );
}
