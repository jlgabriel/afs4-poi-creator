// RegisterDialog.tsx — the user-XREF registration surface (design B2; forum #125, @ApfelFlieger).
//
// v0.3.x drove this from window.confirm()/alert(), flattening the plan and its result into a single
// string with one bullet per object. That fits the three-pylon case it was built against and breaks on
// the real one: Michael scanned ~2000 objects with only ONE readable, so "can't auto-register" ran to
// ~35 lines — and a native dialog does not scroll. It just grew past the bottom of his screen ("My
// Desktop is to short"). An in-app modal can't do that: .pct-modal-card is already capped at 90vh and
// scrolls, so the list is bounded by the window no matter how many objects the user has.
//
// The skipped list is also not an error list. It's the answer he came for ("I have never been able to
// determine so quickly whether something is XREF-compatible") AND a worklist he then works through by
// hand — so it stays on screen, scrolls, and can be copied out, rather than being a wall to dismiss.
import { useCallback, useEffect, useState } from "react";
import type { XrefRegistrationPlan } from "../../shared/pctApi";
import { editorStore } from "../state/editorStore";
import { getPct } from "../app/pct";

/** What the result view needs. The fresh catalog goes straight into the store, so nothing else survives. */
interface Outcome {
  registered: number;
  warnings: string[];
}

/** Lifts a list out of the app and into the user's editor — the point of the skipped list is that each
 *  line is a job to do by hand, and re-typing 35 filenames off a screen is not a plan. */
function CopyList({ lines }: { lines: string[] }): React.ReactElement | null {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);
  if (lines.length === 0) return null;

  // AWAIT the write before claiming it happened. `navigator.clipboard?.writeText(x); setCopied(true)`
  // reads fine and lies: the `?.` swallows a missing clipboard and a rejected promise is unhandled, so
  // the button says "Copied" whether or not anything was. That is bug I7 exactly — Electron routes
  // clipboard writes through the permission handler, and the Inspector's Copy button spent a release
  // doing nothing while looking like it worked.
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      /* no clipboard, or refused — stay silent rather than claim a copy that didn't happen */
    }
  };

  return (
    <button type="button" className="pct-copy-list" title="Copy this list to the clipboard" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy list"}
    </button>
  );
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

export function RegisterDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const pct = getPct();
  const [plan, setPlan] = useState<XrefRegistrationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Plan as soon as the dialog opens. It's READ-ONLY and main re-plans authoritatively before writing
  // anything (P0-2), so this preview costs nothing and the user sees the whole job before agreeing to it.
  useEffect(() => {
    if (!pct) return undefined;
    let live = true;
    void pct.planXrefRegistration().then((res) => {
      if (!live) return;
      if (res.ok) setPlan(res.value);
      else setError(res.error.message);
    });
    return () => {
      live = false;
    };
  }, [pct]);

  const run = useCallback(async (): Promise<void> => {
    if (!pct) return;
    setBusy(true);
    setError(null);
    try {
      const res = await pct.registerXref();
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      editorStore.getState().loadCatalog(res.value.scan.catalog); // now-resolvable objects become placeable
      setOutcome({ registered: res.value.registered, warnings: res.value.warnings });
    } finally {
      setBusy(false);
    }
  }, [pct]);

  const skipped = plan?.skipped ?? [];
  const registerable = plan?.registerable ?? [];

  return (
    <div className="pct-modal" role="dialog" aria-label="Register user objects" aria-modal="true">
      <div className="pct-modal-card">
        <div className="pct-modal-head">
          <h2>Register user objects</h2>
          {/* Locked while main is writing into scenery/xref — closing wouldn't cancel the write, it would
              only remove the surface that reports what happened (the ExportDialog rationale). */}
          <button className="pct-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        {outcome !== null ? (
          <>
            <p className="pct-ok">
              Registered {outcome.registered} {plural(outcome.registered, "object")}.
            </p>
            {outcome.registered > 0 && (
              <p>
                <strong>Restart Aerofly FS 4</strong> before flying to a POI that uses them.
              </p>
            )}
            {outcome.warnings.length > 0 && (
              <>
                <div className="pct-reg-head">
                  <span className="pct-field-label">
                    {outcome.warnings.length} {plural(outcome.warnings.length, "note")}
                  </span>
                  <CopyList lines={outcome.warnings} />
                </div>
                <ul className="pct-reg-list">
                  {outcome.warnings.map((w) => (
                    <li key={w} className="pct-reg-row pct-warn">
                      {w}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="pct-modal-actions">
              <span className="pct-spacer" />
              <button className="pct-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            {plan === null && error === null && <p className="pct-empty">Reading scenery/xref…</p>}

            {registerable.length > 0 && (
              <>
                <div className="pct-reg-head">
                  <span className="pct-field-label">
                    Will be registered — {registerable.length} {plural(registerable.length, "bundle")}
                  </span>
                </div>
                <ul className="pct-reg-list">
                  {registerable.map((b) => (
                    <li key={b.base} className="pct-reg-row">
                      <code className="pct-path">{b.base}</code>{" "}
                      <span className="pct-field-meta">
                        {b.geometries} {plural(b.geometries, "object")}
                        {b.ttx > 0 && `, ${b.ttx} ${plural(b.ttx, "texture")}`}
                      </span>
                      {b.missingTextures.length > 0 && (
                        <div className="pct-warn">
                          missing {plural(b.missingTextures.length, "texture")}:{" "}
                          {b.missingTextures.join(", ")} — it may render untextured
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {skipped.length > 0 && (
              <>
                <div className="pct-reg-head">
                  <span className="pct-field-label">
                    Can&apos;t be read — {skipped.length} {plural(skipped.length, "file")}
                  </span>
                  <CopyList lines={skipped.map((s) => `${s.name} — ${s.reason}`)} />
                </div>
                <ul className="pct-reg-list">
                  {skipped.map((s) => (
                    <li key={s.name} className="pct-reg-row">
                      <code className="pct-path">{s.name}</code>
                      <div className="pct-field-meta">{s.reason}</div>
                    </li>
                  ))}
                </ul>
                {/* Not a failure of PCT and not something the user can fix in PCT: an IPACS-compiled `.tmb`
                    keeps its name and bbox in a format we can't read, and PCT ships zero model bytes. Say
                    so, because "can't be read" next to 35 filenames otherwise reads as a bug. */}
                <p className="pct-field-meta">
                  These are compiled (binary) models — their internal name and size aren&apos;t readable, so
                  PCT can&apos;t write an index for them. They still work if you index them by hand.
                </p>
              </>
            )}

            {plan !== null && registerable.length === 0 && skipped.length === 0 && (
              <p className="pct-empty">Nothing in scenery/xref needs registering.</p>
            )}

            {error !== null && <p className="pct-warn">{error}</p>}

            <div className="pct-modal-actions">
              <button onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <span className="pct-spacer" />
              <button
                className="pct-primary"
                disabled={busy || !pct || registerable.length === 0}
                title={pct ? undefined : "Registration runs in the desktop app"}
                onClick={() => void run()}
              >
                {busy
                  ? "Registering…"
                  : `Register ${registerable.length} ${plural(registerable.length, "bundle")}`}
              </button>
            </div>
            {registerable.length > 0 && (
              <p className="pct-field-meta">
                Each bundle gets a generated <code>.tmi</code> index so Aerofly can resolve it. A folder is
                indexed in place; a loose <code>.tmb</code> moves into its own subfolder.
              </p>
            )}
            {!pct && <p className="pct-empty">Registration runs in the desktop app (npm run dev).</p>}
          </>
        )}
      </div>
    </div>
  );
}
