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
import type { TilesConfig } from "../state/store";
import { wrapLon } from "../../core/geo/geo";
import { tileSourceFor } from "./tileProviders";
import { FootprintLayer } from "./FootprintLayer";
import { HelipadLayer } from "./HelipadLayer";
import { ParkingLayer } from "./ParkingLayer";
import { AirportLayer } from "./AirportLayer";
import { RunwayLayer } from "./RunwayLayer";
import { GliderLayer } from "./GliderLayer";

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

    // The helicopter's start pads (v1.2, a LIST since v1.4 / forum #221). Their own layer, not
    // footprints: a pad is not a placed object and never joins `selection`. See HelipadLayer.
    const helipad = new HelipadLayer(map, {
      onMove: (id, p) => editorStore.getState().moveAirportPad(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateAirportPad(id, deg),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "pad", id }),
    });

    // The parking positions (v1.4, forum #232). Its own layer for the same reason the pad has one — a
    // stand is not a placed object — but a LIST rather than a singleton, because any number can exist.
    const parking = new ParkingLayer(map, {
      onMove: (id, p) => editorStore.getState().moveAirportParking(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateAirportParking(id, deg),
      onSelect: (id) => editorStore.getState().selectAirportPart({ kind: "parking", id }),
    });

    // The two glider starts (v1.4, forum #237/#238). One layer for both — they are one family, and it
    // saves a fourth and fifth copy of the same drag state machine.
    const glider = new GliderLayer(map, {
      onMoveAerotow: (id, p) => editorStore.getState().moveAirportAerotow(id, p),
      onRotateAerotow: (id, deg) => editorStore.getState().rotateAirportAerotow(id, deg),
      onMoveWinchPoint: (id, which, p) => editorStore.getState().moveAirportWinchPoint(id, which, p),
      onMoveWinch: (id, g, w) => editorStore.getState().moveAirportWinch(id, g, w),
      onSelect: (kind, id) => editorStore.getState().selectAirportPart({ kind, id }),
    });

    // The airport's own point (v1.5, forum #255). Created LAST so Leaflet stacks it on top: it is one
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
      layer.sync(
        s.project.objects,
        s.catalogIndex,
        s.airportLightIndex,
        s.plantIndex,
        new Set(s.selection),
      );
      helipad.sync(
        s.project.airport?.pads ?? [],
        s.airportSelection?.kind === "pad" ? s.airportSelection.id : null,
      );
      parking.sync(
        s.project.airport?.parkings ?? [],
        s.airportSelection?.kind === "parking" ? s.airportSelection.id : null,
      );
      runway.sync(
        s.project.airport?.runways ?? [],
        s.airportSelection?.kind === "runway" ? s.airportSelection.id : null,
      );
      // Rebuilt rather than passed through: narrowing `kind` inside a ternary condition does not narrow
      // the OBJECT, and this layer only ever wants the two glider kinds.
      const sel = s.airportSelection;
      glider.sync(
        s.project.airport?.aerotows ?? [],
        s.project.airport?.winches ?? [],
        sel !== null && (sel.kind === "aerotow" || sel.kind === "winch")
          ? { kind: sel.kind, id: sel.id }
          : null,
      );
      // `position` and not airportPosition(): the fallback to pads[0] is what #255 asks us to stop, and
      // drawing a ⊕ on a point the airport does not actually own would put the old behaviour back on
      // screen after taking it out of the model.
      airport.sync(s.project.airport?.position ?? null, sel?.kind === "data");
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
      airport.destroy();
      glider.destroy();
      parking.destroy();
      helipad.destroy();
      layer.destroy();
      runway.destroy();
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
