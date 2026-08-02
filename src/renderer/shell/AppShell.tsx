// AppShell.tsx — the editor layout: a spanning TopBar over a 3-panel grid (Catalog | Map | Inspector),
// plus the modal Export dialog (design §5). All three panels are direct children of the `.pct-app` CSS
// grid; the Export dialog is a fixed-position overlay, so its DOM position in the tree doesn't matter.
import { useEffect, useState } from "react";
import { TopBar } from "./TopBar";
import { RecoveryBanner } from "./RecoveryBanner";
import { CatalogPanel } from "../catalog/CatalogPanel";
import { MapView } from "../map/MapView";
import { Inspector } from "../inspector/Inspector";
import { PlacedList } from "../placed/PlacedList";
import { ExportDialog } from "../dialogs/ExportDialog";
import { HeliportDialog } from "../dialogs/HeliportDialog";
import { SettingsDialog } from "../dialogs/SettingsDialog";
import { useKeyboardShortcuts } from "../app/useKeyboardShortcuts";

export function AppShell({ onRescan }: { onRescan: () => void }): React.ReactElement {
  useKeyboardShortcuts();
  const [exportOpen, setExportOpen] = useState(false);
  const [heliportOpen, setHeliportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The photo menu (v0.7) fires this when the user has no photo folder yet and clicks "Open Settings" on
  // its inline error — the portalled menu can't set this state directly, so it asks via a window event.
  useEffect(() => {
    const open = (): void => setSettingsOpen(true);
    window.addEventListener("pct:open-settings", open);
    return () => window.removeEventListener("pct:open-settings", open);
  }, []);
  // Same channel for the install dialog (v1.3): the Inspector's heliport panel asks for it, and the
  // Inspector is not this component's child in any way it could receive a prop through.
  useEffect(() => {
    const open = (): void => setHeliportOpen(true);
    window.addEventListener("pct:open-heliport", open);
    return () => window.removeEventListener("pct:open-heliport", open);
  }, []);
  return (
    <div className="pct-app">
      <TopBar
        onRescan={onRescan}
        onExport={() => setExportOpen(true)}
        onHeliport={() => setHeliportOpen(true)}
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
      {heliportOpen && <HeliportDialog onClose={() => setHeliportOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} onRescan={onRescan} />
      )}
    </div>
  );
}
