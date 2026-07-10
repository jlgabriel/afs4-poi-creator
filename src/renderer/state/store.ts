// store.ts — the editor's Zustand store (design §3.6), built to the Fable review P1-4 contract.
//
// The store is a thin, testable shell around the PURE mutations in core/project/mutate.ts. The whole
// point of P1-4 is discipline about WHAT is a document change vs. what is transient:
//
//   DOCUMENT state — project / projectPath / dirty / undo+redo. Only these get snapshotted, dirtied,
//     and autosaved. EVERY document edit funnels through the single `commit()` chokepoint so undo /
//     dirty / autosave can never be forgotten.
//   EPHEMERAL state — selection / placing / filter / the LIVE map camera / a per-object resolved
//     terrain cache. Never on the undo stack, never autosaved. The live camera is the subtle one:
//     it is captured INTO the document only at save time (serializeProject), never mutated on pan —
//     otherwise merely looking around the map lights the "unsaved changes" dot.
//
// Two more P1-4 rules: gesture-end commits only (the map does live drag PREVIEW without touching the
// store; it calls moveObject once on drag-end), and ±nudges COALESCE — holding an arrow is one undo
// entry, not dozens (commitCoalesced). Kept free of DOM globals so it unit-tests under the node
// config; the DOM-coupled singleton + autosave sink live in editorStore.ts.

import { createStore, type Mutate, type StoreApi } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Catalog,
  CatalogObject,
  HeightSpec,
  LonLat,
  PlacedXref,
  PoiShift,
  Project,
  Settings,
} from "../../core/project/types";
import type { Airport } from "../../core/airports/types";
import { destination } from "../../core/geo/geo";
import * as mutate from "../../core/project/mutate";

export type Camera = Project["camera"];
/** The map tile config the renderer needs (a view of Settings.tiles). Held in the store so MapView can
 *  swap the tile layer live when Settings changes it, without a full remount. */
export type TilesConfig = Settings["tiles"];
export const DEFAULT_TILES: TilesConfig = { provider: "esri" };
export interface Filter {
  query: string;
  category: string | null;
}

const UNDO_CAP = 50; // design §3.6: snapshot stacks capped at 50
/** The blank-project world view (new project before the user navigates). Exported for the shell's
 *  New / bootstrap paths so they don't duplicate the literal. */
export const DEFAULT_CAMERA: Camera = { lon: 0, lat: 20, zoom: 2 };

/** flyTo target zoom for an airport pick: wide enough to frame the whole field/runway. The default
 *  flyTo zoom (≥17) is object-placement close — too tight to see an airport — so the airport search
 *  passes this instead. */
export const AIRPORT_ZOOM = 13;

const capUndo = (stack: Project[]): Project[] =>
  stack.length > UNDO_CAP ? stack.slice(stack.length - UNDO_CAP) : stack;

const sameCamera = (a: Camera, b: Camera): boolean =>
  a.lon === b.lon && a.lat === b.lat && a.zoom === b.zoom;

/** The project as it should be SERIALIZED: the live map camera stamped into the document. This is
 *  the one place the ephemeral camera meets the saved file (autosave + Save both go through it). */
export function serializeProject(s: Pick<EditorState, "project" | "mapView">): Project {
  return sameCamera(s.project.camera, s.mapView) ? s.project : { ...s.project, camera: s.mapView };
}

/** Advance one HeightSpec by `delta` metres. The first nudge on a "terrain" object PROMOTES it to
 *  "terrain-offset" (Fable P2-8: the promotion is silent but its result — "Terrain + 0.50 m" — is
 *  visible in the inspector). */
function nudgeHeightSpec(h: HeightSpec, delta: number): HeightSpec {
  switch (h.mode) {
    case "asl":
      return { mode: "asl", value: h.value + delta };
    case "terrain":
      return { mode: "terrain-offset", offset: delta };
    case "terrain-offset":
      return { mode: "terrain-offset", offset: h.offset + delta };
  }
}

export interface EditorState {
  // ── reference data (loaded, not part of the document) ──
  catalog: Catalog | null;
  catalogIndex: Map<string, CatalogObject>; // by exact name
  airports: Airport[]; // sim airport list (bundled), for the TopBar search → flyTo; never saved
  tiles: TilesConfig; // map tile provider (from Settings); MapView subscribes → live tile swap

  // ── DOCUMENT (snapshotted / dirtied / autosaved) ──
  project: Project;
  projectPath: string | null; // display-only; main owns the real path (P0-2)
  dirty: boolean;
  undoStack: Project[];
  redoStack: Project[];

