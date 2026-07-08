// TopBar.tsx — the spanning top bar (design §5): brand · editable project name · dirty dot ·
// [New][Open][Save] │ [Export POI…] │ [Rescan][Settings]. Undo/redo and edit verbs are keyboard-only
// (added in M1e-5c), not buttons. New/Open/Save delegate to app/commands.ts; Export/Rescan are handed
// down as callbacks by AppShell (wired in M1e-5f / M1e-5e) so the button is disabled until its step
// lands. IPC-backed buttons disable in the browser preview (no bridge).
import { useState } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { hasPct } from "../app/pct";
import { doNew, doOpen, doSave } from "../app/commands";

const NO_PCT = "Not available in browser preview";

/** Editable project name — local draft committed on blur/Enter (one undo entry, not one per key). */
function ProjectNameField(): React.ReactElement {
  const name = useEditor((s) => s.project.name);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft !== null && draft !== name) editorStore.getState().renameProject(draft);
    setDraft(null);
  };
  return (
    <input
      className="pct-projname"
      value={draft ?? name}
      placeholder="Untitled project"
      aria-label="Project name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

interface TopBarProps {
  onExport?: () => void; // wired in M1e-5f
  onRescan?: () => void; // wired in M1e-5e
}

export function TopBar({ onExport, onRescan }: TopBarProps): React.ReactElement {
  const dirty = useEditor((s) => s.dirty);
  const objCount = useEditor((s) => s.project.objects.length);
  const pct = hasPct();

  return (
    <header className="pct-topbar">
      <span className="pct-brand">PCT</span>
      <ProjectNameField />
      <span className={dirty ? "pct-dirty on" : "pct-dirty"} title={dirty ? "Unsaved changes" : "Saved"}>
        ●
      </span>

      <button type="button" onClick={doNew}>
        New
      </button>
      <button type="button" onClick={() => void doOpen()} disabled={!pct} title={pct ? undefined : NO_PCT}>
        Open
      </button>
      <button type="button" onClick={() => void doSave()} disabled={!pct} title={pct ? undefined : NO_PCT}>
        Save
      </button>

      <span className="pct-divider" />
      <button type="button" onClick={onExport} disabled={!onExport}>
        Export POI…
      </button>

      <span className="pct-divider" />
      <button
        type="button"
        onClick={onRescan}
        disabled={!onRescan || !pct}
        title={pct ? undefined : NO_PCT}
      >
        Rescan
      </button>
      <button type="button" disabled title="Settings — M2">
        Settings
      </button>

      <span className="pct-spacer" />
      <span className="pct-readout">
        {objCount} {objCount === 1 ? "object" : "objects"}
      </span>
    </header>
  );
}
