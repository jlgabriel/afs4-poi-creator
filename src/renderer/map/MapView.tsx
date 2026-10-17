// MapView.tsx — the Leaflet map, wired to the editor store (design §3.7, Fable P1-5). React owns only
// the <div>; everything Leaflet is created INSIDE the mount effect and torn down in its cleanup, so
// React 19 StrictMode's setup→cleanup→setup is harmless (the second mount would otherwise throw "Map
// container is already initialized"). The store is read via a subscription OUTSIDE React — the map is
// not a React component tree — while the placement cursor is the one thing driven by a React hook.

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { shallow } from "zustand/shallow";
import { editorStore, useEditor } from "../state/editorStore";
import type { MarkKind, TilesConfig } from "../state/store";
import type { LonLat } from "../../core/project/types";
import { wrapLon } from "../../core/geo/geo";
import { tileSourceFor } from "./tileProviders";
import { FootprintLayer } from "./FootprintLayer";
import { HelipadLayer } from "./HelipadLayer";
import { ParkingLayer } from "./ParkingLayer";
import { MarkLayer } from "./MarkLayer";
import { CARLOT_LOOK, GROUNDTEXT_LOOK, JETWAY_LOOK, TAXISIGN_LOOK } from "./markLooks";
import { AirportLayer } from "./AirportLayer";
import { RunwayLayer } from "./RunwayLayer";
import { GliderLayer } from "./GliderLayer";
import { BoundaryLayer } from "./BoundaryLayer";
import { LineLayer, TarmacLayer } from "./SurfaceLayer";
import { DraftLayer } from "./DraftLayer";
import { isShapeKind } from "../state/store";
import { objectGroup, visibleOf, type VisGroup } from "../state/visibility";

/** The tile layer for the current provider (Esri satellite / OSM streets / custom XYZ). Overzoom
 *  (maxNativeZoom < maxZoom) keeps metre-precise placement usable past the source's native resolution.
 *  CSP allows any https host since M2h (main/index.ts), so a custom provider works packaged too. */
function buildTileLayer(tiles: TilesConfig): L.TileLayer {
  const src = tileSourceFor(tiles);
  return L.tileLayer(src.url, { maxNativeZoom: src.maxNativeZoom, maxZoom: 22, attribution: src.attribution });
}

