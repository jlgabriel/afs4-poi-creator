// FootprintDialog.tsx — type in what an object actually measures (v0.9).
//
// Reached from the same right-click menu as the photo actions, and for the same reason: the card already
// knows exactly which object it names, so the measurement lands under the right key with zero typing of
// names. What the user supplies is three numbers in metres — the reading you get holding the model up
// against a 1 × 1 × 1 m cube, which is how ApfelFlieger produced the Runway Approach figures in #129.
//
// Three things this dialog says out loud, because each is a real limit rather than a detail:
//   • the numbers are the user's own and stay on their disk (`footprints.json` in userData);
//   • they never reach the sim — a POI `.toc` has no footprint field, so this is an EDITOR drawing and
//     nothing else. Nobody should expect a rescaled object in the sim from typing here;
//   • height doesn't change the map. The footprint is a ground polygon. It's stored because it's part of
//     the measurement and it reads on the card, and for nothing else.
import { useMemo, useState } from "react";
import type { Catalog } from "../../core/project/types";
import type { PhotoSubject } from "../../core/catalog/photoKey";
import type { FootprintOverride } from "../../core/catalog/footprints";
import { MAX_FOOTPRINT_M } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { getPct } from "../app/pct";
import type { CardPhoto } from "../catalog/cardPhoto";
import { sizeLabel, type Size3 } from "../catalog/sizeLabel";

/** What the SCAN says about this object, before any override — shown as the reference the user is
 *  departing from, and used to prefill the fields. Read from the raw catalog on purpose: reading the
 *  overridden one would show the user their own last answer as if it were the scanner's, which is the
 *  one thing this line exists to distinguish. Null for every light and plant (they have no scanned size
 *  at all — that is the whole problem) and for an opaque user `.tmb`. */
function scannedSize(subject: PhotoSubject, raw: Catalog | null): Size3 | null {
  if (raw === null || subject.kind !== "xref") return null;
  const o = raw.xref.find((x) => x.name === subject.name);
  return o === undefined || o.sizeUnknown === true ? null : o.size;
}

/** Parse a field. Returns null for anything that isn't a usable number, so the caller can refuse to save
 *  rather than writing a NaN into a file the loader would then reject. */
function num(text: string): number | null {
  const v = Number(text.trim().replace(",", ".")); // a comma decimal is what half the forum types
  return text.trim() !== "" && Number.isFinite(v) ? v : null;
}

export function FootprintDialog({
  card,
  onClose,
}: {
  card: CardPhoto;
  onClose: () => void;
}): React.ReactElement {
  const pct = getPct();
  const current = useEditor((s) => s.footprints.entries[card.photoName]);
  const catalogRaw = useEditor((s) => s.catalogRaw);
  const scanned = useMemo(() => scannedSize(card.subject, catalogRaw), [card.subject, catalogRaw]);

  // Prefill from the override if there is one, else from the scan, else blank. Captured ONCE (useState
  // initialisers): the fields are the user's to edit from here, and a store update mid-edit must not
  // reach in and rewrite what they are typing.
  const start = current ?? (scanned ? { width: scanned.x, depth: scanned.y, height: scanned.z } : null);
  const [width, setWidth] = useState(start ? String(start.width) : "");
  const [depth, setDepth] = useState(start ? String(start.depth) : "");
  const [height, setHeight] = useState(start ? String(start.height) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const w = num(width);
  const d = num(depth);
  const h = num(height);
  const tooBig = [w, d, h].some((v) => v !== null && v > MAX_FOOTPRINT_M);
  // Width and depth must be positive — a zero draws nothing, which is the state the user came here to
  // leave. Height may be 0: a painted marking or an inset light is flat and still has a footprint.
  const valid = w !== null && w > 0 && d !== null && d > 0 && h !== null && h >= 0 && !tooBig;

  const save = async (): Promise<void> => {
    if (pct === null || !valid || busy) return;
    const override: FootprintOverride = { width: w, depth: d, height: h };
    if (note.trim() !== "") override.note = note.trim();
    setBusy(true);
    setError(null);
    const r = await pct.setFootprint(card.photoName, override);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    editorStore.getState().setFootprints(r.value); // re-derives the catalog → the map redraws at once
    onClose();
  };

  const clear = async (): Promise<void> => {
    if (pct === null || busy) return;
    setBusy(true);
    setError(null);
    const r = await pct.setFootprint(card.photoName, null);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.message);
      return;
    }
    editorStore.getState().setFootprints(r.value);
    onClose();
  };

  return (
    <div className="pct-modal" role="dialog" aria-label="Edit footprint" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Footprint — {card.displayName}</h2>
          <button className="pct-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="pct-field-meta">
          Measure the object and type its size here; PCT then draws it on the map at that size instead of
          as a bare point. Airport lights and plants have no size in your install for PCT to read, so this
          is the only way they can get one.
        </p>

        <div className="pct-field pct-field-col">
          <span className="pct-field-label">Size in metres</span>
          <div className="pct-footprint-row">
            <label>
              <span>Width (X)</span>
              <input
                className="pct-text"
                inputMode="decimal"
                value={width}
                placeholder="2.0"
                onChange={(e) => setWidth(e.target.value)}
              />
            </label>
            <label>
              <span>Depth (Y)</span>
              <input
                className="pct-text"
                inputMode="decimal"
                value={depth}
                placeholder="0.5"
                onChange={(e) => setDepth(e.target.value)}
              />
            </label>
            <label>
              <span>Height (Z)</span>
              <input
                className="pct-text"
                inputMode="decimal"
                value={height}
                placeholder="4.0"
                onChange={(e) => setHeight(e.target.value)}
              />
            </label>
          </div>
          <span className="pct-field-meta">
            The box is centred on the object's anchor, and <strong>X runs along the facing arrow</strong>{" "}
            the map draws. If the box comes out turned 90°, swap width and depth. Height is kept with the
            measurement but does not change the map — a footprint is a ground outline.
          </span>
          {scanned !== null && (
            <span className="pct-field-meta">
              Your install scans this object as <code>{sizeLabel(scanned)}</code>. Whatever you enter here
              replaces that.
            </span>
          )}
          {tooBig && <span className="pct-warn">Each dimension must be {MAX_FOOTPRINT_M} m or less.</span>}
        </div>

        <div className="pct-field pct-field-col">
          <span className="pct-field-label">Note (optional)</span>
          <input
            className="pct-text"
            value={note}
            placeholder="How it was measured, or who measured it"
            aria-label="Note"
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="pct-field-meta">
            Travels with the measurement when you export your footprints — it is the only provenance a
            shared file carries.
          </span>
        </div>

        <p className="pct-field-meta">
          Saved in your own <code>footprints.json</code>, so rescanning your install never clears it.{" "}
          <strong>Nothing here is exported into a POI</strong> — the Aerofly format has no footprint field;
          this only changes what PCT draws while you place things.
        </p>

        {error !== null && <p className="pct-warn">{error}</p>}
        {!pct && <p className="pct-empty">Editing footprints needs the desktop app (npm run dev).</p>}

        <div className="pct-modal-actions">
          <button onClick={onClose}>Cancel</button>
          {current !== undefined && (
            <button type="button" disabled={!pct || busy} onClick={() => void clear()}>
              Remove measurement
            </button>
          )}
          <span className="pct-spacer" />
          <button
            className="pct-primary"
            disabled={!pct || busy || !valid}
            title={pct ? undefined : "Editing footprints needs the desktop app"}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
