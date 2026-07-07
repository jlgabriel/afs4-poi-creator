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
import { FootprintLayer } from "./FootprintLayer";

// Esri World Imagery (design §4 default). CSP already allows server.arcgisonline.com img-src.
const ESRI_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function MapView(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const placing = useEditor((s) => s.placing);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const { camera } = editorStore.getState().project;
    const map = L.map(el, { attributionControl: true, zoomControl: true }).setView(
      [camera.lat, camera.lon],
      camera.zoom,
    );
    // maxNativeZoom < maxZoom = OVERZOOM: keep zooming past native tile resolution so metre-precise
    // placement stays usable instead of hitting gray tiles (P1-5).
    L.tileLayer(ESRI_URL, { maxNativeZoom: 19, maxZoom: 22, attribution: ESRI_ATTR }).addTo(map);

    const layer = new FootprintLayer(map, {
      onSelect: (id, additive) => editorStore.getState().select([id], additive),
      onMove: (id, p) => editorStore.getState().moveObject(id, p),
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
      layer.destroy();
      map.remove(); // frees the container so StrictMode's second mount can re-init it
    };
  }, []);

  return <div ref={ref} className={placing !== null ? "pct-map placing" : "pct-map"} />;
}
