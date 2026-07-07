# PCT — POI Creation Tool

Place **Aerofly FS 4** built‑in scenery objects on a satellite map, then export an
installable `scenery/poi/` package. A sibling to
[afs4‑pylon‑race](https://github.com/jlgabriel/afs4-pylon-race); shares its geometry and
POI‑folder conventions.

> **Status:** M0 (core + scanner) and the M1 **export core + CLI** are done and green — you can
> already build and install a POI from a `project.json` with no UI. The Electron shell is next. See
> [`docs/PCT_DESIGN__FABLE__20260706.md`](docs/PCT_DESIGN__FABLE__20260706.md) for the full design &
> milestone plan, and [`docs/FORMAT-FINDINGS.md`](docs/FORMAT-FINDINGS.md) for the in-sim format matrix.

## What M0 delivers

A pure, CLI‑verifiable data layer that reads Aerofly's built‑in object catalog straight
from the sim's plain‑text `.tmi` index files — **no asset extraction, no IPACS bytes copied**:

- `core/tm` — the `<[type][name][value] …children… >` tag‑tree parser shared by every AFS4 text file.
- `core/catalog` — `.tmi` → typed object catalog (name, bounding box, size, category).
- `core/geo` — geometry + POI folder‑name encoder, ported numerically 1:1 from the Race App.
- `cli/scan.ts` — `npm run scan` → writes a `catalog.json` and reports per‑bundle counts.

## Requirements

- Node.js ≥ 20 (developed on 24 LTS)
- An Aerofly FS 4 install to scan (its `scenery/xref/` folder), for the scanner and the
  `tests/local` suite. Unit tests need no install.

## Commands

```bash
npm install
npm test                 # vitest over core/ (unit + golden; self-contained)
npm run scan -- --install "D:\SteamLibrary\steamapps\common\Aerofly FS 4 Flight Simulator"
npm run export -- examples/tower.project.json --install   # build a POI and install it into scenery/poi/
npm run gen:categories   # regenerate core/catalog/categories.data.ts from docs/ (names only)
npm run typecheck
```

`npm run scan` writes `catalog.json` (git‑ignored) and prints the bundle table — on a stock
install that is **911 objects** across 7 XREF bundles.

## The one hard rule

`src/core/` is **pure**: strings/objects in, strings/objects out — no Node, no DOM, no Electron.
The scanner (`main`/`cli`) does I/O and *feeds* core. This keeps the catalog logic 100%
unit‑testable and a future web port possible.

Nothing IPACS‑derived is ever committed: object **names** are facts (curated category table
ships in the repo), but scanned **dimensions** (`catalog.json`) and any `.tmi/.tmb` bytes never
enter the repo. Test fixtures use invented names.

## License

MIT © Juan Luis Gabriel