  // ── EPHEMERAL (never undo, never autosaved) ──
  selection: string[]; // placed-object ids (multi-select ready)
  placing: string | null; // catalog name armed for click-to-place
  filter: Filter;
  mapView: Camera; // the LIVE camera; stamped into the document only at save
  cameraEpoch: number; // bumps on document load (open/new) → MapView re-centers; pan never bumps it
  resolvedElev: Map<string, number>; // id → terrain ASL under it, for the inspector; drop on move
  pendingRecovery: Project | null; // a crash-recovery shadow found at boot, awaiting Restore/Discard

  // ── low-level (exposed for the map layer + tests) ──
  commit: (fn: (p: Project) => Project) => void;
  commitCoalesced: (key: string, fn: (p: Project) => Project) => void;
  serialize: () => Project;

  // ── lifecycle ──
  loadCatalog: (catalog: Catalog) => void;
  loadAirports: (airports: Airport[]) => void;
  setTiles: (tiles: TilesConfig) => void;
  openProject: (path: string | null, project: Project) => void;
  newProject: (project: Project) => void;
  recoverProject: (project: Project) => void; // load a crash-recovery shadow as UNSAVED (dirty) work
  markSaved: (path: string | null) => void;

  // ── selection / placement / filter (ephemeral) ──
  select: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;
  armPlacement: (name: string | null) => void;
  setFilter: (patch: Partial<Filter>) => void;
  placeAt: (p: LonLat) => void;

  // ── document mutations (gesture-end / explicit — drag PREVIEW never hits the store) ──
  moveObject: (id: string, p: LonLat) => void;
  nudgePosition: (id: string, deltaM: number, bearingDeg: number) => void;
  rotateObject: (id: string, deg: number) => void;
  scaleObject: (id: string, f: number) => void;
  setHeight: (id: string, h: HeightSpec) => void;
  nudgeHeight: (id: string, deltaM: number) => void;
  setLabel: (id: string, label: string | undefined) => void;
  setLocked: (id: string, locked: boolean) => void;
  setReference: (ref: LonLat | null) => void;
  renameProject: (name: string) => void;
  setPoiName: (poiName: string) => void;
  setShift: (shift: PoiShift) => void;
  duplicateSelection: (offsetM?: number) => void;
  deleteSelection: () => void;

  // ── camera + resolved elevation (ephemeral) ──
  setMapView: (camera: Camera) => void;
  flyTo: (p: LonLat, zoom?: number) => void;
  setResolvedElev: (id: string, terrainAsl: number) => void;
  setPendingRecovery: (project: Project | null) => void;

  // ── history ──
  undo: () => void;
  redo: () => void;
}

// The store type must carry the subscribeWithSelector augmentation, otherwise `.subscribe` collapses
// to the base single-arg overload and the map's selector subscription won't typecheck.
export type EditorStore = Mutate<StoreApi<EditorState>, [["zustand/subscribeWithSelector", never]]>;

export interface EditorDeps {
  now: () => number; // ms clock for nudge coalescing (default Date.now)
  newId: () => string; // uuid for placed/duplicated objects (default crypto.randomUUID)
  persist: (snapshot: Project) => void; // autosave sink (default no-op; editorStore.ts injects real)
  autosaveMs: number; // debounce (default 500)
  coalesceMs: number; // nudge-coalesce window (default 800)
  initialProject: Project;
}

function defaultDeps(): EditorDeps {
  return {
    now: () => Date.now(),
    newId: () => globalThis.crypto.randomUUID(),
    persist: () => {}, // the app injects a real sink (localStorage + main shadow); tests inject a spy
    autosaveMs: 500,
    coalesceMs: 800,
    initialProject: mutate.createProject({ name: "", camera: DEFAULT_CAMERA }),
  };
}

/** Build a fresh editor store. Deps are injectable so unit tests can pin the clock / id / autosave
 *  sink; the renderer singleton in editorStore.ts injects the real persist. */
