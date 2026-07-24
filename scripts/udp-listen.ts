// udp-listen.ts — PROBE: does Aerofly FS 4 emit ForeFlight UDP telemetry (port 49002) DURING REPLAY?
//
// This is the one open question behind the in-sim capture design. If the sim keeps emitting a CHANGING
// position while you scrub a REPLAY, the capture tool can auto-name each screenshot by WHERE the plane is
// (project the live position onto the row's manifest). If it freezes/stops in replay, we fall back to
// order + a review strip. Either way the capture is one deliberate key-press per photo — this only asks
// whether the *naming* can lean on position.
//
// Run (usually launched for you, in the background, since Aerofly is on this machine):
//   npx tsx scripts/udp-listen.ts [logFilePath]
//
// It prints ONE summary row per second (a heartbeat), so the phases are obvious in the log:
//   FLY   → XGPS/s > 0 and state = MOVED
//   PAUSE → XGPS/s = 0 (or "still" if the sim keeps sending a frozen position)
//   REPLAY+scrub → the answer: is it MOVED (works!) or still/— (frozen → fallback)?
// Sequence to perform in the sim:  FLY ~15s  →  PAUSE ~8s  →  REPLAY + scrub ~15s.
import dgram from "node:dgram";
import { appendFileSync } from "node:fs";

const PORT = 49002;
const LOG = process.argv[2] ?? null; // optional log path (appended synchronously → survives a hard kill)
const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });

let pktsThisTick = 0;
let xattThisTick = 0;
let totalPkts = 0;
let lastLat = "";
let lastLon = "";
let prevTickPos = "";

function ts(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function out(line: string): void {
  console.log(line);
  if (LOG) {
    try {
      appendFileSync(LOG, line + "\n");
    } catch {
      /* log file unavailable → stdout only */
    }
  }
}

sock.on("message", (buf) => {
  const text = buf.toString("utf8").trim();
  totalPkts++;
  // ForeFlight text protocol:
  //   "XGPS<sim>,<lon>,<lat>,<altMSLmetres>,<trackTrue>,<groundspeedMps>"
  //   "XATT<sim>,<headingTrue>,<pitchDeg>,<rollDeg>"
  if (text.startsWith("XGPS")) {
    const f = text.split(",");
    lastLon = f[1] ?? "";
    lastLat = f[2] ?? "";
    pktsThisTick++;
  } else if (text.startsWith("XATT")) {
    xattThisTick++;
  }
});

// 1 Hz heartbeat — runs regardless of traffic so a PAUSE shows up as an empty row, not just silence.
setInterval(() => {
  const pos = `${lastLat},${lastLon}`;
  const state = pktsThisTick === 0 ? "—  (no packets)" : pos !== prevTickPos ? "MOVED" : "still (frozen pos)";
  out(`[${ts()}] XGPS/s=${pktsThisTick} XATT/s=${xattThisTick} lat=${lastLat} lon=${lastLon}  ${state}`);
  prevTickPos = pos;
  pktsThisTick = 0;
  xattThisTick = 0;
}, 1000);

sock.on("listening", () => {
  out(`[${ts()}] Listening UDP ${PORT}. Sequence: FLY ~15s -> PAUSE ~8s -> REPLAY + scrub ~15s.`);
});

sock.on("error", (err: NodeJS.ErrnoException) => {
  out(`[${ts()}] Socket error: ${err.message}${err.code === "EADDRINUSE" ? " (port busy — close any other GPS-out app on 49002)" : ""}`);
  process.exit(1);
});

sock.bind(PORT);
