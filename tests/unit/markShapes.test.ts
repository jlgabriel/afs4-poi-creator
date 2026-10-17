import { describe, expect, it } from "vitest";
import { jetwayParts } from "../../src/renderer/map/markShapes";
import { initialBearing } from "../../src/core/geo/geo";
import { DEFAULT_JETWAY } from "../../src/core/project/marks";
import type { AirportJetway, LonLat } from "../../src/core/project/types";

const AT: LonLat = { lon: -71.6161, lat: -33.6559 };
const jetway = (over: Partial<AirportJetway>): AirportJetway =>
  ({ ...DEFAULT_JETWAY, id: "j", position: AT, heading: 0, ...over }) as AirportJetway;
const centre = (ring: LonLat[]): LonLat => ({
  lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length,
  lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
});
/** Bearing from the extension's centre to the exit's centre, 0..360. */
const exitBearing = (j: AirportJetway, heading: number): number => {
  const [, extension, exit] = jetwayParts(j, AT, heading);
  return (initialBearing(centre(extension), centre(exit)) + 360) % 360;
};

describe("jetwayParts", () => {
  it("exit 0 stays in line with a turned extension (the exit is relative to the extension)", () => {
    // Extension 45° counter-clockwise from heading 30 ⇒ the tunnel runs at 345°; exit 0 continues it.
    expect(exitBearing(jetway({ extensionDirection: 45, extensionAmount: 10, exitDirection: 0 }), 30)).toBeCloseTo(345, 0);
  });

  it("the exit turns counter-clockwise from the extension, not from the heading", () => {
    // The square's centre is offset from the tunnel's end, so measure from the tunnel's end instead.
    const j = jetway({ extensionDirection: 45, extensionAmount: 10, exitDirection: 30 });
    const [, extension, exit] = jetwayParts(j, AT, 0);
    const end = centre([extension[0], extension[1]]); // the tunnel's far edge
    const b = (initialBearing(end, centre(exit)) + 360) % 360;
    expect(b).toBeCloseTo((360 - 45 - 30) % 360, 0);
  });
});
