// TopBar.tsx — the spanning top bar (design §5): brand · editable project name · dirty dot ·
// [New][Open][Save] │ [Undo][Redo] │ [Export /poi…] │ [Rescan]. (Settings is M2 — hidden, see below.)
// Undo/redo were keyboard-only from M1e-5c until v1.5, when ApfelFlieger pointed out the obvious (#253c):
// a shortcut nobody can see is a feature only its author has. The other edit verbs are still chords.
// New/Open/Save delegate to app/commands.ts; Export/Rescan are handed
// down as callbacks by AppShell (wired in M1e-5f / M1e-5e) so the button is disabled until its step
// lands. IPC-backed buttons disable in the browser preview (no bridge).
import { useState } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import type { HeightMode } from "../../core/project/types";
import { hasPct } from "../app/pct";
import { doNew, doOpen, doSave, doSaveAs, setTileProvider } from "../app/commands";
import { PROVIDER_LABEL, type TileProvider } from "../map/tileProviders";
import { AirportSearch } from "./AirportSearch";

const NO_PCT = "Not available in browser preview";

/** The guide lives in the repo, never in the app: a copy shipped inside a build goes stale against the
 *  next release, and `main` always carries the current one. main/index.ts denies the popup and hands the
 *  URL to shell.openExternal, so this opens the OS browser when packaged — and a plain tab in the browser
 *  preview. Nothing here needs the IPC bridge, so unlike its neighbours the button never disables. */
const GUIDE_URL = "https://github.com/jlgabriel/afs4-poi-creator/blob/main/guide/GUIDE.md";

/** Filename of the open project.json (main owns the real path; this is display-only, P0-2). */
const basename = (p: string): string => p.split(/[\\/]/).pop() || p;

/** Quick map-style switch (design §4): Satellite (Esri) / Streets (OSM) / Custom, so the user can flip
 *  when Esri lacks imagery in an area — without opening Settings. Custom is enabled only once a URL is
 *  configured there. Each click swaps the map live and persists the choice (setTileProvider). */
function MapStyleSwitch(): React.ReactElement {
  const provider = useEditor((s) => s.tiles.provider);
  const hasCustomUrl = useEditor((s) => Boolean(s.tiles.customUrl));
  const options: TileProvider[] = ["esri", "osm", "custom"];
  return (
    <div className="pct-tileswitch" role="group" aria-label="Map style">
      {options.map((p) => {
        const disabled = p === "custom" && !hasCustomUrl;
        return (
          <button
            key={p}
            type="button"
            className={provider === p ? "on" : undefined}
            aria-pressed={provider === p}
            disabled={disabled}
            title={disabled ? "Set a custom tile URL in Settings" : `${PROVIDER_LABEL[p]} map`}
            onClick={() => setTileProvider(p)}
          >
            {PROVIDER_LABEL[p]}
          </button>
        );
      })}
    </div>
  );
}

/** Height-mode switch (forum #142/#148, chrispriv): the PROJECT-level choice of how object heights export —
 *  Baked ASL (default: absolute elevations, may look up terrain online) or Sim autoheight (beta: the sim
 *  grounds each object, fully offline). Kept in the bar, not just the Export dialog, so the choice is
 *  visible at all times and the inspector's Height control reflects it from the first object placed
 *  ("display it in the GUI for informational purposes", chrispriv #148). One source of truth: the document
 *  (setHeightMode), so the Export dialog's radios and this switch always agree. */
