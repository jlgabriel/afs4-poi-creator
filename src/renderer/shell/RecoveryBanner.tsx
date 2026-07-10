// RecoveryBanner.tsx — the crash-recovery offer (design §M2 "autosave + shadow recovery"). When boot
// finds an autosave shadow from a previous session (store.pendingRecovery), this non-blocking bar spans
// the top of the editor with Restore / Discard. A banner, not a window.confirm: it doesn't freeze boot,
// it reads as a "shell offer" (design §5), and it's driveable in the preview harness. The store actions
// live in app/commands.ts (restoreRecovery / discardRecovery) so this stays presentational.
import { useEditor } from "../state/editorStore";
import { restoreRecovery, discardRecovery } from "../app/commands";

export function RecoveryBanner(): React.ReactElement | null {
  const pending = useEditor((s) => s.pendingRecovery);
  if (pending === null) return null;
  const n = pending.objects.length;
  const label = pending.name.trim() || "Untitled project";

  return (
    <div className="pct-recovery" role="alert">
      <span className="pct-recovery-msg">
        Recovered unsaved work from your last session — <strong>{label}</strong> ({n}{" "}
        {n === 1 ? "object" : "objects"}).
      </span>
      <span className="pct-recovery-actions">
        <button type="button" className="pct-primary" onClick={restoreRecovery}>
          Restore
        </button>
        <button type="button" onClick={discardRecovery}>
          Discard
        </button>
      </span>
    </div>
  );
}
