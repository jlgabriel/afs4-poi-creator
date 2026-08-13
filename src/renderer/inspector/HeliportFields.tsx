// HeliportFields.tsx — the Inspector's panel for the helipad: where the helicopter starts.
//
// WHY IT EXISTS (forum #173, ApfelFlieger). Through v1.2 the whole heliport lived in a modal: you opened
// "Create HELIPORT…" to place the pad, to type the code, to move it, to install it. He asked for the pad
// to be created from the left column and "then listed on the right for editing", because that is how
// every other thing in PCT works — and he is right that a full-screen overlay is a bad place to edit
// something you have to see on the map to judge. The dialog covers the map; this panel does not.
//
// ★ WHAT LEFT THIS PANEL, and why. Until v1.4 this also held the airport's identity — code, name, country
// — and the Install button, on the reasoning that "a project has exactly one airport, so the pad IS the
// airport as far as anyone using this can tell". His submenu (1) DATA (forum #217/#232) says otherwise
// and so does the model: pads are repeatable now, and one code shown inside N pad panels reads as N
// codes. All of it moved to AirportDataFields, which is also the door a project with no pad at all can
// use — there was none before, and a parking-only project could not be given a code.
import type { ProjectAirport } from "../../core/project/types";
import { clampLonLat } from "../../core/project/schemas";
import { firstPad } from "../../core/project/airport";
import { editorStore, useEditor } from "../state/editorStore";
import { NumberInput } from "./NumberInput";

const fmtDeg = (n: number): string => n.toFixed(6);

export function HeliportFields({ airport }: { airport: ProjectAirport }): React.ReactElement | null {
  const store = editorStore.getState;
  // This panel edits ONE pad, and every route into it goes through placing one, so a pad-less airport
  // cannot be reached from this UI — the model allows it (airport.ts) but nothing here creates it. Render
  // nothing rather than invent a pad; the repeatable HELICOPTER menu (forum #219/#221) is what turns this
  // into a list and gives a pad-less airport its own empty state.
  const pad = firstPad(airport);
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  if (pad === undefined) return null;

  return (
    // .pct-inspector-body is what every other kind's panel opens with, and it is not decoration: the
    // padding lives there, not on .pct-inspector. Returning a bare fragment put the fields flush against
    // both edges of the panel while the object panels sat inset — spotted on screen, not by a test.
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {airport.name.trim() === "" ? "Start - Helicopter" : airport.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">Helipad — where the helicopter starts</span>
        <span className="pct-field-meta">
          Drag the white circle on the map to move it, and its cyan grip to turn it. It is its own point,
          not one of your objects, so nothing spawns inside a building.
        </span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={pad.position.lon}
            format={fmtDeg}
            onCommit={(lon) => store().moveAirportPad(clampLonLat({ lon, lat: pad.position.lat }))}
            ariaLabel="Helipad longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={pad.position.lat}
            format={fmtDeg}
            onCommit={(lat) => store().moveAirportPad(clampLonLat({ lon: pad.position.lon, lat }))}
            ariaLabel="Helipad latitude"
          />
        </label>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Heading — true</span>
          <NumberInput
            value={pad.heading}
            onCommit={(heading) => store().rotateAirportPad(heading)}
            ariaLabel="Helipad heading, true degrees"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Radius — m</span>
          <NumberInput
            value={pad.radius}
            onCommit={(radius) => store().setAirportPadRadius(radius)}
            ariaLabel="Helipad radius, metres"
          />
        </label>
      </div>
      {/* Measured in-sim 2026-07-31: we wrote heading 40 and the sim's menu showed 028 — 40 minus the
          local magnetic variation. So the field is TRUE and the sim's panel is magnetic. */}
      <span className="pct-field-meta">
        Aerofly shows this heading as MAGNETIC, so expect it to read a few degrees off. Radius{" "}
        {pad.radius} m shows there as a size of {Math.round(pad.radius * 2)} m.
      </span>

      {heightMode === "autoheight" && (
        <span className="pct-field-meta">
          This project is on sim autoheight, so the pad follows the terrain and there is no base
          elevation to set.
        </span>
      )}

      {/* One line, because the fields that used to be below this one are gone and Michael tests every
          release the way a new user would. Without it, "where did the code go" is a question the panel
          invites and does not answer. */}
      <span className="pct-field-meta">
        The airport&apos;s name, code and Install button are in <strong>Data</strong>, at the top of the
        list on the right.
      </span>
    </div>
  );
}