function HeightModeSwitch(): React.ReactElement {
  const mode: HeightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";
  const set = (m: HeightMode): void => editorStore.getState().setHeightMode(m);
  const modes: { m: HeightMode; label: string; title: string }[] = [
    { m: "baked-asl", label: "Baked ASL", title: "Absolute elevations — looks up terrain (may go online). The default." },
    { m: "autoheight", label: "Autoheight", title: "Sim autoheight (beta) — objects follow the terrain; fully offline export." },
  ];
  return (
    <div className="pct-barfield">
      <span className="pct-barfield-label" title="How object heights export — applies to the whole project">
        Heights:
      </span>
      <div className="pct-tileswitch" role="group" aria-label="Height mode">
        {modes.map(({ m, label, title }) => (
          <button
            key={m}
            type="button"
            className={mode === m ? "on" : undefined}
            aria-pressed={mode === m}
            title={title}
            onClick={() => set(m)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  onHeliport?: () => void; // forum #160
  onRescan?: () => void; // wired in M1e-5e
  onSettings?: () => void; // wired in M2h
}

export function TopBar({ onExport, onHeliport, onRescan, onSettings }: TopBarProps): React.ReactElement {
  const dirty = useEditor((s) => s.dirty);
  const objCount = useEditor((s) => s.project.objects.length);
  const projectPath = useEditor((s) => s.projectPath);
  // Depth, not the arrays: subscribing to the stacks themselves would re-render the whole toolbar on
  // every commit, and all the buttons need to know is whether there is one.
  const canUndo = useEditor((s) => s.undoStack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const pct = hasPct();

  return (
    <header className="pct-topbar">
      <span className="pct-brand">PCT</span>
      <ProjectNameField />
      <span className={dirty ? "pct-dirty on" : "pct-dirty"} title={dirty ? "Unsaved changes" : "Saved"}>
        ●
      </span>
      {projectPath !== null && (
        <span className="pct-filepath" title={projectPath}>
          {basename(projectPath)}
        </span>
      )}

      <button type="button" onClick={doNew}>
        New
      </button>
      <button type="button" onClick={() => void doOpen()} disabled={!pct} title={pct ? undefined : NO_PCT}>
        Open
      </button>
      <button type="button" onClick={() => void doSave()} disabled={!pct} title={pct ? undefined : NO_PCT}>
        Save
      </button>
      <button
        type="button"
        onClick={() => void doSaveAs()}
        disabled={!pct}
        title={pct ? "Save under a new file" : NO_PCT}
      >
        Save As…
      </button>

      {/* ★ UNDO AND REDO ARE BUTTONS SINCE v1.5 (forum #253c). They have worked as chords since M1e-5c
          and the toolbar comment above still says "keyboard-only, not buttons" for a reason that stopped
          holding the moment someone tested PCT without reading anything: "In addition, there should
          somehow be a visible function of being able to take a step back. CMD+Z works, which is very
          good, but not all users know that."

          A shortcut nobody can see is a feature only the author has. These sit beside Save because that
          is the group of things that act on the DOCUMENT as a whole, and they disable when their stack is
          empty — which is also the only readout in the window of whether there is anything to go back to. */}
      <span className="pct-divider" />
      <button
        type="button"
        onClick={() => editorStore.getState().undo()}
        disabled={!canUndo}
        title={canUndo ? "Undo (Ctrl+Z)" : "Nothing to undo"}
      >
        ↶ Undo
      </button>
      <button
        type="button"
        onClick={() => editorStore.getState().redo()}
        disabled={!canRedo}
        title={canRedo ? "Redo (Ctrl+Shift+Z)" : "Nothing to redo"}
      >
        ↷ Redo
      </button>

      <span className="pct-divider" />
      {/* ★ THE TWO OUTPUT BUTTONS NAME THEIR DESTINATION (v1.8, forum #296). This one said "Export POI…",
          and he asked the only question a name like that leaves open: "What is being exported where?" His
          own answer is that the user does not care what PCT calls its output — only that something is
          written, and into which of the two folders under the sim's own `scenery`. So the folder IS the
          name. Short form on the button, where the toolbar has no room for a path; long form in the
          tooltip, where it does. */}
      <button
        type="button"
        onClick={onExport}
        disabled={!onExport}
        title="Export to '…FS 4/scenery/poi' — scenery you fly to"
      >
        Export /poi…
      </button>
      {/* The second thing a project can become (forum #160): an airport you can start a flight from,
          installed into scenery/airports. Beside Export because it is a sibling output, not a step of it.
          HELIPORT shouted, at ApfelFlieger's request (#172): he first wanted "Export AIRPORT…", then
          argued himself out of it — "since only a heliport can be created at the moment, HELIPORT fits
          better" — and the capitals are what separate this from Export POI… at a glance.

          v1.3 changes the VERB, because the button's job changed: creating the heliport now starts at
          the catalog's Start - Helicopter card (#173), so what is left behind this button is the install.
          "Create" would now name something that happens somewhere else.

          v1.8 retires BOTH halves (#296). The noun goes because "only a heliport can be created" stopped
          being true at v1.4 — runways, parking, aerotow and winch launches all live behind this button
          now. The verb goes because he no longer wants the two outputs told apart by what they ARE, but
          by where they LAND. Nothing about the shouting is lost: /airports and /poi differ far more than
          POI and HELIPORT ever did. */}
      <button
        type="button"
        onClick={onHeliport}
        disabled={!onHeliport || !pct}
        title={pct ? "Export to '…FS 4/scenery/airports' — an airport you can start a flight from" : NO_PCT}
      >
        Export /airports…
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
      <button type="button" onClick={onSettings} disabled={!onSettings}>
        Settings
      </button>
      <button
        type="button"
        onClick={() => window.open(GUIDE_URL, "_blank", "noopener")}
        title="Open the PCT guide in your browser — leaves the app"
      >
        Help{" "}
        <span className="pct-external" aria-hidden="true">
          ↗
        </span>
      </button>

      <span className="pct-spacer" />
      <AirportSearch />
      <HeightModeSwitch />
      <MapStyleSwitch />
      <span className="pct-readout">
        {objCount} {objCount === 1 ? "object" : "objects"}
      </span>
    </header>
  );
}
