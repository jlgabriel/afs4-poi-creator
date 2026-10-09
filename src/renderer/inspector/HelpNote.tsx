// HelpNote.tsx — a field's explanation, folded away behind a question mark.
//
// The airport panels grew a paragraph per submenu plus a line per field, each worth reading exactly once;
// after that they are furniture between the user and the numbers. Worse, furniture of DIFFERENT HEIGHTS,
// so switching between two elements reshuffles everything below them. A note behind a "?" fixes both.
//
// ★ WHAT DOES *NOT* FOLD, and this is the whole judgement in this file. Only EXPLANATIONS go behind the
// button — text that would read the same on a screenshot of an empty project. Three kinds stay in plain
// sight, because they are answers to something the user just did and hiding those would be hiding the
// thing they asked for:
//
//   • validation ("PCT001 is already an airport on this machine") — .pct-warn, never folded;
//   • live readouts (the name's character count, a runway's length and bearing, metres of rope);
//   • state ("Not on the map yet", "this project is on sim autoheight") — which is why a field is
//     missing or a button is there, not what the field means.
import { useState } from "react";

/** The question mark and the note it opens. Drop it INSIDE a `.pct-field-label`, after the label text —
 *  the note styles itself onto its own line under the label, so the field's own layout never moves. */
export function Help({ children }: { children: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="pct-help"
        aria-expanded={open}
        aria-label={open ? "Hide the note" : "Show the note"}
        title={open ? "Hide the note" : "What is this?"}
        // ★ preventDefault, and it is not decoration: most of these labels WRAP their input, so without
        // it the browser forwards this click to the field — asking what a box means would put the cursor
        // in it, and on a <select> it would open the menu.
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && <span className="pct-help-note">{children}</span>}
    </>
  );
}
