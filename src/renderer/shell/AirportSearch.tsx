// AirportSearch.tsx — the TopBar "Airport:" typeahead. Type an ICAO or a name, pick a match, and the
// map recenters on that sim airport: a flyTo at AIRPORT_ZOOM, wide enough to frame the whole field.
// It is purely a camera move — it draws NO marker and never touches the document (Juan's spec: just
// move the map). The list is bundled reference data (data/airports.ts); ranking is the pure-core
// searchAirports. The keyboard: ↑/↓ move the highlight, Enter picks it, Esc closes then clears.
import { useMemo, useRef, useState } from "react";
import { editorStore, useEditor } from "../state/editorStore";
import { AIRPORT_ZOOM } from "../state/store";
import { searchAirports } from "../../core/airports/airports";
import type { Airport } from "../../core/airports/types";

export function AirportSearch(): React.ReactElement {
  const airports = useEditor((s) => s.airports);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchAirports(airports, query), [airports, query]);
  const showList = open && results.length > 0;

  const pick = (a: Airport): void => {
    editorStore.getState().flyTo({ lon: a.lon, lat: a.lat }, AIRPORT_ZOOM);
    setQuery("");
    setOpen(false);
    setHighlight(0);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (showList && results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      // First Esc closes the dropdown; a second (already closed) clears the box.
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else {
        setQuery("");
      }
    }
  };

  return (
    <div className="pct-airport">
      <label className="pct-airport-label" htmlFor="pct-airport-search">
        Airport:
      </label>
      <div className="pct-airport-box">
        <input
          id="pct-airport-search"
          ref={inputRef}
          className="pct-airport-input"
          type="search"
          placeholder="ICAO or name…"
          autoComplete="off"
          role="combobox"
          aria-expanded={showList}
          aria-controls="pct-airport-listbox"
          aria-activedescendant={showList ? `pct-airport-opt-${highlight}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {showList && (
          <ul className="pct-airport-list" id="pct-airport-listbox" role="listbox">
            {results.map((a, i) => (
              <li
                key={`${a.icao}-${i}`}
                id={`pct-airport-opt-${i}`}
                role="option"
                aria-selected={i === highlight}
                className={i === highlight ? "pct-airport-opt on" : "pct-airport-opt"}
                // mousedown + preventDefault fires BEFORE the input's blur, so clicking a row isn't
                // cancelled by the dropdown closing first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(a);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="pct-airport-icao">{a.icao}</span>
                <span className="pct-airport-name">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
