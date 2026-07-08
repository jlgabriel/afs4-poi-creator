// App.tsx — the composition root. It runs the bootstrap (useBootstrap) and switches on the resulting
// phase: a splash while catalog/settings load, the first-run wizard, or the editor shell. The demo
// seeding + the real IPC bootstrap both live in app/usePct.ts; this file is just the switch.
import { useBootstrap } from "./app/usePct";
import { AppShell } from "./shell/AppShell";

// Placeholder for the real first-run wizard (M1e-5e). Only reachable in the Electron app when nothing
// is cached yet; the browser preview never lands here (it seeds the demo and goes straight to editor).
function WizardPlaceholder(): React.ReactElement {
  return (
    <div className="pct-boot">
      <p>First-run setup arrives in M1e-5e. Run a scan via the app to populate the catalog.</p>
    </div>
  );
}

export function App(): React.ReactElement {
  const phase = useBootstrap();
  if (phase === "loading") {
    return (
      <div className="pct-boot">
        <p>Loading…</p>
      </div>
    );
  }
  if (phase === "wizard") return <WizardPlaceholder />;
  return <AppShell />;
}
