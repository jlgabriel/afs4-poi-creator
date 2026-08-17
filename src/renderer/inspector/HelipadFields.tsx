// HelipadFields.tsx — the Inspector's panel for ONE helicopter start pad.
//
// WHY IT EXISTS (forum #173, ApfelFlieger). Through v1.2 the whole heliport lived in a modal: you opened
// "Create HELIPORT…" to place the pad, to type the code, to move it, to install it. He asked for the pad
// to be created from the left column and "then listed on the right for editing", because that is how
// every other thing in PCT works — and he is right that a full-screen overlay is a bad place to edit
// something you have to see on the map to judge. The dialog covers the map; this panel does not.
//
// ★ ONE pad, named by id (forum #221: "this element can now be used as often as desired" — his own SCLC
// ships three). It was `HeliportFields` and reached for `pads[0]`; the file is renamed because "heliport"
// now means the airport, which is AirportDataFields, and this is the pad.
//
// ★ WHAT LEFT, and why. This panel used to hold the airport's identity — code, name, country — and the
// Install button, on the reasoning that "a project has exactly one airport, so the pad IS the airport as
// far as anyone using this can tell". His submenu (1) DATA says otherwise and so does the model: one code
// shown inside N pad panels reads as N codes. It all lives in AirportDataFields now.
import type { AirportPad } from "../../core/project/types";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";

const fmtDeg = (n: number): string => n.toFixed(6);

export function HelipadFields({ pad }: { pad: AirportPad }): React.ReactElement {
  const store = editorStore.getState;
  const { id } = pad;
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  return (
    // .pct-inspector-body is what every other kind's panel opens with, and it is not decoration: the
    // padding lives there, not on .pct-inspector. Returning a bare fragment put the fields flush against
    // both edges of the panel while the object panels sat inset — spotted on screen, not by a test.
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {pad.name.trim() === "" ? "Helipad" : pad.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Helipad — where the helicopter starts
          {/* The gesture this sentence promises is the gesture the layer implements: click to select,
              THEN the grip appears. It used to be there always, which stopped being tenable at three pads
              — and a panel that promised a grip you could not see would be a bug the prose invented. */}
          <Help>
            Drag the white circle on the map to move it, and — once it is selected — its cyan grip to
            turn it. It is its own point, not one of your objects, so nothing spawns inside a building.
          </Help>
        </span>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">Lon</span>
          <NumberInput
            value={pad.position.lon}
            format={fmtDeg}
            onCommit={(lon) => store().moveAirportPad(id, clampLonLat({ lon, lat: pad.position.lat }))}
            ariaLabel="Helipad longitude"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">Lat</span>
          <NumberInput
            value={pad.position.lat}
            format={fmtDeg}
            onCommit={(lat) => store().moveAirportPad(id, clampLonLat({ lon: pad.position.lon, lat }))}
            ariaLabel="Helipad latitude"
          />
        </label>
      </div>

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">
            Heading — true
            {/* Measured in-sim 2026-07-31: we wrote heading 40 and the sim's menu showed 028 — 40 minus
                the local magnetic variation. So the field is TRUE and the sim's panel is magnetic. */}
            <Help>Aerofly shows this heading as MAGNETIC, so expect it to read a few degrees off.</Help>
          </span>
          <NumberInput
            value={pad.heading}
            onCommit={(heading) => store().rotateAirportPad(id, heading)}
            ariaLabel="Helipad heading, true degrees"
          />
        </label>
        <label className="pct-field-col">
          <span className="pct-field-label">
            Size — m
            {/* ★ The one note here that carries a LIVE number, and it stays folded anyway: the surprise is
                the radius/diameter convention, not the arithmetic, and the value is right beside it. */}
            <Help>
              This is a radius — the sim shows {pad.radius} m as {Math.round(pad.radius * 2)} m.
            </Help>
          </span>
          <NumberInput
            value={pad.radius}
            onCommit={(radius) => store().setAirportPadRadius(id, radius)}
            ariaLabel="Helipad size, metres"
          />
        </label>
      </div>

      {/* #221: "the name can be freely assigned". It is what LOCATION shows for the pad, and with several
          pads it is the only thing that tells them apart in the list — which is why it arrives with the
          repeat and not before. Empty is normal: the writers render an unnamed pad as FATO/TLOF, the
          literal v1.2 and v1.3 always wrote, so an old project still exports the same bytes. */}
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Name — shown in LOCATION
          <Help>Leave it empty and Aerofly shows the pad as &ldquo;FATO/TLOF&rdquo;.</Help>
        </span>
        <input
          className="pct-text"
          value={pad.name}
          placeholder="e.g. Helipad_W1"
          aria-label="Helipad name"
          onChange={(e) => store().setAirportPadName(id, e.target.value)}
        />
      </label>

      {heightMode === "autoheight" && (
        <span className="pct-field-meta">
          This project is on sim autoheight, so the pad follows the terrain and there is no base
          elevation to set.
        </span>
      )}

      {/* One line, because the fields that used to be below this one are gone and Michael tests every
          release the way a new user would. Without it, "where did the code go" is a question the panel
          invites and does not answer.

          ★ IT KEEPS ITS OWN LABEL rather than hiding behind another panel's question mark: someone
          looking for the ICAO field does not know to press a "?" on the pad to be told it is elsewhere. */}
      <div className="pct-field pct-field-col">
        <span className="pct-field-label">
          Where is the airport code?
          <Help>
            The airport&apos;s name, code and Install button are in <strong>Airport</strong>, at the top
            of the list on the right.
          </Help>
        </span>
      </div>
    </div>
  );
}
