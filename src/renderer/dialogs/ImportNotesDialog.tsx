// ImportNotesDialog.tsx — what the last Import TAP filled in or left out, one note per line.
//
// An in-app modal rather than an alert, for the same reason as RegisterDialog: a native alert does not
// scroll, so a long list had to be cut short. Here every note is listed and the list scrolls. It is also a
// worklist for correcting the .tap, so it can be copied out and opened again from the top bar
// (state/importNotes.ts keeps it for the session).
import { useEffect } from "react";
import { showImportNotes, useImportNotes } from "../state/importNotes";
import { CopyList } from "./RegisterDialog";

export function ImportNotesDialog(): React.ReactElement | null {
  const last = useImportNotes((s) => s.last);
  const open = useImportNotes((s) => s.open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") showImportNotes(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open || last === null) return null;
  const n = last.notes.length;
  const close = (): void => showImportNotes(false);

  return (
    <div className="pct-modal" role="dialog" aria-label="Import notes" aria-modal="true">
      <div className="pct-modal-card pct-import-notes">
        <div className="pct-modal-head">
          <h2>
            {last.fileName} — {n} note{n === 1 ? "" : "s"}
          </h2>
          <button className="pct-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>
        <p className="pct-field-meta">
          What the import filled in with PCT's defaults or left out. Correct the .tap and import it again, or
          fix the values here in PCT. <strong>Import notes</strong> in the top bar opens this list again.
        </p>
        <ul className="pct-reg-list pct-import-notes-list">
          {last.notes.map((note, i) => (
            <li key={i} className="pct-reg-row">
              {note}
            </li>
          ))}
        </ul>
        <div className="pct-modal-actions">
          <CopyList lines={[...last.notes]} />
          <span className="pct-spacer" />
          <button type="button" className="pct-primary" onClick={close}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
