# PCT — POI Creation Tool

Place **Aerofly FS 4** built‑in scenery objects on a satellite map, then export an
installable `scenery/poi/` package. A sibling to
[afs4‑pylon‑race](https://github.com/jlgabriel/afs4-pylon-race); shares its geometry and
POI‑folder conventions.

> **Status:** the scanner, export core + CLI, and the full **Electron editor** (first‑run wizard,
> satellite/streets map, object catalog, inspector, airport search, per‑object height, export/install &
> uninstall) are built and green — unit + golden tests, typecheck, and a Playwright/Electron smoke, all
> run in [CI](.github/workflows/ci.yml). Preparing the first public release (**0.1.0**); the export
> format is confirmed in‑sim. Builds are unsigned in v1.

## For Aerofly FS 4 users

PCT lets you decorate the world in Aerofly FS 4 with the sim's **own built‑in objects** — hangars,
towers, terminals, vehicles, parked aircraft, street lamps, and more — with no modelling and no file
editing. You place them on a real satellite map, and PCT writes a standard **POI scenery folder** you
drop into Aerofly.

**It ships no Aerofly content.** PCT reads the object catalog from *your* installed copy of the sim, so
you only ever place objects you already own.

1. **Install PCT** — download the build for your OS from the
   [Releases](https://github.com/jlgabriel/afs4-poi-creator/releases) page (Windows installer or
   portable · macOS dmg · Linux AppImage). Builds are **unsigned**, so the first launch needs one extra
   click — see [Desktop app & builds](#desktop-app--builds).
2. **Point PCT at your sim** — on first run the wizard auto‑detects your Aerofly install and user
   folders.
3. **Place objects** — search the catalog, click to drop an object on the map, then drag / rotate /
   scale it and fine‑tune its height in the inspector.
4. **Export & install** — *Export POI → Install into Aerofly FS 4* writes the folder into your
   `scenery/poi/`; restart Aerofly and fly to the area. The same dialog can **uninstall** POIs that PCT
   made.

**The POI packages you create are yours.** They're the program's output and are **not** covered by
PCT's GPL license — share or sell them however you like.

## For developers

The rest of this README is developer‑facing — architecture, commands, and builds.

### What the pure core delivers

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
npm run gen:categories   # regenerate the category table from docs/ (local-only; output is committed, so clones don't need docs/)
npm run typecheck
```

`npm run scan` writes `catalog.json` (git‑ignored) and prints the bundle table — on a stock
install that is **911 objects** across 7 XREF bundles.

## Desktop app & builds

```bash
npm run dev              # run the Electron app (electron-vite, HMR)
npm run test:e2e         # build + Playwright/Electron smoke (boots the app, checks the prod CSP)
npm run build:win        # Windows installer (NSIS) + portable   → dist/
npm run build:mac        # macOS dmg + zip  (must be run ON macOS)
npm run build:linux      # Linux AppImage
npm run build:unpack     # unpacked app only, no installer — a quick packaging check
```

Installers land in `dist/` (git‑ignored). Builds are **unsigned** in v1, so the OS warns the first
time you launch one:

- **Windows** — SmartScreen shows "Windows protected your PC" → **More info → Run anyway**.
- **macOS** — Gatekeeper says the app "cannot be opened" → **right‑click the app → Open → Open**
  (or System Settings → Privacy & Security → **Open Anyway**).

No code signing, auto‑update, or app icon yet — those arrive with the M3 public release.

## The one hard rule

`src/core/` is **pure**: strings/objects in, strings/objects out — no Node, no DOM, no Electron.
The scanner (`main`/`cli`) does I/O and *feeds* core. This keeps the catalog logic 100%
unit‑testable and a future web port possible.

Nothing IPACS‑derived is ever committed: object **names** are facts (curated category table
ships in the repo), but scanned **dimensions** (`catalog.json`) and any `.tmi/.tmb` bytes never
enter the repo. Test fixtures use invented names.

## License

**GPL-3.0-or-later** © 2026 Juan Luis Gabriel

PCT is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version. PCT is distributed in the hope that it will be
useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of merchantability or
fitness for a particular purpose. See the [`LICENSE`](LICENSE) file for the full text.

**The POI packages you create with PCT are your own.** They are the program's output and are
**not** covered by the GPL — do with them whatever you like.

PCT bundles third‑party components (Leaflet, React, Zustand, Zod, Electron, and others) under
their own permissive licenses; their notices are preserved in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
