// App.tsx — the composition root. It runs the bootstrap (useBootstrap) and switches on the resulting
// phase: a splash while catalog/settings load, the first-run wizard, or the editor shell. The demo
// seeding + the real IPC bootstrap both live in app/usePct.ts; this file is just the switch. Rescan
// (TopBar) flips back to the wizard, which reloads the catalog without disturbing the open project.
import { useBootstrap } from "./app/usePct";
import { AppShell } from "./shell/AppShell";
import { FirstRunWizard } from "./dialogs/FirstRunWizard";

export function App(): React.ReactElement {
  const { phase, showEditor, showWizard } = useBootstrap();
  if (phase === "loading") {
    return (
      <div className="pct-boot">
        <p>Loading…</p>
      </div>
    );
  }
  if (phase === "wizard") return <FirstRunWizard onDone={showEditor} />;
  return <AppShell onRescan={showWizard} />;
}
