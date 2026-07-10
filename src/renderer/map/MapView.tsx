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
import { FootprintLayer } from "./FootprintLayer";

// Esri World Imagery (design §4 default). CSP allows server.arcgisonline.com img-src (and, since M2h,
// any https host so a user's custom XYZ provider works — main/index.ts).
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

/** The tile layer for the current provider: Esri, or a user's custom XYZ template (falling back to
 *  Esri if the custom URL is blank). Overzoom (maxNativeZoom < maxZoom) keeps metre-precise placement. */
function buildTileLayer(tiles: TilesConfig): L.TileLayer {
  const custom = tiles.provider === "custom" && !!tiles.customUrl;
  const url = custom ? (tiles.customUrl as string) : ESRI_URL;
  const attribution = custom ? (tiles.customAttribution ?? "") : ESRI_ATTR;
  return L.tileLayer(url, { maxNativeZoom: 19, maxZoom: 22, attribution });
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

    const layer = new FootprintLayer(map, {
      onSelect: (id, additive) => editorStore.getState().select([id], additive),
      onMove: (id, p) => editorStore.getState().moveObject(id, p),
      onRotate: (id, deg) => editorStore.getState().rotateObject(id, deg),
    });

    // Paint now, then re-paint whenever objects / catalog / selection change — subscribed OUTSIDE
    // React so drag and undo never wait on a render.
    const paint = (): void => {
      const s = editorStore.getState();
      layer.sync(s.project.objects, s.catalogIndex, new Set(s.selection));
    };
    paint();
    const unsub = editorStore.subscribe(
      (s) => [s.project.objects, s.catalogIndex, s.selection] as const,
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
      if (s.placing !== null) s.placeAt({ lon: e.latlng.lng, lat: e.latlng.lat });
      else s.clearSelection();
    };
    map.on("click", onClick);

    // Camera is EPHEMERAL (P1-4): capture the live view on pan/zoom, never dirtying the document.
    const onMoveEnd = (): void => {
      const c = map.getCenter();
      editorStore.getState().setMapView({ lon: c.lng, lat: c.lat, zoom: map.getZoom() });
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
      layer.destroy();
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
