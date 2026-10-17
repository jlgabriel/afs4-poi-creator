// markShapes.ts — the rings MarkLayer draws, as pure geometry: no Leaflet, no DOM, so it unit-tests under
// the node config. markLooks.ts decides which ring each element gets.
import type { AirportJetway, LonLat } from "../../core/project/types";
import { destination } from "../../core/geo/geo";

/** A rectangle `along` metres in the heading's direction and `across` metres across it, centred on `at`. */
export function rectAround(at: LonLat, heading: number, along: number, across: number): LonLat[] {
  const front = destination(at, along / 2, heading);
  const back = destination(at, along / 2, heading + 180);
  return [
    destination(front, across / 2, heading - 90),
    destination(front, across / 2, heading + 90),
    destination(back, across / 2, heading + 90),
    destination(back, across / 2, heading - 90),
  ];
}

/** A circle of `radius` metres as a 24-point ring. */
export function circleAround(at: LonLat, radius: number): LonLat[] {
  return Array.from({ length: 24 }, (_, i) => destination(at, radius, i * 15));
}

const JETWAY_WIDTH_M = 3;
export const JETWAY_BASE_M = 4;
export const JETWAY_EXIT_M = 3.5;
/** 2 m at least, so a retracted jetway still shows its tunnel. */
export const jetwayExtensionLength = (j: AirportJetway): number => Math.max(2, j.extensionAmount);

/** The three parts' rings: base, extension, exit. Each direction is relative to the part before it and
 *  counter-clockwise: the extension turns from the heading, the exit from the extension (exit 0 = in line
 *  with the extension). A compass bearing is the previous part's bearing MINUS the direction. */
export function jetwayParts(j: AirportJetway, at: LonLat, heading: number): [LonLat[], LonLat[], LonLat[]] {
  const base = rectAround(destination(at, JETWAY_BASE_M / 2, heading), heading, JETWAY_BASE_M, JETWAY_BASE_M);
  const start = destination(at, JETWAY_BASE_M, heading);
  const along = heading - j.extensionDirection;
  const length = jetwayExtensionLength(j);
  const extension = rectAround(destination(start, length / 2, along), along, length, JETWAY_WIDTH_M);
  const end = destination(start, length, along);
  const exitHeading = along - j.exitDirection;
  const exit = rectAround(destination(end, JETWAY_EXIT_M / 2, exitHeading), exitHeading, JETWAY_EXIT_M, JETWAY_EXIT_M);
  return [base, extension, exit];
}
