// AppShell.tsx — the editor layout: a spanning TopBar over a 3-panel grid (Catalog | Map | Inspector),
// plus the modal Export dialog (design §5). All three panels are direct children of the `.pct-app` CSS
// grid; the Export dialog is a fixed-position overlay, so its DOM position in the tree doesn't matter.
import { useState } from "react";
import { TopBar } from "./TopBar";
import { RecoveryBanner } from "./RecoveryBanner";
import { CatalogPanel } from "../catalog/CatalogPanel";
import { MapView } from "../map/MapView";
import { Inspector } from "../inspector/Inspector";
import { PlacedList } from "../placed/PlacedList";
import { ExportDialog } from "../dialogs/ExportDialog";
import { SettingsDialog } from "../dialogs/SettingsDialog";
import { useKeyboardShortcuts } from "../app/useKeyboardShortcuts";

export function AppShell({ onRescan }: { onRescan: () => void }): React.ReactElement {
  useKeyboardShortcuts();
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="pct-app">
      <TopBar
        onRescan={onRescan}
        onExport={() => setExportOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />
      <RecoveryBanner />
      <CatalogPanel />
      <MapView />
      <div className="pct-right">
        <Inspector />
        <PlacedList />
      </div>
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} onRescan={onRescan} />
      )}
    </div>
  );
}