export function createEditorStore(overrides: Partial<EditorDeps> = {}): EditorStore {
  const deps: EditorDeps = { ...defaultDeps(), ...overrides };

  // Non-reactive closure state: the autosave debounce timer and the current nudge-coalescing run.
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let coalesce: { key: string; at: number } | null = null;

  return createStore<EditorState>()(
    subscribeWithSelector((set, get) => {
      const scheduleAutosave = (): void => {
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => {
          autosaveTimer = null;
          deps.persist(serializeProject(get()));
        }, deps.autosaveMs);
      };
      // Drop a pending autosave so it can't fire AFTER a save/load and resurrect a stale shadow (the
      // false-recovery bug). markSaved + load call this; the shadow's lifecycle is then owned by the
      // explicit save/new/open path (commands.ts clears it) and fresh edits re-arm autosave.
      const cancelAutosave = (): void => {
        if (autosaveTimer) {
          clearTimeout(autosaveTimer);
          autosaveTimer = null;
        }
      };

      // THE chokepoint: push prev → set next → dirty → clear redo → autosave. A no-op transform
      // (mutate.ts returns the same reference) changes nothing and never pollutes the undo stack.
      const commit = (fn: (p: Project) => Project): void => {
        const prev = get().project;
        const next = fn(prev);
        if (next === prev) return;
        coalesce = null; // a real edit ends any nudge-coalescing run
        set((s) => ({
          project: next,
          dirty: true,
          undoStack: capUndo([...s.undoStack, prev]),
          redoStack: [],
        }));
        scheduleAutosave();
      };

      // Like commit, but consecutive calls with the same `key` inside coalesceMs SHARE one undo
      // entry — holding ↑ is one undo step, not dozens (P1-4).
      const commitCoalesced = (key: string, fn: (p: Project) => Project): void => {
        const prev = get().project;
        const next = fn(prev);
        if (next === prev) return;
        const t = deps.now();
        const cont = coalesce !== null && coalesce.key === key && t - coalesce.at <= deps.coalesceMs;
        set((s) => ({
          project: next,
          dirty: true,
          undoStack: cont ? s.undoStack : capUndo([...s.undoStack, prev]),
          redoStack: cont ? s.redoStack : [],
        }));
        coalesce = { key, at: t };
        scheduleAutosave();
      };

      const prune = (project: Project, selection: string[]): string[] => {
        const ids = new Set(project.objects.map((o) => o.id));
        return selection.filter((id) => ids.has(id));
      };

      // The fresh-document reset shared by open/new/recover. `dirty` is false for open/new (the doc
      // matches a saved file or is blank) and true for recover (unsaved work restored from a shadow).
      const load = (project: Project, projectPath: string | null, dirty = false): void => {
        coalesce = null;
        cancelAutosave(); // a pending autosave belonged to the OUTGOING document — don't let it fire
        set((s) => ({
          project,
          projectPath,
          dirty,
          undoStack: [],
          redoStack: [],
          selection: [],
          placing: null,
          resolvedElev: new Map(),
          pendingRecovery: null, // a fresh document clears any recovery banner
          mapView: project.camera,
          cameraEpoch: s.cameraEpoch + 1, // re-center the map on the incoming document (P1-4 / A#4)
        }));
      };

      return {
        catalog: null,
        catalogIndex: new Map(),
        airports: [],
        tiles: DEFAULT_TILES,
        project: deps.initialProject,
        projectPath: null,
        dirty: false,
        undoStack: [],
        redoStack: [],
        selection: [],
        placing: null,
        filter: { query: "", category: null },
        mapView: deps.initialProject.camera,
        cameraEpoch: 0,
        resolvedElev: new Map(),
        pendingRecovery: null,

        commit,
        commitCoalesced,
        serialize: () => serializeProject(get()),

        loadCatalog: (catalog) =>
          set({ catalog, catalogIndex: new Map(catalog.xref.map((o) => [o.name, o])) }),
        loadAirports: (airports) => set({ airports }),
        setTiles: (tiles) => set({ tiles }),
        openProject: (path, project) => load(project, path),
        newProject: (project) => load(project, null),
        recoverProject: (project) => load(project, null, true), // no path yet; unsaved → dirty
        markSaved: (path) => {
          cancelAutosave(); // we just saved — a pending autosave would only rewrite a now-stale shadow
          set((s) => ({ project: serializeProject(s), projectPath: path, dirty: false }));
        },

        select: (ids, additive = false) =>
          set((s) => ({ selection: additive ? [...new Set([...s.selection, ...ids])] : [...ids] })),
        clearSelection: () => set({ selection: [] }),
        armPlacement: (name) => set({ placing: name }),
        setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),

        placeAt: (p) => {
          const name = get().placing;
          if (name === null) return;
          const id = deps.newId();
          commit((proj) => mutate.addObject(proj, mutate.createXref(name, p, { id })));
          set({ selection: [id] }); // select the fresh object; placement stays armed (multi-drop)
        },

        moveObject: (id, p) => {
          commit((proj) => mutate.moveObject(proj, id, p));
          // the object moved → the terrain under it changed → drop its cached elevation (P2-8)
          set((s) => {
            if (!s.resolvedElev.has(id)) return s;
            const resolvedElev = new Map(s.resolvedElev);
            resolvedElev.delete(id);
            return { resolvedElev };
          });
        },
        // Relative move by metres along a compass bearing — the keyboard arrow-nudge (design §5).
        // Coalesces like nudgeHeight so holding an arrow is ONE undo entry, and drops the resolved
        // elevation exactly as moveObject does (same terrain-changed reasoning, P2-8).
        nudgePosition: (id, deltaM, bearingDeg) => {
          commitCoalesced(`${id}:pos`, (proj) => {
            const o = proj.objects.find((x) => x.id === id);
            return o ? mutate.moveObject(proj, id, destination(o.position, deltaM, bearingDeg)) : proj;
          });
          set((s) => {
            if (!s.resolvedElev.has(id)) return s;
            const resolvedElev = new Map(s.resolvedElev);
            resolvedElev.delete(id);
            return { resolvedElev };
          });
        },
        rotateObject: (id, deg) => commit((proj) => mutate.rotateObject(proj, id, deg)),
        scaleObject: (id, f) => commit((proj) => mutate.scaleObject(proj, id, f)),
        setHeight: (id, h) => commit((proj) => mutate.setHeight(proj, id, h)),
        nudgeHeight: (id, deltaM) =>
          commitCoalesced(`${id}:height`, (proj) => {
            const o = proj.objects.find((x) => x.id === id);
            return o ? mutate.setHeight(proj, id, nudgeHeightSpec(o.height, deltaM)) : proj;
          }),
        setLabel: (id, label) => commit((proj) => mutate.setLabel(proj, id, label)),
        setLocked: (id, locked) => commit((proj) => mutate.setLocked(proj, id, locked)),
        setReference: (ref) => commit((proj) => mutate.setReference(proj, ref)),
        renameProject: (name) => commit((proj) => mutate.renameProject(proj, name)),
        setPoiName: (poiName) => commit((proj) => mutate.setPoiName(proj, poiName)),
        setShift: (shift) => commit((proj) => mutate.setShift(proj, shift)),

        duplicateSelection: (offsetM = 5) => {
          const { selection } = get();
          if (selection.length === 0) return;
          const created: string[] = [];
          commit((proj) => {
            let next = proj;
            for (const id of selection) {
              const src = next.objects.find((o) => o.id === id);
              if (!src) continue;
              const nid = deps.newId();
              const position = destination(src.position, offsetM, 90); // default 5 m east
              next = mutate.duplicateObject(next, id, { id: nid, position });
              created.push(nid);
            }
            return next;
          });
          if (created.length > 0) set({ selection: created }); // select the copies
        },

        deleteSelection: () => {
          const { selection } = get();
          if (selection.length === 0) return;
          commit((proj) => {
            let next = proj;
            for (const id of selection) next = mutate.removeObject(next, id);
            return next; // one undo entry for the whole delete
          });
          set({ selection: [] });
        },

        setMapView: (camera) => set({ mapView: camera }),
        // Recenter the map on a point (placed-list double-click; airport search). Reuses the
        // cameraEpoch channel the MapView already watches — a bump means "follow mapView now"; pan/zoom
        // never bump it, so this is the one imperative recenter besides document load. Callers may pass
        // a target zoom (the airport search uses AIRPORT_ZOOM to frame the field); the default zooms in
        // a little if we're far out but never zooms back out.
        flyTo: (p, zoom) =>
          set((s) => ({
            mapView: { lon: p.lon, lat: p.lat, zoom: zoom ?? Math.max(s.mapView.zoom, 17) },
            cameraEpoch: s.cameraEpoch + 1,
          })),
        setResolvedElev: (id, terrainAsl) =>
          set((s) => {
            const resolvedElev = new Map(s.resolvedElev);
            resolvedElev.set(id, terrainAsl);
            return { resolvedElev };
          }),
        setPendingRecovery: (project) => set({ pendingRecovery: project }),

        undo: () => {
          const { undoStack } = get();
          if (undoStack.length === 0) return;
          coalesce = null;
          const prev = undoStack[undoStack.length - 1];
          set((s) => ({
            project: prev,
            undoStack: s.undoStack.slice(0, -1),
            redoStack: [...s.redoStack, s.project],
            selection: prune(prev, s.selection),
            dirty: true,
          }));
          scheduleAutosave();
        },
        redo: () => {
          const { redoStack } = get();
          if (redoStack.length === 0) return;
          coalesce = null;
          const next = redoStack[redoStack.length - 1];
          set((s) => ({
            project: next,
            redoStack: s.redoStack.slice(0, -1),
            undoStack: capUndo([...s.undoStack, s.project]),
            selection: prune(next, s.selection),
            dirty: true,
          }));
          scheduleAutosave();
        },
      };
    }),
  );
}
