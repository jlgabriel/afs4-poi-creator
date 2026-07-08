// NumberInput.tsx — a controlled numeric field with a local draft: it shows the store value formatted,
// but while the user types it holds a raw string and only commits (parsed) on blur / Enter — Escape
// reverts. This keeps every keystroke out of the undo stack (one edit = one commit) and avoids the
// store fighting the caret. Shared by the Inspector's lon/lat/direction and the HeightControl metres.
import { useState } from "react";

interface NumberInputProps {
  value: number;
  onCommit: (n: number) => void;
  format?: (n: number) => string; // how the committed value is displayed when not being edited
  id?: string;
  ariaLabel?: string;
}

export function NumberInput({ value, onCommit, format, id, ariaLabel }: NumberInputProps): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (format ? format(value) : String(value));

  const commit = (): void => {
    if (draft === null) return;
    const n = Number.parseFloat(draft);
    if (!Number.isNaN(n) && n !== value) onCommit(n);
    setDraft(null);
  };

  return (
    <input
      className="pct-num"
      type="text"
      inputMode="decimal"
      id={id}
      aria-label={ariaLabel}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        // Revert on Escape: drop the draft, but do NOT blur() — blur fires onBlur=commit synchronously
        // with the still-stale draft (setDraft(null) hasn't applied yet), which would COMMIT instead of
        // revert (P1-1). Matches TopBar's ProjectNameField. Focus stays; the field shows the store value.
        else if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}