export function MapView(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const placing = useEditor((s) => s.placing);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Read the LIVE camera (mapView), not project.camera, so a remount (StrictMode / Rescan) restores
    // where the user was looking. On a document load the store resets mapView to the new project's
    // camera and bumps cameraEpoch (subscribed below) so the map follows it (Fable P1-4 / A#4).
    const cam0 = editorStore.getState().mapView;
    const map = L.map(el, { attributionControl: true, zoomControl: true }).setView(
      [cam0.lat, cam0.lon],
      cam0.zoom,
    );
    // Tile layer built from the store's tile config; swapped live when Settings changes the provider
    // (subscribed below), so the user sees Esri ↔ custom XYZ without an app restart.
    let tileLayer = buildTileLayer(editorStore.getState().tiles).addTo(map);
    const unsubTiles = editorStore.subscribe(
      (s) => s.tiles,
      (tiles) => {
        tileLayer.remove();
        tileLayer = buildTileLayer(tiles).addTo(map);
      },
    );

    // ★ THE RUNWAYS GO FIRST, and the order is load-bearing. Leaflet stacks LayerGroups in the order they
    // are added, so whatever is created last sits on top and takes the clicks. A runway is a strip
    // hundreds of metres wide that stands, pads and objects are placed ON — created last it would cover
    // all of them and swallow every click meant for something standing on it.
    // ★★ THE SURFACES GO UNDER EVERYTHING, in PANES of their own so the order survives a rebuild (a
    // selected shape is redrawn, and inside one pane that would put it on top). From the bottom: the
    // boundary (it surrounds the whole airport), the tarmacs, the lines — all under the overlay pane
    // (400) where runways and footprints live — and above all of them the editing handles of whichever
    // shape is selected, plus the shape being drawn. styles.css lets clicks through the panes' empty SVG.
    const pane = (name: string, z: number): string => {
      map.createPane(name).style.zIndex = String(z);
      return name;
    };
    const boundaryPane = pane("pctBoundary", 370);
    const tarmacPane = pane("pctTarmac", 380);
    const linePane = pane("pctLines", 390);
    const handlePane = pane("pctShapeHandles", 450);

    const boundary = new BoundaryLayer(map, { shape: boundaryPane, handles: handlePane }, {
      onChange: (points) => editorStore.getState().setAirportBoundary(points),
      onSelect: () => editorStore.getState().selectAirportPart({ kind: "boundary" }),
    });
    const tarmac = new TarmacLayer(map, { shape: tarmacPane, handles: handlePane }, {
      onChange: (id, points) => editorStore.getState().setAirportTarmacPoints(id, points),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "tarmac", id }),
    });
    const line = new LineLayer(map, { shape: linePane, handles: handlePane }, {
      onChange: (id, points) => editorStore.getState().setAirportLinePoints(id, points),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "line", id }),
    });
    const draft = new DraftLayer(map, handlePane);

    const runway = new RunwayLayer(map, {
      onMoveEnd: (id, end, p) => editorStore.getState().moveAirportRunwayEnd(id, end, p),
      onMove: (id, a, b) => editorStore.getState().moveAirportRunway(id, a, b),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "runway", id }),
    });

    const layer = new FootprintLayer(map, {
      onSelect: (id, additive) => editorStore.getState().select([id], additive),
      onMove: (id, p) => editorStore.getState().moveObject(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateObject(id, deg),
    });

    // The helicopter's start pads (a LIST). Their own layer, not
    // footprints: a pad is not a placed object and never joins `selection`. See HelipadLayer.
    const helipad = new HelipadLayer(map, {
      onMove: (id, p) => editorStore.getState().moveAirportPad(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateAirportPad(id, deg),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "pad", id }),
    });

    // The parking positions. Its own layer for the same reason the pad has one — a
    // stand is not a placed object — but a LIST rather than a singleton, because any number can exist.
    const parking = new ParkingLayer(map, {
      onMove: (id, p) => editorStore.getState().moveAirportParking(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateAirportParking(id, deg),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "parking", id }),
    });

    // The ground texts, taxi signs, jetways and car lots: one layer class, one instance per kind (MarkLayer).
    const markCallbacks = (kind: MarkKind) => ({
      onMove: (id: string, p: LonLat) => editorStore.getState().moveAirportMark(kind, id, p),
      onRotate: (id: string, deg: number) => editorStore.getState().rotateAirportMark(kind, id, deg),
      onSelect: (id: string) => editorStore.getState().selectAirportPart({ kind, id }),
    });
    const groundText = new MarkLayer(map, GROUNDTEXT_LOOK, markCallbacks("groundtext"));
    const taxisign = new MarkLayer(map, TAXISIGN_LOOK, markCallbacks("taxisign"));
    const jetway = new MarkLayer(map, JETWAY_LOOK, markCallbacks("jetway"));
    const carlot = new MarkLayer(map, CARLOT_LOOK, markCallbacks("carlot"));

    // The two glider starts. One layer for both — they are one family, and it
    // saves a fourth and fifth copy of the same drag state machine.
    const glider = new GliderLayer(map, {
      onMoveAerotow: (id, p) => editorStore.getState().moveAirportAerotow(id, p),
      onRotateAerotow: (id, deg) => editorStore.getState().rotateAirportAerotow(id, deg),
      onMoveWinchPoint: (id, which, p) => editorStore.getState().moveAirportWinchPoint(id, which, p),
      onMoveWinch: (id, g, w) => editorStore.getState().moveAirportWinch(id, g, w),
      onSelect: (kind, id) => editorStore.getState().selectAirportPart({ kind, id }),
    });

    // The airport's own point. Created LAST so Leaflet stacks it on top: it is one
    // small symbol sitting over whatever the airport is made of, and being under a runway strip would
    // put it out of reach of the cursor.
    const airport = new AirportLayer(map, {
      onMove: (p) => editorStore.getState().moveAirportPosition(p),
      onSelect: () => editorStore.getState().selectAirportPart({ kind: "data" }),
    });

    // Paint now, then re-paint whenever objects / catalog / selection change — subscribed OUTSIDE
    // React so drag and undo never wait on a render.
    const paint = (): void => {
      const s = editorStore.getState();
      // What the map leaves out (visibility.ts): the layers only ever see what is shown.
      const a = s.project.airport;
      const shown = <T extends { id: string }>(group: VisGroup, items: readonly T[] | undefined): T[] =>
        visibleOf(s, group, items);
      layer.sync(
        s.hiddenGroups.size === 0 && s.hiddenIds.size === 0
          ? s.project.objects
          : s.project.objects.filter((o) => !s.hiddenGroups.has(objectGroup(o)) && !s.hiddenIds.has(o.id)),
        s.catalogIndex,
        s.airportLightIndex,
        s.plantIndex,
        new Set(s.selection),
      );
      helipad.sync(
        shown("helipads", a?.pads),
        s.airportSelection?.kind === "pad" ? s.airportSelection.id : null,
      );
      parking.sync(
        shown("parkings", a?.parkings),
        s.airportSelection?.kind === "parking" ? s.airportSelection.id : null,
      );
      runway.sync(
        shown("runways", a?.runways),
        s.airportSelection?.kind === "runway" ? s.airportSelection.id : null,
      );
      // Rebuilt rather than passed through: narrowing `kind` inside a ternary condition does not narrow
      // the OBJECT, and this layer only ever wants the two glider kinds.
      const sel = s.airportSelection;
      glider.sync(
        shown("gliders", a?.aerotows),
        shown("gliders", a?.winches),
        sel !== null && (sel.kind === "aerotow" || sel.kind === "winch")
          ? { kind: sel.kind, id: sel.id }
          : null,
      );
      const markSel = (kind: MarkKind): string | null => (sel?.kind === kind ? sel.id : null);
      groundText.sync(shown("groundtexts", a?.groundtexts), markSel("groundtext"));
      taxisign.sync(shown("taxisigns", a?.taxisigns), markSel("taxisign"));
      jetway.sync(shown("jetways", a?.jetways), markSel("jetway"));
      carlot.sync(shown("carlots", a?.carlots), markSel("carlot"));
      const editable = s.placing === null;
      boundary.sync(
        s.hiddenGroups.has("boundary") ? null : (a?.boundary ?? null),
        sel?.kind === "boundary",
        editable,
      );
      tarmac.sync(shown("tarmacs", a?.tarmacs), sel?.kind === "tarmac" ? sel.id : null, editable);
      line.sync(shown("lines", a?.lines), sel?.kind === "line" ? sel.id : null, editable);
      const drawing = s.placing?.kind;
      draft.sync(isShapeKind(drawing) ? s.shapeDraft : null, drawing !== "line");
      // `position` and not airportPosition(): the airport's point must not follow pads[0], so
      // never draw a ⊕ on a point the airport does not actually own.
      airport.sync(s.hiddenGroups.has("airport") ? null : (a?.position ?? null), sel?.kind === "data");
    };
    paint();
    const unsub = editorStore.subscribe(
      // Every catalog index is watched, not just catalogIndex: each one decides some object's missing
      // (red) state, and a Rescan swaps them all in together — without watching one, an object whose
      // catalog entry appeared/vanished never repaints.
      (s) =>
        [
          s.project.objects,
          s.catalogIndex,
          s.airportLightIndex,
          s.plantIndex,
          s.selection,
          s.project.airport,
          s.airportSelection,
          s.placing,
          s.shapeDraft,
          s.hiddenGroups,
          s.hiddenIds,
        ] as const,
      paint,
      { equalityFn: shallow },
    );

    // Re-center when a NEW document loads (Open / New / Rescan): the store bumps cameraEpoch and resets
    // mapView to the incoming project's camera. Pan/zoom never bump it, so looking around is never
    // yanked back (Fable P1-4 / A#4).
    const unsubCamera = editorStore.subscribe(
      (s) => s.cameraEpoch,
      () => {
        const c = editorStore.getState().mapView;
        map.setView([c.lat, c.lon], c.zoom);
      },
    );

    // Empty-map click = place the armed object (footprint clicks don't bubble here → select ≠ place).
    const onClick = (e: L.LeafletMouseEvent): void => {
      const s = editorStore.getState();
      // wrapLon: a click in a repeated world-copy (low-zoom pan) hands us lng >180 / <-180 — the same
      // real point, but out of the range the loader accepts. Wrap it so the placed object stays valid.
      if (s.placing !== null) s.placeAt({ lon: wrapLon(e.latlng.lng), lat: e.latlng.lat });
      else s.clearSelection();
    };
    map.on("click", onClick);

    // The double click that finishes a shape being drawn (boundary, tarmac, line). While one is being
    // drawn a double click must not also zoom the map, so Leaflet's double-click zoom is off for exactly
    // that long.
    const onDblClick = (): void => {
      if (isShapeKind(editorStore.getState().placing?.kind)) editorStore.getState().finishShape();
    };
    map.on("dblclick", onDblClick);
    const unsubDraw = editorStore.subscribe(
      (s) => isShapeKind(s.placing?.kind),
      (drawing) => {
        if (drawing) map.doubleClickZoom.disable();
        else map.doubleClickZoom.enable();
      },
    );

    // Camera is EPHEMERAL (P1-4): capture the live view on pan/zoom, never dirtying the document.
    const onMoveEnd = (): void => {
      const c = map.getCenter();
      // Wrap the live camera's longitude too: it becomes the export anchor when "Current map center" is
      // chosen, so a pan into a world-copy would otherwise write an out-of-range reference (Fable B1).
      editorStore.getState().setMapView({ lon: wrapLon(c.lng), lat: c.lat, zoom: map.getZoom() });
    };
    map.on("moveend", onMoveEnd);

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") editorStore.getState().armPlacement(null);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      unsub();
      unsubCamera();
      unsubTiles();
      unsubDraw();
      airport.destroy();
      glider.destroy();
      carlot.destroy();
      jetway.destroy();
      taxisign.destroy();
      groundText.destroy();
      parking.destroy();
      helipad.destroy();
      layer.destroy();
      runway.destroy();
      draft.destroy();
      line.destroy();
      tarmac.destroy();
      boundary.destroy();
      map.remove(); // frees the container so StrictMode's second mount can re-init it
    };
  }, []);

  // Toggle the placement class imperatively — React must NOT own this div's className. Leaflet writes
  // its own classes (leaflet-container, leaflet-grab, …) onto the SAME element after init; re-rendering
  // the div with a React-driven className wipes them, and losing leaflet-container drops its
  // position:relative / overflow:hidden so the map panes detach and spill over the side panels.
  useEffect(() => {
    ref.current?.classList.toggle("placing", placing !== null);
  }, [placing]);

  return <div ref={ref} className="pct-map" />;
}
