// tileProviders.ts — the built-in map tile sources (design §4). Esri World Imagery (satellite, the
// default) and OpenStreetMap (streets) are the quick-switch pair the TopBar toggles between; "custom"
// reads an XYZ URL from Settings. Esri has imagery gaps in some regions (shows "Map data not yet
// available"), so OSM is the always-covered fallback for placing objects there. Pure (no Leaflet import)
// so MapView, the TopBar switcher, and the Settings dialog share ONE table, and it unit-tests in node.
import type { Settings } from "../../core/project/types";

export type TileProvider = Settings["tiles"]["provider"]; // "esri" | "osm" | "custom"

export interface TileSource {
  url: string; // XYZ template
  attribution: string;
  maxNativeZoom: number; // beyond this the map overzooms (stretches) instead of going blank
}

/** Short labels for the built-in providers — the TopBar switcher + the Settings radios. */
export const PROVIDER_LABEL: Record<TileProvider, string> = {
  esri: "Satellite",
  osm: "Streets",
  custom: "Custom",
};

export const ESRI: TileSource = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  maxNativeZoom: 19,
};

export const OSM: TileSource = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxNativeZoom: 19,
};

/** Resolve a tile config to a concrete source. A "custom" provider with a blank URL falls back to Esri
 *  so the map is never blank. */
export function tileSourceFor(tiles: Settings["tiles"]): TileSource {
  if (tiles.provider === "osm") return OSM;
  if (tiles.provider === "custom" && tiles.customUrl) {
    return { url: tiles.customUrl, attribution: tiles.customAttribution ?? "", maxNativeZoom: 19 };
  }
  return ESRI; // esri, or a custom provider whose URL isn't set yet
}
