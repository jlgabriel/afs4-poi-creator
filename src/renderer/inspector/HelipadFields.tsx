// HelipadFields.tsx — the Inspector's panel for ONE helicopter start pad.
//
// The pad is created from the left column and edited here, like every other thing in PCT: a full-screen
// dialog would cover the map you need to judge the pad by.
//
// ★ ONE pad, named by id: pads are repeatable. "Heliport" now means the airport, which is
// AirportDataFields; this is the pad. The airport's identity (code, name, country) and its install button
// live there too — one code shown inside N pad panels would read as N codes.
import type { AirportPad } from "../../core/project/types";
import { clampLonLat } from "../../core/project/schemas";
import { editorStore, useEditor } from "../state/editorStore";
import { Help } from "./HelpNote";
import { NumberInput } from "./NumberInput";
import { WadHeading, WadPosition } from "./WadReadout";

const fmtDeg = (n: number): string => n.toFixed(6);

export function HelipadFields({ pad }: { pad: AirportPad }): React.ReactElement {
  const store = editorStore.getState;
  const { id } = pad;
  const heightMode = useEditor((s) => s.project.heightMode) ?? "baked-asl";

  return (
    // .pct-inspector-body is what every other kind's panel opens with, and it is not decoration: the
    // padding lives there, not on .pct-inspector. Returning a bare fragment put the fields flush against
    // both edges of the panel while the object panels sat inset.
    <div className="pct-inspector-body">
      <div className="pct-field-title">
        {pad.name.trim() === "" ? "Helipad" : pad.name.trim()}
      </div>

      <div className="pct-field pct-field-col">
        {/* HelipadLayer: click to select, THEN the rotation grip appears. */}
        <span className="pct-field-label">Helipad</span>
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
      <WadPosition position={pad.position} />

      <div className="pct-field pct-field-row">
        <label className="pct-field-col">
          <span className="pct-field-label">
            Heading — true
            {/* The field is TRUE heading; the sim's own panel shows it MAGNETIC (minus the local
                variation). */}
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
            {/* States the radius/diameter convention, not the arithmetic: the surprise is the convention,
                and the value is right beside it. */}
            <Help>This is the RADIUS - the map shows DIAMETER (= 2x RADIUS)</Help>
          </span>
          <NumberInput
            value={pad.radius}
            onCommit={(radius) => store().setAirportPadRadius(id, radius)}
            ariaLabel="Helipad size, metres"
          />
        </label>
      </div>
      {/* Under the ROW, not inside the heading's half of it: a 16-digit chip in a 130 px column would
          have to ellipsise the number this line exists to let you read. Size has no .wad form — it is
          plain metres in the file — so nothing is missing beside it. */}
      <WadHeading heading={pad.heading} />

      {/* A free name. It is what LOCATION shows for the pad, and with several pads it is the only thing
          that tells them apart in the list. Empty is normal: the writers render an unnamed pad as
          FATO/TLOF, so an older project without names still exports the same bytes. */}
      <label className="pct-field pct-field-col">
        <span className="pct-field-label">
          Name
          <Help>Leave it empty and Aerofly shows the pad as &ldquo;FATO/TLOF&rdquo;.</Help>
        </span>
        <input
          className="pct-text"
          value={pad.name}
          placeholder="e.g. Helipad1"
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

    </div>
  );
}
