# Aerofly FS4 — Technical Reference

> A field guide to the **Aerofly FS4 (AFS4)** file format and scenery‑placement
> behavior, distilled from hands‑on add‑on development. It documents the *simulator
> and its on‑disk format*, not any particular tool.
>
> - **Scope:** the simulator and its file format.
> - **State as of:** 2026‑08. Findings are dated where it matters; verify against your
>   own install before relying on anything. The sim changes between versions, and many
>   of the behaviors documented here are **undocumented by IPACS** — they can break
>   without notice.
>
> **Revised 2026‑08.** Sections 16‑18 are new — airports that actually load, missions,
> and the simulator's own executable as a vocabulary oracle — and §2, §3, §4, §7‑§10, §12 and
> §14 gained a month's findings from building complete airports. New material is dated inline.

---

## Index

1. [Where everything lives (installation layout)](#1-where-everything-lives)
2. [The file grammar `<[type][name][value]>`](#2-the-file-grammar)
3. [`tm.log` — the sim's diagnostic log](#3-tmlog)
4. [Placement: POI (`.tsl`/`.toc`) vs airport (`.tsc`/`.wad`)](#4-placement-poi-vs-airport)
5. [Built‑in XREF objects (placed by name)](#5-built-in-xref-objects)
6. [Orientation and headings](#6-orientation-and-headings)
7. [Heights and autoheight](#7-heights-and-autoheight)
8. [Plants (`list_plant`)](#8-plants)
9. [Lights (`list_airport_light`, `list_light`)](#9-lights)
10. [User `.tmb` objects (your own 3D models)](#10-user-tmb-objects)
11. [Built‑in POIs and landmarks](#11-built-in-pois-and-landmarks)
12. [Heliports and `.wad` projection](#12-heliports-and-wad-projection)
13. [Live flight data (UDP / ForeFlight)](#13-live-flight-data-udp)
14. [3D pipeline (Blender + converter)](#14-3d-pipeline)
15. [Datasets and external resources](#15-datasets-and-external-resources)
16. [Airports that actually load](#16-airports-that-actually-load)
17. [Missions](#17-missions)
18. [The executable as a vocabulary oracle](#18-the-executable-as-a-vocabulary-oracle)

---

## 1. Where everything lives

AFS4 has **two roots**:

- **Install dir** (Steam/DLC, read‑only). Example:
  `D:\SteamLibrary\steamapps\common\Aerofly FS 4 Flight Simulator`
- **User dir** (where the user and add‑ons write). On Windows:
  `C:\Users\<user>\Documents\Aerofly FS 4` (standard, **not** redirected to OneDrive).
  On macOS: `~/Library/Application Support/Aerofly FS 4`.

Key paths (relative to the appropriate root):

| Path | What's there | Text or binary |
|---|---|---|
| `tm.log` (user dir, root) | Startup log — **the oracle** (§3) | text |
| `flightlogs/tmflightlog.log` | Flight log | text |
| `scenery/xref/` | Built‑in objects by category (7 bundles) | binary `.tmb`/`.ttx` + **text `.tmi`** |
| `scenery/plants/` | Plant library (`.ttx`) | readable filenames |
| `airport_lights/` | Light fixtures (`al_*`) | binary `.tmb`/`.ttx`, **no `.tmi`** |
| `scenery/animated/` | Animated objects (only 4 `windturbine_*`) | binary |
| `scenery/poi/` | Built‑in **POIs** for the map layer (449 folders) | **opaque binary** `.tsl`/`.tmb` |
| `scenery/landmarks/` | 3D‑world text labels (`.tft`) | tile‑encoded |
| `scenery/airports/` | Airports with scenery (1569 `.wad`) | binary |
| `scenery/airports_db/` | World airport database (7934 `.wad`) | binary |
| `scenery/elevation/` | Terrain mesh (`.tth`) | **proprietary compressed bitstream** — not readable |
| User `scenery/xref/` | User XREF | mixed (§10) |
| User `scenery/poi/` | User POIs (where add‑ons install) | text you write |

**Counts from one reference install** (they vary by DLC):
911 XREF objects, 41 plants in 6 groups, 22 light fixtures, 449 POIs, 8139 ICAOs occupied.

---

## 2. The file grammar

Every AFS4 text file uses the **same tag grammar**:

```
<[type][name][value]>
```

and blocks nest:

```
<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8][name][My POI]>
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][false]>
        <[list_tmsimulator_scenery_object][objects][]
            ... one block per object ...
        >
    >
>
```

**Types you'll see:** `string8`, `string8u` (utf8), `stringt8c`, `bool`, `int32`,
`uint32`, `float32`, `float64`, `vector2_float64`, `vector3_float64`, `vector4_float32`, etc.

### Text vs compiled binary

- **Text:** the file starts with byte `0x3C` = `<` (literally `<[file][][]`).
- **Compiled binary (opaque):** starts with the magic **`B5 FE 24 C7`** (`b5 fe 24 c7 b7 3c eb b7`).
  Strings **don't** survive even `tr -c '[:print:]'`. It's the same container for `.tmb`,
  compiled `.toc`/`.tsc`, `.wad`, and the built‑in POI `.tsl` files.
- **Trivial runtime discriminator:** first byte `0x3C` → parse it; anything else → opaque.

### ★★★ Nothing may precede the root tag

**A text file must begin with `<[file][][]`.** A ten‑line `//` banner above it makes the parser reject
the **whole file**, and the only symptom is a single line: `ERROR: (error loading '…/pct002.tsc')`.
Comments at the END of a tag line are safe — files that fly are full of them — it is only the space
above the root tag that is fatal.

⚠️ Worth knowing before you debug it: an airport's `.wad` and `.tsc` are read independently, so a
banner in the `.tsc` alone leaves the ICAO registered in the world database **with no place behind
it**. The airport half‑exists: it cannot be flown, and it does not even appear in the LOCATION
search (§16).

★ The lesson underneath is not about banners. A *reader* you patched to accept community files says
nothing about what the *sim's* parser accepts — fixing your own parser is not permission to write the
same shape.

### ★★ How the sim resolves fields

`tm.log` reveals that properties **resolve by HASH of the name, not by position**
(it prints `hash=…`). Verified consequences:

| Aspect | Does it matter? | How it was validated |
|---|---|---|
| **Order** of fields | **NO** — hash lookup | a list rendered fine with fields in a non‑canonical order |
| **Type tag** (scalars) | **Lax** | emitting `float32` where the spec says `float64` still loads |
| **Arity** (vector2 vs vector3) and **string class** | **YES** | the parser does NOT coerce these — a `vector3` where a `vector2` is expected fails |
| **Name** of the property | **YES** | **the log tells you, without flying** |
| **Semantics** of the value | **YES** | only a flight confirms it |

⚠️ "The type tag is lax" applies **only to scalars the parser coerces**. **Vector arity**
and **string class** (`string8` vs `string8u` vs `stringt8c`) do matter. Example: a spec
printed two values inside a "vector3" because the real type was `vector2_float64`.

> **Format specs can be wrong.** Community‑authored format specs are the best available
> reference, but they contain confirmed errors: inverted field order in the light lists,
> a few wrong types in `list_plant`, missing fixture names. **When a spec and the
> disk/`tm.log` disagree, the disk wins.**

---

## 3. `tm.log`

`<user dir>\tm.log` (~140 KB, **rewritten on every sim startup**). AFS4 logs everything it
loads and **everything it rejects, with the exact path and the reason**. It is the most
informative diagnostic the sim exposes: most questions about whether a file was accepted,
and why it wasn't, are answered by reading it.

Line format: `<seconds>-<subsystem>: <message>`. Useful subsystems: `tmsimulator`,
`tmscenery`, `tmterrain_object`, `tmterrain_trees`, `tmfile_properties`, `menu_location`,
`tmsimulator_placement`.

```bash
grep -iE "error|warn" tm.log | head -30                 # everything that failed
grep -o "register xref '[^']*' -> [0-9]* geometries" tm.log
grep "menu_location" tm.log                              # where the user actually spawned
grep -i "<your_poi_name>" tm.log                         # what happened to YOUR file
```

⚠️ The `tmrenderer_vulkan: extensions:` line is thousands of chars — trim with `cut -c1-165`.

### The log is a SCHEMA ORACLE

```
tmfile_properties: WARNING: property 'model_center' is not a member of type 'cultivation' hash=…
```

That line tells you: (1) the sim **validates every property against its type** and warns
which one it doesn't recognize, **by name**; (2) it's a **general** mechanism; (3) it
resolves by **hash**. **It also covers list elements**, not just top‑level blocks (proven by
emitting a junk field inside a `<[plant][element]>` and seeing it warned about by name).

⇒ If you're unsure of a field **name**, emit it, start the sim, and read the log — the sim
itself tells you whether it recognized the name. What the log cannot tell you is the last
row of the §2 table (value semantics).

### The log PUBLISHES catalogs

At startup, the sim dumps its libraries. Example, `tmterrain_trees` (the entire plant
library, in ~4 s of startup):

```
grep -i "tmterrain_trees" tm.log
  type 'broadleaf'  variations=9   fi=1   size=4  (17.50) (16.50) …
  type 'conifer'    variations=10  fi=10  size=4  …
  type 'palm'       variations=7   fi=23  size=0  …
  gridsize=4  maxvis=32  tiles=864  treevisr=32  numtiles=864
```

⇒ **Look for a subsystem that enumerates whatever you care about**
(`grep -oE "^ *[0-9.]+-[a-z_]+" tm.log | sort -u` lists every subsystem). The log doesn't
only report errors: it publishes catalogs, and those catalogs are an **independent source**
for what the sim actually has loaded.

### `menu_location` = the REAL spawn point

```
menu_location: selected location lon/lat …  hdg_t = …  alt = …
```

This is **where the user actually spawns, and which way they're facing**. **An airport's
spawn point is NOT its reference point (ARP)** — the two can sit a kilometre apart, in
opposite directions. The log is the only place the real spawn is stated.

### ★★ The oracle is pinned on BOTH sides (canary + positive control)

The schema warning is only half an instrument until you also show it stays **quiet**. In one run,
inside the same element: two properties that genuinely exist (`tag`, `coordinate_system`) and one
invented. The real ones produced **no warning**; the invented one did. ⇒ the log **names what it does
not know and says nothing about what it does**, so a silent field is evidence rather than merely the
absence of evidence.

The shape of a gate that needs no flight: put a canary property inside **every container you want to
prove was parsed** — the place, the list element, each file. If a canary speaks, that container was
read. If a container is rejected whole, its nested canaries go quiet too — which is itself the
answer.

### ★★ Before reading an absence, prove the stimulus was there

"Zero warnings about airports" means nothing if no airport was loaded that run. A real case: nine
`tmworld_airport_detailed` warnings had to be attributed or cleared. The first grep returned zero —
uninformative, because the POI installed at the time had no `.wad` at all. The answer only existed
once a `.wad` was found on disk, **written earlier than the log**, with the run's own counters
(`airports=8141`) proving the sim had counted it. Check the file's timestamp against the log's, not
just that the folder exists today.

### The counters are instruments too

- `scanning airport and poi folders: airports=N` / `available airports: N` — how many airports
  registered this run. **A rejected airport does not increment them**, which is how you tell
  "ignored" from "loaded and wrong".
- `pois_local=N` — ★ **this counts PLACES, not folders**: the install's 449 plus **one per user
  `.tsl`**, so one POI folder holding four `.tsl` files adds four (§4).

### ⚠️ What the log does NOT report: textures

There is no `ttx '<file>': …` line in `tm.log`. That format string lives in the **content converter**,
not in the simulator — finding a string inside *a* binary does not tell you *which* binary prints it.
What the sim reports is failure: `ERROR: (texture '…' not found)`, `remove invalid texture at index
'diffuse'`. ⇒ for textures, **silence in the log is not a pass**.

### Other things the log teaches

- `register xref 'X' -> N geometries M materials` ⇒ the sim **loaded** your (text) `.tmb`.
  Validates your mesh without flying.
- `tmscenery: ERROR: (geometry '<folder>/<geo>.tmb' not found)` ⇒ the `.tsl`'s `geometry`
  resolves as a **file inside the POI folder**.
- `ERROR: unable to add shaders and textrures to '…'` ⇒ an object **with no texture** can
  take down the whole POI's render batch (see §10).
- Not every `ERROR` in the log is yours: IPACS leaves its own errors there (over‑long names,
  ICAOs out of the base). **Filter by your own paths.**

---

## 4. Placement: POI vs airport

There are two ways to place custom objects in the world. **The POI is the standard community route
for scenery; the airport route is what a site needs to own an ICAO, a spawn point and a place on the
map** (§12, §16).

### POI (`.tsl` + optional `.toc`) — CURRENT

One POI = one folder at `<user dir>/scenery/poi/<coord>_<name>/` with a `.tsl` (and a `.toc`
if it uses cultivation). **No `.tap`, no ICAO, no runway.**

⚠️ **The folder name MUST encode the coordinates or the POI never loads (with no error in
the log):**

```
e|w + |lon|×100 (5 digits)  then  n|s + |lat|×100 (4 digits)  then  _<slug>
```

Examples: `e01187n4838_munich_multicolor`, `w11988n3968_reno`, `e17473s3685_auckland`
(south → `s`). Precision is 0.01° (~1 km). Installing under `scenery/places/` with a flat
name is exactly why nothing renders on a first attempt.

The `.tsl` is a `tmsimulator_scenery_place_simple`:

```
<[file][][]
    <[tmsimulator_scenery_place_simple][][]
        <[string8u][coordinate_system][lonlat]>
        <[bool][autoheight][false]>
        <[list_tmsimulator_scenery_object][objects][] … >
    >
>
```

**Two ways to reference geometry from the POI:**

1. **Inline** (`type=object`): the object ships its own `.tmb` in the folder, referenced as
   `<[string8][geometry][<folder>/<tmb_basename>]>`. (E.g. custom pylons.)
2. **Cultivation** (separate `.toc`): places **built‑in objects by name** via `list_xref` /
   `list_plant` / `list_airport_light` / `list_light`. The `.tsl` points at the `.toc` with
   `<[string8][filename][poi]>` (basename, no extension).

A POI **does not appear** in AFS4's location search (it's ambient scenery) ⇒ you reach it by
spawning at a nearby airport and flying to the coordinates. ⚠️ AFS4's LOCATION screen
**does not accept numeric coordinates** either — only an ICAO search or a click on the map —
so the practical way to reach a known lon/lat is to start from a searchable ICAO nearby.
**A POI can carry several `.tsl`/`.toc` pairs** — and that is how you get `autoheight` true and
false in one folder; see below, where it is measured rather than hoped for.

### ★★ SEVERAL `.tsl` in ONE POI folder — and each keeps its own `autoheight`

A `.tsl` can call **exactly one** `.toc` (it changed with FS4, and IPACS has declined to change it
back), but **a POI folder may hold as many `.tsl`/`.toc` pairs as you like** — community add‑ons ship
POIs with ten. Measured 2026‑08‑10, twice, without flying:

- **Names are free.** Four places in one folder (`aaa_first`, `poi`, `poi00`, `poi01`), each with its
  own `.toc`; all eight canaries spoke — four at place level, four inside the `.toc` elements. ⇒
  **FS4 reads every `.tsl` in the folder, under any name, and each loads its own `.toc`.**
  `pois_local` rose by four for that one folder (§3).
- ★★★ **Each place respects its OWN `autoheight`.** Two places in one folder, identical but for the
  flag: the `false` one kept its written ASL (three conifers left hanging in a column, exactly as
  written) while the `true` one snapped its plant to the ground. ⇒ the old either/or — **baked‑ASL
  lights or autoheight plants, never both in one POI** — is a limit of one‑file writers, not of the
  format (§7, §9).

### What a POI place does NOT have

Both refuted by name in `tm.log`, one run each (§3):

- **`cultivation_files`** is not a member of `tmsimulator_scenery_place_simple` ⇒ a POI cannot carry
  a list of cultivations; it takes the single string `<[string8u][cultivation][poi]>`. The airport
  `.tsc` *does* take the list (§16).
- **`use_height_offset`** is not a member of it either. That lever exists only on the `.tsc`'s
  `tmsimulator_scenery_cultivation` — there is no POI equivalent (§9).

### ★★ A `.tsc`/`.wad` dropped inside `scenery/poi/` is INERT

Verified 2026‑07‑31 with a control built to make noise: an `sname` of 36 characters, a length the sim
rejects with an ERROR **that quotes the file's path**. It emitted that error three times for files
under `scenery/airports/` in the same run, and **never** for the identical file under `scenery/poi/`;
the counters agreed. ⇒ the sim does not read airport files out of the POI tree. That makes "ship the
two files inertly beside the POI and let the user move the folder" a safe packaging trick — though
"today it does not read them" is not "it never will".

### Airport (`.tsc` + `.wad`) — the other route, and it works

A folder under `scenery/airports/…` with `<icao>.tsc` (`tmsimulator_scenery_place`, a superset of the
`.tsl`) + `<icao>.wad` (the world‑database entry) + whatever cultivation and meshes it uses.

⚠️ **CORRECTION to earlier editions of this document, which called this route legacy and listed a
`.tap` as part of it.** It is neither. IPACS ships 146 **text** `.tap` files under
`scenery/airports/`, but a `.tap` is an **authoring project file, not something the simulator
loads** — a user airport that flies contains no `.tap` at all (§16, §18). And the route is current:
it is how a site gets an ICAO, a spawn point and a presence on the map, none of which a POI can ever
have.

Gotchas, all found via `tm.log`: the `.tsc` needs **≥1 runway or helipad** or it is rejected by name
(§16); `has no wad file` is non‑fatal.

⚠️★ **A user `.tsc`/`.wad` silently OVERRIDES a base airport by ICAO.** `tm.log` sings it:
`skipping duplicate place … icao='LSGB' using '<userdir>/…'`. This is by design (it's how
add‑ons replace airports) **but ⇒ a duplicate ICAO erases a real airport and the only trace
is one log line.** A POI cannot do this; only the airport route can.

---

## 5. Built-in XREF objects

Built‑in scenery objects (buildings, towers, hangars, vehicles, parked aircraft…) are placed
**by name** from a `list_xref` cultivation in the `.toc`:

```
<[tmsimulator_scenery_object]…>  // inside list_xref
  name / position (lon lat height) / direction / scale_factor
```

### The catalog: TEXT `.tmi` files

`scenery/xref/` splits into 7 category bundles. Each bundle has:
- `xref_<cat>.tmb` — binary geometry for ALL objects (opaque).
- `*.ttx` — compiled textures (opaque; there are no thumbnails anywhere in the install).
- `light_config.tmc` — text; lights attached per building.
- **`xref_<cat>.tmi` — a TEXT index** in the standard grammar. One entry per object:

```
<[tmxglscene_info_entry][element][N]
    <[string8u][name][street_lamp_orange_double__low]>
    <[vector3_float64][bb_min][x y z]>   <[vector3_float64][bb_max][x y z]>
    <[vector3_float64][bs_center][x y z]> <[float64][bs_radius][r]>
>
```

**`bb_max − bb_min` = size in meters. Z = vertical (height); X·Y = footprint.** Verified to
match the object's actual in‑sim size exactly. ⇒ **name and exact size are both available
from text**; the binary geometry never has to be opened.

### ★★ THE NAME IS THE ENTIRE CONTRACT, and case is real

Names are **not** all‑lowercase: the catalog has `mobile_LightTower`, `A320_dlh`,
`FuelTruckBigSemi` alongside `silo_00`/`car_00`. **A name that doesn't resolve FAILS
SILENTLY: no error in `tm.log`, no object in the world** — the miss is indistinguishable
from any other reason an object might be absent. `mobile_lighttower` does not exist among
the 911; `mobile_LightTower` does.

Other local catalogs derivable from text or filenames:
- **plants** `scenery/plants/` (`group__iNN__hHHHH_color.ttx` — the `h` is missing from two
  files added by the FS4 beta stream, so treat it as optional when parsing)
- **airport lights** `airport_lights/al_*` (~15 types; use the name without `al_`)
- **animated** `scenery/animated/` (only 4 `windturbine_*`)

---

## 6. Orientation and headings

**The `.toc`/`.tap` `direction` is a ROTATION, not a compass heading.**

- Base reference: the date line pointing **east = 090°**; **clockwise** rotation.
- Formula confirmed in‑sim (across three diverse classes: aircraft + vehicle + building):

  ```
  heading = (90 − direction) mod 360        (⇔ direction = (90 − heading) mod 360)
  ```

  Base **90° East**, **negative** sense. Verified predictively: at `direction 0` everything
  points East; `dir 90` → North, `dir 270` → South.

- **The per‑object base is NOT derivable** from anything scannable (the `.tmi` has only name
  + AABB); it isn't exposed in any user‑readable file. In practice every object tested so far
  shares the same base — **zero reproduced exceptions** to the formula above.

⚠️ **An axis‑symmetric object cannot reveal the SENSE of the rotation.** An elongated box
swings N–S → E–W at `direction 90` and at `direction −90` alike — an axis is a line, and the
box reads the same 180° apart. The cardinal angles (0/90/180/270) hide the sense for the same
reason. Establishing it requires an **asymmetric object with a visible front, at a
non‑cardinal angle**.

Model axes (from a `car_00` diagram): **X = length, Y = width, Z = height, base at 0** —
matching the +Y=North / +X=East / clockwise footprint mapping.

---

## 7. Heights and autoheight

**The two object classes behave like mirror images.** Established via community/IPACS
discussion (2026‑07) and confirmed in‑sim.

| | XREF (cultivation, by name) | TMB (POI with its own geometry) |
|---|---|---|
| **autoheight** | **doesn't exist** for a bare xref (only RUNWAYS have it; POIs and HELIPORTS don't) | **works** — set the place `autoheight=true` and the object height to 0 |
| **Rotation** | `direction` settable | **missing** (you can't rotate a POI in FS4) |
| **Scale** | uniform `scale_factor` yes | not settable |
| ⇒ height | **you must write absolute ASL** in the `.toc` | mesh + offset |

**⇒ An XREF in a POI has no autoheight to fall back on: its height must be written as
absolute ASL.** "height 0 + autoheight" sinks the xrefs to sea level.

### ★★★ `autoheight=true` forces every plant to height 0

> `<[bool][autoheight][true]>` in the `.tsl` **forces EVERY plant in a `list_plant` to height
> 0 and ignores its `altitude`.** `false` ⇒ each plant uses its `altitude`.

At a site with ~584 m terrain that **buries every plant 584 m** — and it fails with a
perfectly clean `tm.log`, since nothing about the file is malformed. The same flag is **inert
for xrefs and fatal for plants**, so its effect cannot be generalized from one object class to
another. **Write `autoheight=false`** unless deliberately using the dummy‑anchor behavior
below.

### The dummy trick: XREF autoheight via a buried anchor

XREF autoheight **does work if the POI carries a tiny dummy element buried at the center
coordinates** (demonstrated in the community and confirmed in‑sim). Then `autoheight=true` +
height 0 **snaps each xref to the ground dynamically** (and follows terrain re‑leveling).
Under this mode, **the xref's z is AGL (meters above ground), not ASL**: tower/church/crane at
z=0 → flush; a tank at z=25 → floats 25 m. Without the anchor, an object at z=0 **is not
placed** (invisible sphere) ⇒ the anchor is **necessary**.

- ⚠️ The dummy creates a scenery **exclusion** ⇒ it must be minimal (a ~5–10 cm disc) so it
  doesn't exclude the real objects.
- The dummy is an ordinary user object: it needs its own geometry **and its own texture**
  (§10, §14).
- **This is UNDOCUMENTED behavior** (the spec says `CULTIVATION - NOT!` for autoheight). A sim
  update can break it without notice.

### Terrain elevation: external source vs the sim mesh

- The `scenery/elevation/*.tth` mesh is a **proprietary compressed bitstream** — the sim's own
  terrain heights are not readable from disk. Ground elevation has to come from an external
  source (e.g. **Open‑Meteo**) or from measurement in the sim.
- **Measured 2026‑07‑20 at a ~584 m site: Open‑Meteo says 584 m; the sim says ~588 m ⇒ ~4 m
  difference.** An object written at 584 ASL over 588 m terrain ends up **4 m underground**
  (anything under 4 m tall is swallowed whole).
- ⚠️ **The bias is NOT constant:** the same row measures 584/583/582/582/579 over 2 km. Don't
  "correct" it with a global offset. Public airport datasets (§15) usually **carry no
  elevation**, so ground height always comes from an elevation API or manual measurement.
- **Reading the sim's own terrain height** (the ground truth an elevation API is checked
  against): LOCATION → move the aircraft to the point → switch to ground (GND) → terrain
  elevation = **ALT − GND**, then read the coordinates off the HUD.

### ★★ Placing a POI correctly is THREE passes, and the third is per object

Measured 2026‑07‑29 by reading the installed `.toc` against the HUD:

1. **Export with whatever an elevation service gives.** At the reference site that baked 585 m and
   put the whole POI ~3 m underground.
2. **Write the SIM's own elevation as the site's base.** Also several attempts: 588 overshot
   (everything floating), 587 landed. ★ The failure here was **parallax** — the elevation had been
   read while flying *near* the objects, over ground that slopes away. **The reading without
   parallax is to LAND beside the objects and read ALT with GND at 0.**
3. **Finish per object** with a terrain‑relative offset, negative included, in as many rounds as the
   slope needs. One number describes a site, not its gradient.

★★ **The diagnosis is the PATTERN, not the object.** Under a uniform error the SMALL objects vanish
(a 1.5 m car) while TALL ones merely look squat (a 6.8 m hangar) ⇒ **if the small ones are gone and
the tall ones survive, the site elevation is wrong, not the objects.** And **half a metre is not
visible on the object — it is visible in the DETACHED SHADOW**, which is how fine error is caught
from a distance.

### The ceiling: the mesh itself moves ±1 m

Reported on the forum by the format author (2026‑08‑10) after measuring a deliberately flat heliport:
**the base height changes by about ±1 m depending where you stand.** ⇒ no height strategy —
autoheight, a per‑site elevation, an elevation API — can beat that; the last metre is not your error.
His practical criterion, from someone who tends towards perfection and gave up on this one: height
accuracy matters **where the user is close**. Cars floating slightly across a large apron: fine. The
helipad under the skids: exact. **Precision is local, not global.**

---

## 8. Plants

`list_plant` in the `.toc`. **Billboard** placement (no `direction` or `scale`; `height_range`
is the size).

> Note: these are plants **you** place. The sim also grows its own autogen vegetation and
> buildings, and that layer is **derived from OSM data** ⇒ what naturally exists at a given
> location can be looked up in OSM/Overpass without opening the sim.

### The library (from `tm.log`, authoritative over the spec)

The sim publishes `tmterrain_trees` at startup: **41 plants in 6 groups** (`alley`,
`broadleaf`, `conifer`, `conifer_forest`, `palm`, `shrub`). It matches the scan of
`scenery/plants/*.ttx` exactly ⇒ 3 independent sources (filenames · spec · sim).

- ★★ **`fi` = FIRST INDEX in a flat array of 41 (0..40).** The sim **renumbers each group from
  0** and ignores the gaps in the filename. That's why `palm` runs 0..6 even though the
  filenames are `i08…i14`.
- **`species` = the number from the FILENAME** (e.g. `palm/11`), **not** a 0‑based ordinal.
  ⚠️ `fi=23` reads like an ordinal and invites the wrong conclusion; the two numbering schemes
  coexist in the same log line.
- Correct `list_plant` types (the spec has them wrong): `vector2_float64` position ·
  `vector2_float32` height_range · `stringt8c` group/species.

### ⚠️ The library is NOT fixed across versions

The 41 above were the count on the reference install. A beta stream in 2026‑08 published **88**
through the same `tmterrain_trees` block (`alley` 1 · `broadleaf` 43 · `conifer` 14 ·
`conifer_forest` 3 · `palm` 11 · `shrub` 16) and shipped two files whose names lack the `h` before
the centimetres; IPACS then **withdrew** the new plants, to reappear later. ⇒ **read the count from
`tm.log` at run time and parse the filenames leniently. Never hard‑code either.**

### 🐞 Sim bug: plants BLINK depending on the camera

They appear/disappear as you move the view (multiple independent observers). **Only
trees/plants blink; xrefs NEVER** (each xref carries its own bbox). When a plant does draw, it
is at the right position and height ⇒ this is **culling/visibility, not placement**.

- **Cause:** the cultivation bbox, **without an anchor object, is computed at height 0**. On
  high terrain (~583 m) the frustum rejects it except at a wide/distant view. On very low
  terrain (~4 m): stable.
- **Workaround:** give each plant POI **its own** anchor dummy (one at the centroid, at mid
  ASL) → this gives the tile its volume and the plants stay put. Whether very sparse plantings
  need more than one dummy is untested.

---

## 9. Lights

Two sibling lists in the **`.toc`** (there's no pairing with the `.tsl`; everything lives in
the `.toc`). They go **before** `list_xref` in the `cultivation` container.

### `list_airport_light` (built-in fixtures)

Real field order (**name‑first**; the spec has it inverted):

```
type_name (string8u) → configuration (string8u) → position (vector3_float64 LON LAT HEIGHT)
→ orientation (float64!) → group_index (uint32)
```

- `configuration` = color letters `b/g/r/w/y`; empty = the fixture's default color. For
  directional fixtures like PAPI, two letters (e.g. `wr` = white/red by orientation).
- `orientation` is **float64** (not the xref's `float32 direction`!).
- **22 fixtures**: enumerate `airport_lights/**/*.tmb`, `typeName` = basename without `al_`,
  **exclude `*_model`**. `runway_edge_light` is used 40× but is **missing from the spec's
  list** → the scan wins.
- **No bbox and no intensity control** ⇒ the sim draws a **point**. With a few loose lights,
  they're tiny dots.

### `list_light` (parametric lights, no catalog)

```
position → color (vector3_float32 RGB) → intensity (float32 0..100000)
→ flashing (vector4_float32 [A B C D], D=0) → group_index (uint32)
```

Confirmed in‑sim: intensity works (int=100 dim vs 100000 bright); flashing `[1 0 3 0]` blinks
on a slow cycle (~6 s, A=1 ⇒ 6s/A).

### ★★ Hard rules for lights

- **Only visible at NIGHT/DUSK.** They're emitters, not daytime geometry; by day the glow
  washes out against the sky. This holds regardless of `group_index` — group 3 = "on 24h" is
  **not** "visible by day", and group‑0 lights only exist ±40 min around night.
- **Height is ASL** (same rule as XREF): a fixture at `height 614` floats ~30 m above 584 m
  terrain.
- **HELIPORT fixtures are mute on their own** (`helipad_beacon` needs its platform;
  `helipad_flood` illuminates a surface). The reliably visible ones are the RUNWAY fixtures:
  `runway_edge_light`, `papi_3_light`, `runway_end_light` (confirmed "dim but fine").
- **On a runway, custom lights are lost** among the sim's own edge/centre/threshold lighting;
  against unlit terrain they read clearly.
- **★★★ autoheight BURIES lights.** The anchor dummy lands the XREFs but **NOT** the
  `airport_light` fixtures: their z is treated as absolute (15 → 15 m ASL → ~573 m
  underground). Lights don't participate in the anchor's AGL snap. ⇒ **lights are baked‑ASL
  only.**
- **Lights‑only POIs are NOT culled.** A bare baked‑ASL lights POI does render; loose lights
  are simply very small on screen, which reads as absence from any distance.

### `use_height_offset` — and where it does not exist

An airport `.tsc` carries `use_height_offset` on each `tmsimulator_scenery_cultivation`, and one
place may hold **more than one cultivation** — which is how an airport can put one group of lights on
the ground and another up in its lamps. **A POI has no equivalent:** the property is refuted by name
on `tmsimulator_scenery_place_simple`, and a POI place takes a single cultivation *string* (§4). ⇒
inside a POI the only per‑place height lever is `autoheight` — which, since each place keeps its own
(§4), is now enough to hold baked‑ASL lights and autoheight plants in one folder.

---

## 10. User `.tmb` objects

A user's own 3D objects in `scenery/xref/`. They come in **two opposite classes**:

1. **AC3D‑exported (community) = PLAIN TEXT.** Same grammar. Starts with `<[file][][]`. The
   XREF name lives in `tmxglscene → geometry_list → tmxglgeometry → <[string8u][name][…]>`
   (**not** the material `name`). The `point_list` `(x y z)(x y z)…` gives a computable bbox. ⇒
   **name + bbox extract straight from the `.tmb`** with the existing parser.
2. **IPACS‑compiled = OPAQUE BINARY** (magic `b5 fe 24 c7`). Neither the name nor "box" appears
   in any encoding. Unreadable.

Discriminator: first byte `0x3C` → text; otherwise → opaque.

### ★★ To resolve from a POI: a `.tmi` in a SUBFOLDER (mandatory)

The exact recipe:

- A loose `.tmb` in the **root** of `scenery/xref/`, **without** a `.tmi` → **doesn't resolve**.
- A `.tmi` next to the `.tmb` in the **root** (no subfolder) → **still doesn't resolve**.
- `.tmb` + `.tmi` in their **own subfolder** → **✅ resolves** (the POI references the internal
  geometry name).

⇒ **AFS4 only indexes a bundle that sits in its own subfolder.** **The unit of registration is
the FOLDER** — real add‑ons ship as a **one‑folder ZIP**, so on extraction each `.tmb` lands
one level down, never in the root.

For a **text** `.tmb` the `.tmi` can be derived from the file itself: `bb_min`/`bb_max` from
the `point_list`, `bs_center` = bbox midpoint, `bs_radius` = half the bbox diagonal, floats
written to `toFixed(6)` with negative‑zero normalization. For an **opaque** `.tmb` neither name
nor bbox is recoverable, so its `.tmi` can only come from the object's **author**.

- The resolution key is the **internal geometry name** (`<[string8u][name][pylon_15m]>`), not
  the file basename. Renaming a `.tmb` so its filename matches the internal name is convenience,
  not a requirement.
- A layout that works (some community packs): **one folder with N single‑geometry `.tmb` files
  + a single multi‑entry `.tmi`** whose `filename` matches no basename. This breaks the "one
  `.tmi` per `.tmb`" invariant suggested by the built‑ins (each = one multi‑geometry `.tmb`)
  ⇒ the mapping between `.tmi` entries and `.tmb` files is **not** one‑to‑one in general.

### ★★ The texture is NOT optional

A hand‑written text `.tmb` **loads** (`register xref … -> 1 geometries 1 materials`) but if its
`texture_list` is EMPTY, the sim logs `unable to add shaders and textrures` and **the entire
POI stops drawing — even its own witness object.** There is no working untextured `.tmb`: the
text pylons that render each have 1 texture; known‑good dummies ship with a `.ttx`. ⇒ for your
own dummy **you must also generate a `.ttx`** (compiled binary) — and that only comes from the
official pipeline (§14). Blender does **not** speak `.tmb`/`.ttx` directly.

### ★★ A user `.tmb` called from a POI's `objects` block: position, and nothing else

The other way to use your own mesh is **inline**, from the `objects` block of the `.tsl`, instead of
by name from a cultivation. It resolves — **including an opaque binary `.tmb`** — verified
2026‑08‑09 with a canary in the same element and a deliberately missing geometry as control (the
control produced `ERROR: (geometry '…' not found)`, so the silence around the good one meant
something).

What it costs, measured by refutation in `tm.log` — **eight property names across two runs**:

| | XREF (from a cultivation) | inline TMB object (from `objects`) |
|---|---|---|
| position / height | ✅ | ✅ |
| **rotation** | ✅ `direction` | ❌ `direction`, `orientation`, `rotation`, `heading`, `angle`, `yaw` — all refuted |
| **scale** | ✅ `scale_factor` | ❌ `scale_factor`, `scale` — refuted |
| on disk | one copy in the XREF folder | one copy **inside every POI that uses it** |
| hides the autogen object underneath | ❌ | reported yes — **not verified here**, it is a visual question |

⇒ an inline TMB object can plant **a point**. The fields it accepts are `type`, `geometry`,
`position`, `autoheight_override`, `tag`, `coordinate_system`.

### The exclude object

The one use that needs neither rotation nor scale, and the reason community add‑ons carry these: an
**exclude** mesh that suppresses the sim's autogenerated buildings and trees where they land on top
of your scenery — trees on a helipad, masts off the end of a runway. The pattern, as published on
the forum: one mesh per size (5 / 10 / 20 / 25 / 50 / 100 / 200 / 500 / 999 m), placed **10 m
underground** with `autoheight_override = -1`, several in a row for a long obstruction:

```
<[list_tmsimulator_scenery_object][objects][]
    <[tmsimulator_scenery_object][element][]
        <[vector3_float64][position]      [0.000000 0.000000 -10.0]>
        <[int32][autoheight_override]     [-1]>
        <[string8][geometry]              [exclude…]>
        <[string8u][tag]                  []>
        <[string8u][type]                 [object]>
    >
>
```

★ Three details that are not guessable: the negative z, the `element` written **without an index**
(`[]`, not `[0]`), and `geometry` as `string8` — the last one harmless, since the scalar type tag is
lax (§2). The same block works in a POI `.tsl` and in an airport `.tsc`.

⚠️ When it is needed is specific, not general: FS4 grows buildings where the photo simply looks
different, so the cases are "trees exactly on the pad" and "masts at the runway end". If the autogen
already reads as hangars, it is not in the way.

---

## 11. Built-in POIs and landmarks

- **Built‑in POIs** (the landmarks in the Location menu's "POI map layer" — famous buildings,
  bridges, etc.): live in `<install>/scenery/poi/`, **449 folders**. Content is **compiled to
  opaque binary** (`.tsl` + `.tmb` + `.ttx`, sometimes `.toc`) — not parseable, not touched.
  - ★★ **But the FOLDER NAME already carries the importable part:**
    `e00216n4139_sagrada_familia` is exactly the `encodeLonLat` scheme (§4). **449/449 follow
    it** (strict lowercase regex). Precision 0.01°. Reading only names = **zero IPACS bytes** →
    a clean import path (e.g. exporting built‑in POI coordinates to GeoJSON).
- **`scenery/landmarks/`** (2229 `.tft` files, `lm_07_0000_aa00.tft`): these are the **3D‑world
  text labels** (font `texture/landmarks.tff`), **NOT** the POIs. Don't confuse the two.

---

## 12. Heliports and `.wad` projection

A heliport is a POI with three files added on top — flown end to end on 2026‑07‑31 (below):

```
<folder>/<icao>.tsc     <- replaces the .tsl as entry point; references the cultivation by name
<folder>/<icao>.wad     <- entry in the world DB (map / flight planner / nearest)
<folder>/poi.toc        <- a COPY of the poi.toc, next to the .tsc
```

The `.tsc` (`tmsimulator_scenery_place`) is a superset of the `.tsl`: it adds
`sname/lname/icao/country`, `helipads[]` (name, position, radius, **heading in degrees**), and
an explicit position. The `.wad` (`tmworld_airport_detailed`) carries `uid`,
`icao/iata/name/country`, a **projected** position, and helipads with `direction` **in
radians**. **Both are TEXT `<[file]`** ⇒ a ~200‑line emitter can write them.

### The 3 GCS→WAD conversions (verified exact against 47 IPACS `.wad` files)

```
lon_WAD = 65536 · (0.5 + 0.5 · lon/180)
lat_WAD = 65536 · (0.5 + 0.5 · (tan(K · lat/180) / K))      K = 2.3311223704144
direction_WAD = radians( (90 − heading) mod 360 )
```

- ★ **The latitude one is NOT Mercator; it's a TANGENT projection.** K satisfies
  `tan(K/2) = K`, which makes ±90° land exactly on 0 and 65536. It differs from Mercator by 53
  km at lat 49° — it's **a different function**, not an approximation. Validated by inverting
  float64s from 47 binary IPACS `.wad` files: **the tangent wins 46 to 1** (the single "tie"
  falls right where both curves cross). ⇒ this projection **is** IPACS's.
- The direction one is the same formula as §6, but the `.toc` wants it in **degrees** and the
  `.wad` in **radians**. Which means `direction_WAD` is simply the raw `.toc` `direction`
  converted to radians — not a second formula.
- The three conversions are cheap to implement and easy to check: PCT shows the projected values
  for whatever is selected, under the LON/LAT and HEADING it came from, and writes them itself when
  it installs an airport. (Earlier editions of this document said the read‑out was all it did — that
  stopped being true in **v1.3**, which installs the `.tsc`/`.wad` pair after checking the code
  against every airport present on that machine.)

### Useful facts

- **Unique ICAO:** must be **4–6 characters** and appear **exactly once** in the user's FS4.
  Checked without parsing anything: **the filename IS the ICAO** (`airports_db/<icao>.wad` +
  `airports/<cc>/<icao>/` + user folder). In the reference install: **8139 ICAOs occupied**.
- ★ **A helipad is NOT an object.** Searching `heli`/`pad`/`rotor` across the catalog's xrefs
  gives **ZERO**. The `<[tmsimulator_helipad]>` is just name+position+radius+heading: **no
  model, no bbox, no footprint, no catalog row.** The *visible* pad is a custom `.tmb` +
  textures (and the `geometry` can escape the folder with `../`).
- ★ **An EMPTY `.wad` (`<[file][][]>`, 12 B) loads cleanly** (zero mentions in `tm.log`) ⇒
  **the projection is OPTIONAL:** it buys presence in the world DB (map / flight planner /
  nearest). To merely exist and be landable, the `.tsc` is enough.
- ⚠️ **Hard length limit on `sname`:** the sim REJECTS the whole airport if it's too long
  (`ERROR: airport name '…' too long`). The measured limit is in **[30, 34] characters**.
- A dimensionless `scale_factor` ≠ a helipad `radius` (meters): same conceptual slot, different
  quantity.
- The `.tsc`/`.wad` pair **references nothing from the cultivation** except
  `<[string8][filename][poi]>` — no xref, no height, no catalog. It sits on top of a finished
  POI rather than replacing any part of it.

### ★★ Flown end to end (2026‑07‑31): the heliport IS the POI

Two text files written by hand beside an existing POI, installed as
`scenery/airports/<continent>/<country>/<slug>/`, and the sim took them at the first attempt:

- **The projection above was CONSUMED, not merely read.** The pad landed exactly where intended,
  beside the runway of a real airport — the tangent formula, until then validated by *inverting*
  IPACS's binaries, is now validated by *writing*.
- **`cultivation_files[]` in the `.tsc` pulled the POI's own `.toc`**: the helicopter appeared
  surrounded by the POI's hangar, aircraft and palms. **The heliport and the POI are one place**, not
  two things at the same coordinates.
- Loose ends closed in the same run: `coordinate_system` = `flat` **loads**; `uid` = 0 is fine; the
  `airports/<continent>/<country>/<name>/` depth works; a **6‑character ICAO** works.
- The sim's own panel offered **Ready for departure / Before engine start / Cold and dark** ⇒ it is a
  first‑class departure location, not merely a place to land.

### ★★ Units and angles, read off the sim's own panel

- **`radius` is METRES.** With `radius 10` the LOCATION panel printed **"Size 66 ft / 20 m"** — which
  also settles that it is not the dimensionless `scale_factor` of an XREF wearing another name.
- **`heading` in the `.tsc` is TRUE; the panel displays MAGNETIC.** We wrote 40 and the panel read
  **028** — 12° being the local magnetic variation, corroborated in the same screenshot by the sim
  labelling a runway 08 as "Heading 078". ⇒ write true heading verbatim, convert nothing. ★ This was
  only visible because the probe used a **non‑cardinal** angle; at 0 or 90 the offset would have
  passed for rounding (§6).
- **Elevation is computed by the sim.** It was never given one.

### ★★ How your airport appears in LOCATION — and how it does not

**The text search matches the NAME, never the code.** Searching the code found nothing; searching a
word of the name found it — three separate runs. **And the row comes up BLANK**: correct distance, no
text, while **the map panel shows your name and your code perfectly.**

The mechanism, confirmed by a second author's screenshots rather than deduced: the LOCATION list
takes its text from **AFS4's world airport database** (~31 000 entries, far more than the ~8 100
`.wad` files on disk).

| your ICAO | in the world database? | search row | map panel |
|---|---|---|---|
| invented (`PCT001`) | no | **blank** — distance only | your name + your code |
| real but unbuilt (a small identifier with no `.wad`) | yes | **IPACS's** name for it | your name + your code |

⇒ if the code exists in that database the sim prefers **its** text and ignores yours; if it does not
exist, there is nothing to print. Two consumers read the same `.wad` and only one of them looks at
what you wrote.

⚠️ **This has caused three separate false alarms of "it does not work".** An airport that loads and
flies perfectly *looks* broken if you send someone to the search box. Say it before you send anyone
there: search by NAME, expect a blank row, trust the map.

★ **Practical consequence, and it is also the safe choice**: prefer a **real** code that has **no
`.wad`** on disk. It is known to the database (so it looks normal in the search) and there is no
scenery to destroy — which is exactly why a real, unbuilt heliport code can be reused safely, and why
an invented one is the case that shows up blank.

❌ **Refuted along the way:** the blank row is **not** an ICAO‑case problem. Reinstalling with the
code in capitals produced exactly the same blank row.

### ★★ ICAO case: capitals inside the files, lowercase on disk

The `icao` rows in both the `.tsc` and the `.wad` go in **capitals**; filenames and folder names are
**lowercase**. Verified on disk rather than taken on authority: an IPACS airport folder of lowercase
`de0025.*` files whose `.tap` carries `<[stringt8c][icao][DE0025]>` beside
`<[stringt8c][country][de]>`. **Code up, country down, disk down.** The sim compares codes
**case‑insensitively**, so getting this wrong breaks nothing structurally — which is exactly why the
mistake can survive two releases unnoticed.

---

## 13. Live flight data (UDP)

AFS4 emits flight data as **plain‑text UDP, ForeFlight protocol, port 49002**:

```
XGPS<sim>,<lon>,<lat>,<alt_MSL_m>,<track_deg_true>,<groundspeed_m/s>
XATT<sim>,<heading_deg_true>,<pitch_deg>,<roll_deg>
```

- `<sim>` = `Aerofly FS 4` (has spaces, **no commas** → splitting on comma is safe).
- Units: lon/lat degrees, altitude **MSL meters**, groundspeed **m/s**, angles degrees.
- **There is no AGL.**
- Measured rate: **~5 Hz in flight** (~3.3 Hz in menu). lon/lat with ~4 decimals (~11 m) —
  enough to track the aircraft's position; a receiver tolerates down to 1 Hz.
- The SDK's "External DLL" method is **Windows‑only**; UDP is the cross‑platform channel.
- FSWidgets is a separate channel (port 58585, opt‑in).

Community Python receivers exist for this stream.

---

## 14. 3D pipeline

The official route from a modelling tool to the sim's own formats (`.tmb` geometry + `.ttx`
texture):

```
Blender 5.2.0 LTS  +  io_scene_tgi addon (from the SDK zip)  →  .tgi
        →  aerofly_fs_content_converter.exe  →  .tmb + .ttx
```

- The converter generates the `.ttx` texture from a **`.bmp`**.
- ⚠️ **Converter gotcha:** it requires a `.tsc` with a `coordinate_system` or it converts **0
  geometries**. Feed it a minimal `.tsc` and extract only the asset.
- **Trivial geometry needs no modelling tool:** a **text** `.tmb` (AC3D flavour) is a readable
  scene graph, and something like a 5 cm cube is 8 corners of trivial math, so it can be written
  by hand. Non‑obvious details of the format: every non‑empty list carries a **trailing space**
  before `]>`; `index_list` is **empty** and the topology travels in `strip_index_list` (strips
  with degenerate stitches); `vf_size=8` = pos+normal+uv; the bbox comes from
  `mesh_collision.point_list`. **BUT** see §10: with no `.ttx` the object takes down the POI's
  render ⇒ a usable asset still needs the converter for its texture.
- **The texture format is a one‑line choice, and it is platform‑specific.** The converter's
  `texture_base_type` accepts (tokens found in the converter binary itself): `ttx_dxt` · `ttx_bc7` ·
  `ttx_etc2` · `ttx_astc4x4/5x4/5x5/6x6/8x8` · `ttx_bu*` · `ttc_dxt` / `ttc_etc2`. A `.ttx` built as
  `ttx_dxt` is **S3TC/DXT1, desktop‑GPU compression** — which mobile GPUs do not implement, so a POI
  that ships one of these has a desktop‑only asset in it. ⚠️ **But a re‑encode is not free:** our own
  ASTC 6×6 build of a 16×16 texture, with and *without* mipmaps, **crashed FS4 desktop while loading
  terrain**, isolated to one variable (the same folder that had flown, byte for byte except the
  `.ttx`) — while another author's ASTC file of the same 520 bytes loaded fine. Their containers'
  first 96 bytes were identical and one payload‑size field differed by 3×. ⇒ **the file was ours to
  get wrong, not the format's to reject**, and matching file SIZE is not matching CONTENT. (Desktop
  FS4 does contain a software ASTC decoder — the code path exists; that is not the same as "works for
  POI textures".)
- **Licensing:** the SDK's "not allowed to distribute" notice covers **the converter `.exe`
  itself**; the `.tmb`/`.ttx` files it produces from your own model are your own authored work.
  Consult the SDK license for the exact terms.

---

## 15. Datasets and external resources

- **A public MIT‑licensed AFS4 airport dataset** (OurAirports‑derived / public‑domain base),
  distributed as static JSON. Typical contents:
  - An airport‑coordinates file — tuples **`[ICAO, name, lat, lon]`**, ~7845 airports. ⚠️
    **order is lat=index 2, lon=index 3** (not GeoJSON). **No elevation.** Includes community
    airports.
  - A core‑ICAO list (excludes community airports).
  - A GeoJSON variant — ~8513 features, **with** elevation (3rd coord) but **dubious
    precision**.
  - Being MIT‑licensed, a snapshot may be redistributed. The CORE list is the conservative
    one; the community airports it excludes are work in progress.
- **An official XREF library** has been publicly released (a ~400 MB zip) with a master
  **`xref_table.csv`** (753 objects, `;`‑separated): `internal name ; display name ;
  main/sub/type category ; length ; width ; height ; offset ; shape ; shape truescale`. It
  provides 3 things, 2 of which are **not** derivable from the `.tmi`: (1) **official display
  names**, hand‑curated (not reproducible by heuristic); (2) a **3‑level taxonomy**; (3) a
  **real footprint polygon** (the `.tmi` has only a bbox). Note: **redistributing this data
  requires IPACS permission.**
- **The community forum** (aerofly.com) is the primary venue for format discussion and bug
  reports. ⚠️ Practical tip: **the forum editor does not render markdown** ⇒ post in **plain
  text** (uppercase headings, `-` bullets; emoji, bare URLs, and `—` do work).

## 16. Airports that actually load

§12 covers the heliport, which is the smallest airport there is. This section is what a month of
building complete ones (2026‑07 → 2026‑08) added. **A user airport is a `.tsc` + a `.wad`, plus
whatever cultivation and meshes it uses, under `<user dir>/scenery/airports/`. There is no
`.tap`** (§4, §18). The depth below that folder is flexible — §12 flew `<continent>/<country>/<name>/`,
IPACS itself uses `<country>/<icao>/`.

### ★★★ The floor is one RUNWAY or one HELIPAD. Nothing else counts

An airport file with a complete identity, a coordinate, and five well‑formed but **empty** lists is
**rejected by name**:

```
ERROR: (no valid runway or helipad defined. invalid airport 'PCT No Pad'.
        tsc_file='…/scenery/airports/cl/pct002_pct_no_pad/pct002.tsc')
```

…and `available airports` did not move. The sim parsed the file, named it, and dropped it — the
loudest answer this log gives. ⇒ **parking stands and glider start positions do not satisfy the
requirement.** An airport with a runway and no helipad is perfectly legal; one with stands only does
not exist. (Measured 2026‑08‑14 without flying: a script wrote the folder, the sim was started and
closed, `tm.log` said the rest.)

### ★★ A place with no `objects` block is a database entry, not a scene

Four runs over the same airport, one variable at a time:

| variant | `objects` block | does its `.toc` load? |
|---|---|---|
| the place as written | no | **NO** |
| + `height`, `tower_position`, `autoheight_method`, `building_textures_folder` | no | **NO** |
| + `objects` → one tiny anchor mesh (1.9 kB) | yes | **YES** — every xref in it |
| a full airport with a 657 kB mesh | yes | **YES** |

⇒ **a `tmsimulator_scenery_place` needs at least ONE object whose geometry resolves, or nothing about
it is drawn — not the ground, and not even its own cultivation.** The runway still works as a
*database* entry (ATC, map, flight planner, spawn point); there is simply no scenery. The four extra
scalar fields were not the cause.

⚠️ Honest caveat: the `objects` block and the mesh file arrive together, since one references the
other. What is proven is *"a place needs an object whose geometry resolves"* — not which half of that
does the work.

The block that unlocks it — spelling verified in flight:

```
<[tmsimulator_scenery_objecttmslist][objects][]
    <[tmsimulator_scenery_object][element][0]
        <[string8][type]      [object]>
        <[string8][geometry]  [my_anchor]>
        <[tmvector3d][position][lon lat alt_msl]>
    >
>
```

⚠️ **Two spellings of the same block are in circulation and both fly**: the airport `.tsc` above uses
`tmsimulator_scenery_objecttmslist`, while POI `.tsl` files (§4) and the exclude blocks published on
the forum (§10) use `list_tmsimulator_scenery_object`. Each has been flown where it is shown here;
what has NOT been tested is swapping them.

⇒ **a complete airport with hangars, a tower and parked aircraft needs no mesh generation at all** —
XREFs from the catalogue (§5) plus one small anchor. What a mesh buys is the **ground**: without one
the runway is not drawn, and over photoscenery the result reads as a road rather than an airport.

### What each of the two files carries

They are not redundant — they have different consumers (§12).

| | `.tsc` — `tmsimulator_scenery_place` | `.wad` — `tmworld_airport_detailed` |
|---|---|---|
| identity | `icao`, `sname`, `lname`, `country` | `uid`, `icao`, `iata`, `name`, `country`, `tags`… |
| position | degrees | **projected** (§12) |
| runways | `runways`, every field suffixed `1`/`2` | `runway_pairs`, an array of exactly two ends |
| helipads | ✅ | ✅ |
| parking stands | `parking_positions` | — |
| glider aerotows / winches | — | **only here** |
| approach lights, PAPI, REIL | `appltsys1/2`, `papi1/2`, `reil1/2` | — |
| `approach`, `takeoff`, `elevation` | — | ✅ |
| scenery | `objects`, `cultivation_files[]` | — |

- **The format has no single‑ended runway.** It is always a pair — suffixed `1`/`2` in the `.tsc`,
  nested as an array of two in the `.wad`.
- **`endpoint` ≠ `threshold`**, and both are stored. They coincide unless the threshold is displaced,
  which is why keeping only one of them loses information the sim will not reconstruct.
- A `.wad` may be **empty** (`<[file][][]>`, 12 bytes) and still load cleanly (§12): the projection
  buys presence in the world database, not existence.

### ⚠️ Do not read the airport vocabulary out of a `.tap`

See §18. The `.tap` is the authoring project file, and it is the only airport format IPACS ships **in
text at scale** (146 of them, against 12 text `.tsc` out of 1569) — which makes it exactly the wrong
file to copy from. Its vocabulary differs from the one the simulator reads: `reil_omni`/`reil_uni`
where the `.tsc` wants `omni`/`uni`, `radius` where the `.tsc` says `size`, and a stand type declared
`<[float64][type]>` while holding a string. Rows written in `.tap` spelling are ignored **in
silence**.

### Loose facts worth knowing before you debug one

- **The `.tsc` and the `.wad` are read independently.** A `.tsc` the parser rejects (§2) leaves the
  `.wad`'s ICAO registered with no place behind it: in the database, unflyable, invisible in the
  LOCATION search.
- `sname` has a hard length limit and the sim **rejects the whole airport** above it, quoting the file
  (§12). The cut measured between 30 and 34 characters; IPACS trips it on three of its own.
- **The only `.tsc` in a standard install that uses `cultivation_files` is a user's.** IPACS packs its
  own airports differently, so there is **no shipped example to compare against** — which is why these
  questions had to be bisected rather than looked up.
- **Glider winch launches were broken in FS4 and were repaired during 2026‑08.** Treat any "feature X
  does not work" as dated: the sim gets fixed too.
- ⚠️ **Anything you disable must leave `Documents\Aerofly FS 4\` entirely.** The sim scans
  recursively, so renaming a folder is not enough, and leaving it in place gives you two `.toc` with
  the same name. That one costs a flight.

---

## 17. Missions

`missions/*.tmc`, **plain text**, the same `<[file]` container as everything else ⇒ writable with
whatever emitter you already have.

```
<install>/missions/custom_missions.tmc         IPACS's 92 missions (1.0 MB, TEXT)
<install>/missions/custom_flights.tmc  +  tutorial_flights.tmc
<user dir>/missions/custom_missions_user.tmc   the USER's — FIXED NAME
```

### ★★ The sim reads ONE user file name, and only that one

A second file (`missions/pct_gate.tmc`) was written and the sim started: `loaded 1 user defined
missions` (unchanged), **zero** new warnings, **zero** mentions of the file. Had it been read and
rejected, the schema oracle would have said so (§3). ⇒ **`custom_missions_user.tmc` is the only name
AFS4 loads**; anything else is ignored whole. Any tool touching missions must therefore
read‑modify‑write a fixed file that other tools also write.

### ★★ A user mission can start at an arbitrary lon/lat with NO ICAO

```
<[stringt8c][origin_icao]     []>                       <- EMPTY
<[tmvector2d][origin_lon_lat] [13.886350 45.889350]>
<[float64]   [origin_dir]     [301.4124390049686]>
<[string8]   [flight_setting] [cruise]>
```

The sim loads it (`loaded 1 user defined missions`, plus warnings about two properties that exist
only in that file — the oracle proving it was parsed). **None of IPACS's own missions leave
`origin_icao` empty** (0 of 102 that carry an `origin_lon_lat`); the capability surfaced through
community tooling, where it is simply what a converted flight plan with no airport in it produces.

`flight_setting`, counted across IPACS's files: `takeoff` 57 · `landing` 35 · `cruise` 6 · `taxi` 4 ·
`winch_launch` 3 · `aerotow` 3 · `before_start` 1. ⇒ **`takeoff` = ready on the ground**,
`before_start` = cold and dark on the ground. IPACS also writes `origin_alt`, the origin's elevation.

⇒ **this is the cheap way to stand an aircraft at an arbitrary point** — no ICAO, no `.wad`, no
`.tsc`, and therefore **no way to overwrite a base airport** (§4). ⚠️ Untested: whether an empty
`origin_icao` combined with `flight_setting = takeoff` really leaves you on the ground. The run that
would have shown it never executed, because of the fixed‑name rule above.

---

## 18. The executable as a vocabulary oracle

★★★ **`aerofly_fs_4.exe` carries the tag names and the enum values its parser recognises as plain
ASCII.** A strings pass — runs of printable bytes above a minimum length, filtered by regex — takes
about two minutes and answers questions that would otherwise cost a flight, or a forum post and a day
of waiting.

What one sweep returned, all of it since confirmed by files that load: **field names**
(`endpoint1`, `threshold1`, `appltsys1/2`, `papi1_glide_slope`, `papi1_spacing`, `reil1/2`, `width`,
`identifier`, `runway_pair(s)`, `parking_positions`, `start_positions`, `helipads`…), **type names**
(`tmsimulator_runway`, `tmsimulator_helipad`, `tmworld_airport_detailed_rwy_pair`) and **enum
values** (the approach‑light systems `std`, `alsf-1`, `alsf-2`, `malsf`, `malsr`, `calvert`,
`calvert-2`, `odals`, `rail`, `sals`, `none`; `left`/`right`/`both`; `uni`/`omni`).

★ It also carries **log format strings** — e.g.
`papi '%s':  sign=%.0f  spacing=%.2f  glideslope=%.4f` — which tells you in advance that a given
feature can be gated by reading `tm.log` instead of flying (§3).

### ★★ What is NOT in the binary is informative too — but not the way you would guess

Some values that appear in IPACS's own airport files are absent from the executable: the parking
tags (`parked_ga`, `parked_jet`, `pushback`) among them. The tempting conclusion — "so they must be
hashed" — is wrong. They are absent because **both sides are data**: the airport file names a tag and
the aircraft declares which tags it uses, so the simulator only ever compares two strings that came
out of files. The values it resolves itself (the light systems above) are present.

**Rule:** absence from the `.exe` ⇒ the value is *data* ⇒ go looking for it **in the files IPACS
ships**, and conclude nothing about hashing. Sweeping the ~85 700 files of an install for a literal
takes about two minutes, skipping `textures/`, `elevation/`, `images/`, `cultivation_textures/` and
anything over 40 MB.

⚠️ And the counterpart from §3: finding a format string in *a* binary does not tell you *which*
binary prints it. The converter and the simulator both contain some, and they are not the same
program.

---

## Credits

Most of what follows was learned the slow way — writing files, flying to look at them, and
reading `tm.log`. But several findings here were **shared publicly by other members of the
Aerofly FS 4 community**, and it would be wrong not to say so. By their forum handles:

- **ApfelFlieger** — the three GCS→WAD conversions in §12, published on the community forum
  together with a complete, working, hand‑built heliport. The independent check of the
  latitude projection (tangent vs. Mercator, inverted out of 47 binary IPACS `.wad` files)
  was done here, but **the formulas are his**. He also supplied the `.tsl` details in §4 —
  which fields a POI entry‑point file actually needs, and which ones do nothing. Since then: that a
  POI folder may hold several `.tsl` (§4), that glider aerotows and winches live only in the `.wad`
  (§16), the ±1 m ceiling of the terrain mesh (§7), and the exclude‑object pattern of §10.
- **Rodeo** — the public release of the official XREF library described in §15, which is
  where the display names, the taxonomy and the true footprint polygons come from.
- **Frank Boës (fboes)** — the MIT‑licensed AFS4 airport dataset in §15. His mission converter is
  also where the empty `origin_icao` of §17 was first seen in the wild.
- **chrispriv** — the field report that prompted the lights‑and‑autoheight investigation
  whose results are in §9, and the family of exclude meshes described in §10.

Errors, over‑readings and anything that turns out to be wrong are the author's own, not
theirs.

This document is an independent community effort. It is **not affiliated with, endorsed by,
or sponsored by IPACS GbR**, and it documents behavior that IPACS does not document.

---

*End. This document is a distillation; verify against your own install, because the sim is
undocumented in these areas and changes between versions.*
