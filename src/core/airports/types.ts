// Airport reference data (fboes/aerofly-data). Just enough to recenter the map on a sim airport —
// ICAO + display name + position. No elevation (map centering doesn't need it; elevation is a
// separate track — the IPACS DEM). NOT part of the editable project; loaded reference data only.

export interface Airport {
  icao: string; // e.g. "LFPG"
  name: string; // e.g. "Charles de Gaulle"
  lat: number; // degrees, [-90, 90]
  lon: number; // degrees, [-180, 180]
}
