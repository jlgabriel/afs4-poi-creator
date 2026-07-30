# Aerofly FS4 — Technical Reference

> A field guide to the **Aerofly FS4 (AFS4)** file format and scenery‑placement
> behavior, distilled from hands‑on add‑on development. It documents the *simulator
> and its on‑disk format*, not any particular tool.
>
> - **Scope:** the simulator and its file format.
> - **State as of:** 2026‑07. Findings are dated where it matters; verify against your
>   own install before relying on anything. The sim changes between versions, and many
>   of the behaviors documented here are **undocumented by IPACS** — they can break
>   without notice.

---

## Index

1. [Where everything lives (installation layout)](#1-where-everything-lives)
2. [The file grammar `<[type][name][value]>`](#2-the-file-grammar)
3. [`tm.log` — the sim's diagnostic log](#3-tmlog)
4. [Placement: POI (`.tsl`/`.toc`) vs airport (`.tap`/`.tsc`)](#4-placement-poi-vs-airport)
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

There are two ways to place custom objects in the world. **The POI is the current, standard
community approach.**

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
**A POI can carry several `.tsl`/`.toc` pairs** (e.g. `pole.*` + `plants.*`) if you ever need
`autoheight` true and false at the same time.

### Airport (`.tap` + `.tsc` + `.wad`) — LEGACY, avoided

A folder under `scenery/airports/<region>/<country>/<name>/` with `<ICAO>.tap` (registration)
+ `<name>.tsc` (`tmsimulator_scenery_place`, a superset of the `.tsl`) + models. Gotchas (all
found via `tm.log`): the `.tsc` needs ≥1 runway/helipad or it logs `invalid airport` and is
discarded; `has no wad file` is non‑fatal.

⚠️★ **A user `.tsc`/`.wad` silently OVERRIDES a base airport by ICAO.** `tm.log` sings it:
`skipping duplicate place … icao='LSGB' using '<userdir>/…'`. This is by design (it's how
add‑ons replace airports) **but ⇒ a duplicate ICAO erases a real airport and the only trace
is one log line.** A POI cannot do this; only the airport route can.

---

## 5. Built‑in XREF objects

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
- **plants** `scenery/plants/` (`group__iNN__hHHHH_color.ttx`)
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

### `list_airport_light` (built‑in fixtures)

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

---

## 11. Built‑in POIs and landmarks

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

A heliport is currently hand‑built by adding 3 things on top of a POI:

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
- Since **v0.9.1**, PCT applies all three for you: the Inspector's collapsed **"FS4 internal
  (.wad)"** block shows the selected object's projected position and its rotation in radians,
  ready to copy. It is a **read-out only** — PCT still writes no `.wad`/`.tsc`.

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

---

## Credits

Most of what follows was learned the slow way — writing files, flying to look at them, and
reading `tm.log`. But several findings here were **shared publicly by other members of the
Aerofly FS 4 community**, and it would be wrong not to say so. By their forum handles:

- **ApfelFlieger** — the three GCS→WAD conversions in §12, published on the community forum
  together with a complete, working, hand‑built heliport. The independent check of the
  latitude projection (tangent vs. Mercator, inverted out of 47 binary IPACS `.wad` files)
  was done here, but **the formulas are his**. He also supplied the `.tsl` details in §4 —
  which fields a POI entry‑point file actually needs, and which ones do nothing.
- **Rodeo** — the public release of the official XREF library described in §15, which is
  where the display names, the taxonomy and the true footprint polygons come from.
- **Frank Boës (fboes)** — the MIT‑licensed AFS4 airport dataset in §15.
- **chrispriv** — the field report that prompted the lights‑and‑autoheight investigation
  whose results are in §9.

Errors, over‑readings and anything that turns out to be wrong are the author's own, not
theirs.

This document is an independent community effort. It is **not affiliated with, endorsed by,
or sponsored by IPACS GbR**, and it documents behavior that IPACS does not document.

---

*End. This document is a distillation; verify against your own install, because the sim is
undocumented in these areas and changes between versions.*
