// TopBar.tsx — the spanning top bar (design §5): brand · editable project name · dirty dot ·
// [New][Open][Save] │ [Export POI…] │ [Rescan]. (Settings is M2 — hidden, see below.) Undo/redo and edit verbs are keyboard-only
// (added in M1e-5c), not buttons. New/Open/Save delegate to app/commands.ts; Export/Rescan are handed
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

      <span className="pct-divider" />
      <button type="button" onClick={onExport} disabled={!onExport}>
        Export POI…
      </button>
      {/* The second thing a project can become (forum #160): an airport you can start a flight from,
          installed into scenery/airports. Beside Export because it is a sibling output, not a step of it.
          HELIPORT shouted, at ApfelFlieger's request (#172): he first wanted "Export AIRPORT…", then
          argued himself out of it — "since only a heliport can be created at the moment, HELIPORT fits
          better" — and the capitals are what separate this from Export POI… at a glance. */}
      <button
        type="button"
        onClick={onHeliport}
        disabled={!onHeliport || !pct}
        title={pct ? "Install this project as a heliport you can fly from" : NO_PCT}
      >
        Create HELIPORT…
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
