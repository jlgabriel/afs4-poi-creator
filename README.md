# PCT — POI Creation Tool

[![CI](https://github.com/jlgabriel/afs4-poi-creator/actions/workflows/ci.yml/badge.svg)](https://github.com/jlgabriel/afs4-poi-creator/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/jlgabriel/afs4-poi-creator?label=download)](https://github.com/jlgabriel/afs4-poi-creator/releases/latest)

**Decorate your Aerofly FS 4 world with the sim's own built-in objects** — hangars, towers,
terminals, vehicles, parked aircraft, street lamps and more — **and light it up at night**. Place
them on a real satellite map, and PCT hands you a scenery folder you drop straight into the sim.

**Or build yourself somewhere to fly *from*:** a runway, a helipad, a parking stand, a glider start —
a small airfield of your own that Aerofly lists among the places you can begin a flight.

No modelling, no file editing.

**New here? → [Read the guide](guide/GUIDE.md).** Fourteen sections and forty-six pictures, from a
[five-minute quickstart](guide/GUIDE.md#3-quickstart--one-object-five-minutes) to the one part that
isn't obvious — getting what you place onto the ground. A twelve-object
[starter project](guide/example/kdag_starter.json) comes with it, ready to install and then take
apart.

A community tool, born on the [Aerofly forum](https://www.aerofly.com/community/) and built with
the help of the people credited [below](#how-pct-came-to-be). It's the POI-placing cousin of
[afs4-pylon-race](https://github.com/jlgabriel/afs4-pylon-race), and shares its geometry and
POI-folder conventions.

![The PCT editor — built-in objects placed on the satellite map at Barstow-Daggett, one of them selected in the inspector](resources/screenshot.png)

> **Status — released and actively developed.** The object scanner, the export core, and the full
> desktop editor (first-run wizard, satellite/streets map, object catalog, inspector, airport
> search, per-object height, export / install / uninstall) are built and tested — unit + golden
> tests, typecheck, and Electron end-to-end tests, all green in [CI](.github/workflows/ci.yml).
> Lights, plants, your own custom XREF objects, an optional "Sim autoheight" export mode, real
> object photos, hand-measured footprints, one-click straightening of a whole row, and installing a
> project as an **airport you can start a flight from** — runway, helipad, parking stands, aerotow and
> winch launch — are all in. Each feature below is tagged with the version it arrived in, and the
> release notes carry the full history.
>
> **v2.0 is the documentation.** The [guide](guide/GUIDE.md) and this README were rewritten around the
> airport — a chapter per element, forty-six pictures, all of them taken from the running app.
> The export format is **confirmed working in the sim**. Builds
> are currently **unsigned**, so your OS will warn you once on first launch — see
> [Installing PCT](#installing-pct). Grab the newest build from
> [Releases](https://github.com/jlgabriel/afs4-poi-creator/releases/latest).

## What it is

PCT lets you place **Aerofly FS 4's own built-in objects** onto a real satellite map and turn that
into a standard **POI scenery folder** that Aerofly loads like any other add-on. You never touch a
model or a config file — you click on a map, and PCT writes the folder.

**Lights, too.** Since **v0.2** you can place the sim's own **airport-light fixtures** (runway edge, PAPI,
approach, taxiway, helipad…) and fully parametric **point lights**, where you pick the colour, the
brightness and the flash pattern. Stagger the flash across a row of them and you get a running-light
sweep. Lights only show at night in the sim — that's Aerofly's behaviour, not a bug.

**Plants, too.** Since **v0.4** you can plant the sim's own **trees and shrubs** — broadleaf, conifer,
conifer forest, palm, shrub and alley, 41 of them, each with its own natural height from 0.8 m of scrub
to a 28 m forest conifer. Pick one from the **Plants** section, click the map, and set how tall it
grows. They're billboards, so there's no rotation to worry about — a tree always faces you.

**Your own objects, too.** Since **v0.3**, PCT can also place the custom **XREF objects you've added
to your sim** — the model files you (or a scenery add-on) dropped into Aerofly's `scenery/xref`
folder. PCT reads each model's name and footprint, registers it so the sim can resolve it, then
treats it like any built-in: place it, rotate it, set its height, export. See
[Placing your own XREF objects](#placing-your-own-xref-objects).

**Real photos on the cards, too.** Since **v0.6** you can swap PCT's drawn category icons for real
photos of the objects, and since **v0.7** putting one there takes two clicks: screenshot the object in
the sim, then right-click its card and choose **Paste photo**. **v0.8** extends that to the **lights**
and the **plants**, so every card in the catalog can show the real thing. The photos are **yours**, read
straight from your disk — never bundled into PCT and never written into your POIs. See
[Photos of your objects](#photos-of-your-objects).

**Sizes you measure, too.** Since **v0.9**, anything the sim doesn't describe can be given a size by
hand. Your install tells PCT how big each **object** is, but it says nothing about the **lights** or the
**plants** — so those drew on the map as bare points, and a big approach-light bar looked exactly like a
single lamp. Right-click a card, choose **Set footprint**, type width × depth × height, and it draws at
that size from then on. The measurements are **yours**: they live in your own file, survive a rescan, and
can be exported and handed to somebody else. See
[Footprints you measure yourself](#footprints-you-measure-yourself).

**Rows that come out straight, too.** Rows are what people build most — parked aircraft along an
apron, lamps down a taxiway, trees along a track — and placed by hand they come out nearly-but-not-quite
straight. Since **v0.9.2**, shift-click three or more and the inspector turns into an arrange panel:
**Line up** slides every object onto the line through the two farthest apart, **Space evenly** gives
every gap the same length, and **Match row** turns them all to face along it, which parks a line of
aircraft nose-to-tail in one click. There's no "align left" here on purpose — left is *west*, and a
real apron is hardly ever north-south. All three work along the row itself, at whatever angle it runs.

**Somewhere to fly *from*, too.** A POI is scenery you fly **to** — Aerofly's start-location list never
hears about it. Since **v1.1** the same project can also be installed as an **airport**: a small airfield
of your own that turns up in the sim's LOCATION menu, with everything you placed around it. Since **v1.3**
its parts are placed from the catalog like any other object and edited in the inspector like any other
object, and since **v1.4** there are five of them — a **runway**, a **helipad**, a **parking** stand, an
**aerotow** and a **winch launch** — plus the airfield's own name and code. See
[Airports you can fly from](#airports-you-can-fly-from).

**It ships no Aerofly content.** PCT reads the object catalog from *your* installed copy of the sim,
so you only ever place objects you already own. Nothing from the sim is copied into this project or
into your finished POIs — just the *names* of the objects you chose.

## How to use it

The short version is below. For the whole thing walked through with pictures, see
**[the guide](guide/GUIDE.md)**.

1. **Install PCT** — download the build for your system from the
   [Releases](https://github.com/jlgabriel/afs4-poi-creator/releases) page (Windows installer or
   portable · macOS `.dmg` · Linux AppImage). First launch needs one extra click — see
   [Installing PCT](#installing-pct).
2. **Point PCT at your sim** — on first run, a short wizard auto-detects where Aerofly FS 4 is
   installed and where your user folder lives, then scans your object catalog.
3. **Place objects, lights and plants** — search the catalog, click on the map to drop an object, then
   drag, rotate, scale and fine-tune its height. **Shift-click** to work on several at once: move,
   duplicate or straighten them as one row
   ([the guide walks it through](guide/GUIDE.md#5-placing-moving-rotating)). Every object's footprint is
   drawn at its true size, so you can line things up precisely — and since **v0.9** you can give a
   **light or a plant** a size too, by measuring it yourself: see
   [Footprints you measure yourself](#footprints-you-measure-yourself).
   Below the catalog, the **Lights** section holds the airport-light fixtures and the custom point light,
   **Plants** holds the trees and shrubs, and **Airport** holds the six pieces an airfield is made of.
4. **Export & install** — **Export /poi…** writes the folder into your `scenery/poi/`. Restart Aerofly
   and fly to the spot. The same dialog can **uninstall** POIs that PCT made, so nothing is permanent.
   If you'd rather **start** a flight there than fly to it, **Export /airports…** writes the same
   project as a small airfield — see [Airports you can fly from](#airports-you-can-fly-from).
   The two buttons are named for the folder under the sim's own `scenery` that each one writes into.
5. **Optional: photograph what you placed** — once you're out there looking at your objects,
   screenshot one to the clipboard and right-click its card in PCT to paste it in. From then on the
   catalog shows the real thing instead of a drawn icon. See
   [Photos of your objects](#photos-of-your-objects).

**The POIs you create are yours.** They're the program's output and are **not** covered by PCT's
license — share them, post them, or sell them however you like.

### Placing your own XREF objects

Beyond the sim's built-in catalog, PCT can place the **custom objects you've added to Aerofly
yourself** — model files (`.tmb`) that you, or a scenery add-on, put in your Aerofly FS 4
`scenery/xref/` folder.

A loose `.tmb` won't render in the sim on its own: Aerofly needs a small scene-index (`.tmi`)
generated for it, in its **own subfolder**. PCT does that for you:

1. **Drop your model** into `…/Aerofly FS 4/scenery/xref/` — the `.tmb`, plus its `.ttx` textures if
   it has any.
2. **Rescan** in PCT (re-run the wizard, or use *Rescan* in the catalog). Your objects show up with an
   **"unregistered"** badge, and a banner offers to register them.
3. **Click Register.** PCT reads each model's name and size, generates its `.tmi`, and moves it into
   its own subfolder next to its textures. Your objects become normal, **placeable** catalog entries.
4. **Place, rotate, set the height and export** — exactly like a built-in object.

**What's supported:** text-format `.tmb` — the kind Aerofly's SDK and the AC3D exporter produce — are
read fully (name, footprint, textures). IPACS's **pre-compiled binary** `.tmb` can't be read
automatically and appear greyed out. As everywhere else, PCT ships and copies **no model bytes**: it
only re-lays *your* files and writes the small `.tmi` index next to them.

### Photos of your objects

A catalog card normally shows a drawn icon sized to the object's real footprint. If you'd rather see
the object itself, PCT can show **your own photos** instead — on the catalog cards and in the placed
list. It never ships or downloads any: the pictures are ones you took, on your own disk.

Since **v0.8** this covers **every** card: the objects, the **lights** and the **plants**. Those two
sections are where a drawn icon says least — a runway edge light and a taxiway edge light get the same
glyph, and Broadleaf 00 and 01 are the same tree a metre apart in height.

First, pick where they live: *Settings → Object photos folder*. Then, for each object:

1. **Photograph it in the sim.** Get a good view of something you've placed, frame it, and take a
   screenshot **to the clipboard** — `Win+Shift+S` on Windows, `Cmd+Ctrl+Shift+4` on macOS.
2. **Right-click that object's card in PCT** and choose **Paste photo from clipboard**. PCT saves the
   image into your folder named after that exact object, and the card updates immediately — no
   filename to type and no ids to match by hand. The same menu also has **Remove photo** and **Open
   photos folder**.

You can also fill the folder yourself: name a file after the card's id, in jpg, jpeg, png or webp, and
it will be picked up. Objects use their bare id; lights and plants are prefixed, because they share the
one folder with the ~900 objects:

| Card | File name |
| --- | --- |
| an object (built-in or your own XREF) | `a380_klm.jpg`, `cabin-boat-red.png` |
| an airport light | `light.runway_edge_light.jpg` |
| the custom point light | `light.point.jpg` |
| a plant | `plant.palm.08.jpg`, `plant.conifer_forest.01.jpg` |

Anything without a photo simply keeps its drawn icon.

You never have to work this out by hand — **rest the mouse on a card** for a moment and a preview pops
up with the photo enlarged and the file name spelled out, and **Paste photo** writes it for you. Photos
you took with v0.6 or v0.7 keep working untouched: an object's file name has not changed.

### Footprints you measure yourself

*(v0.9)* On the map, an object is drawn as a **rectangle at its true size** — that's how you line things
up against the imagery. A **light** or a **plant** isn't, because nothing in your install says how big
one is: objects are indexed with their dimensions, lights and plants are not indexed at all. So they draw
as a **point**, and nine different approach-light bars all look identical.

If you know the size, you can just say so. **Right-click the card → Set footprint**, type the three
numbers in metres, Save. From then on that light or plant draws as a real rectangle you can align, and
the card shows its size.

- **Width (X) runs along the facing arrow** the map draws, depth (Y) across it. If the box comes out
  turned 90°, swap the two numbers — for a light, PCT has no way to know which way its model was built,
  so it assumes the common one and lets you correct it.
- **Height is stored but doesn't change the map.** A footprint is a ground outline.
- It works on **objects** as well, if your install's own figure is wrong or missing.
- **Nothing here is exported.** The Aerofly POI format has no footprint field — this only changes what
  PCT draws while you're placing things.

The measurements are yours, kept in your own `footprints.json` next to your settings. **Rescanning your
install never clears them.** *Settings → Object footprints* has **Export** and **Import**, so one person
can measure a family of fixtures once and post the file for everyone else — importing merges it into
yours and tells you how many entries it added and how many of yours it replaced.

### Airports you can fly from

*(v1.1, reshaped in v1.3, grown into a whole airfield in v1.4)* A POI is scenery you fly **to**.
**Export /airports…** turns the same project into a small **airport** you can start a flight **from** —
Aerofly puts it in the LOCATION menu and on the map, and your objects come along around it. It doesn't
replace the POI export; it's a second, separate copy, written into your user folder's
`scenery/airports/`. Suggested, specified and steered throughout by **@ApfelFlieger**, who builds these
by hand.
[Section 9 of the guide](guide/GUIDE.md#9-airports--somewhere-to-fly-from) walks the whole thing through
with pictures.

**PCT writes the airfield's data, not its asphalt** — no markings, no centre line, no surface. Aerofly
draws the ground; this tells it where the runway is and how to use it.

The catalog's **Airport** section holds six cards, and every one of them behaves like a tree or a light:
click the card, click the map, edit it in the inspector.

| Card | What it is |
|---|---|
| **Airport** | The airfield itself: its **name**, its **ICAO code**, an optional **IATA** code, its two-letter **country code**, and the one point the whole thing is filed under. |
| **Runway** | Two thresholds you drag; the length and the direction are whatever they say. Per end: identifier, approach lighting, PAPI, REIL, and whether you can land or take off there. |
| **Helipad** | A helicopter start. Its own point, at its own radius, as many as you like. |
| **Parking** | A stand — General Aviation, Jet or Pushback — that an aircraft starts a flight from. |
| **Aerotow** | A glider start, towed into the air along its heading by the DR400. |
| **Winch Launch** | A glider start on a cable: two points, no heading, ~900 m of rope. |

The order is the same in the catalog on the left and in the placed list on the right, and airport parts
stay out of the object count — they aren't scenery.

- **Aerofly's own floor: one helipad or one runway.** An airport with neither is rejected outright by
  the simulator — *"no valid runway or helipad defined"* — so PCT refuses to write one. Stands and
  glider starts don't count towards it. Everything else, objects included, is optional.
- **The code has teeth.** If an airport already installed on your machine uses it, Aerofly quietly
  **replaces that airport** and mentions it only in a log nobody reads. PCT counts the airports actually
  on your disk and refuses a code that's taken — the one thing the by-hand route can't do for you. What it
  **can't** promise is anyone else's machine: pass the folder on and the code has to be free there too.
- **A real-world code searches better than an invented one.** Aerofly takes the text it shows in
  LOCATION's *search* from its own world database, so a code that database knows appears under **its**
  name, while an invented one comes up as a **blank row**. It still works, and the map panel shows your
  name correctly — it just looks broken in the search list. Looking one up on ourairports.com or
  metar-taf.com costs a minute. **Search by name, never by code**: the search matches names only.
- **The name is capped at 29 characters.** Past Aerofly's own limit the sim drops the whole airport, so
  PCT counts them for you.
- **Headings are TRUE degrees**; Aerofly's menu displays them magnetic, so expect a few degrees of
  difference. A helipad's and a stand's **Size** is a **radius**, so the circle on the map is twice that
  across.
- **The airport's own point is sown once and then frozen** *(v1.5)*. The first element you place gives
  it a coordinate; after that, moving a helipad or dragging a runway end never moves the airport. Drag
  the ⊕ or type the numbers to put it where you want it.
- **Adjusting and trying again is the normal case** *(v1.2)*. Everything is saved **in your project**,
  waiting in the inspector where you left it, and installing the same airport again **replaces** the one
  already on disk instead of demanding a fresh code — the button reads *Replace in /airports* once PCT
  recognises the code as one of yours. Rooftop pads in particular take a few laps to get the height right.
- **Nothing is permanent.** The dialog lists the airports PCT installed, each with **Uninstall**, and it
  only ever lists — or deletes — folders PCT wrote itself.

Restart Aerofly after installing: airports are read once, at startup.

### Good to know

A couple of things worth knowing about the editor:

- **"Heading °"** on an XREF object is a real **compass heading** — `0` = north, `90` = east,
  clockwise — not a raw rotation. PCT applies the object-facing convention it **calibrated in the
  sim**, so the value matches what you'd fly, and the map's **cyan handle** points the way the object
  faces. It's a best-effort convention that holds for the large majority of objects; if one comes out
  turned the wrong way, line its **footprint rectangle** up with the imagery — that reads true no
  matter which way the model was authored. (An **airport light** still shows a raw **"Orientation °"**,
  since lights weren't part of the heading calibration. Either can be dragged with the **cyan handle**
  on the map — hold **Shift** to snap to 5°.)
- **Height modes** — how an object's height reaches the sim, chosen **per project** from the top bar (and
  echoed in the Export dialog):
  - **Baked ASL** (default) — PCT writes each object an **absolute** elevation (metres ASL). *Terrain*
    looks up the ground height and bakes it in; *Terrain + offset* adds metres on top (rooftop items);
    *ASL* is a value you type. So "Terrain" does **not** mean `0` — it means the resolved ground elevation.
  - **Sim autoheight (beta)** — lets **Aerofly itself** set the ground under each object at load time, so
    *Terrain* means "on the ground" and *Terrain + offset* floats N metres above it. The export is then
    **fully offline** (no elevation lookup) and objects follow the terrain even if the sim re-levels it —
    so heights come out more reliable than a baked value, at the cost of leaning on undocumented sim
    behaviour (hence *opt-in*, and it may change with a sim update). Two things it can't do: *ASL*
    heights have no meaning in this mode, and it **can't place lights** — the sim buries those below the
    terrain — so a project with lights in it needs Baked ASL. PCT checks both before it writes anything,
    so you find out in the Export dialog rather than in the air.
    Suggested and worked out on the forum by **@chrispriv**, with **@ApfelFlieger**.
- **FS4 internal (.wad)** *(v0.9.1)* — a read-out, collapsed at the foot of the inspector, giving the
  selected object's position in the projected units Aerofly keeps inside its own **world-airport
  database**, and its rotation in radians. It changes nothing: it's the same projection PCT works out
  for itself when it installs an airport, surfaced here because a handful of people hand-build those
  entries and were converting the coordinates in a spreadsheet. Every coordinate and heading in the
  **Airport** panels carries the same read-out as a small `WAD:` chip — double-click one to copy it. The projection is documented in the
  [technical reference](reference/AFS4_KNOWLEDGE_BASE_EN.md).
- **If something goes wrong**, PCT keeps a plain-text log of the session — the folders it used, what
  the scan found, and anything that failed. **Settings → Diagnostics → Open log file**. It's
  **rewritten from scratch every time PCT starts**, so it never grows and there's nothing to clean up,
  and nothing in it is sent anywhere. Pasting it into a bug report saves a round of questions.

### Installing PCT

Builds are **unsigned** for now, so the operating system warns you the first time you open one:

- **Windows** — SmartScreen shows "Windows protected your PC" → **More info → Run anyway**.
- **macOS ("cannot be opened")** — right-click the app → **Open → Open**, or System Settings →
  Privacy & Security → **Open Anyway**. (This is the warning you'll usually get on the Intel build.)

On **Apple Silicon** you may instead see **"PCT.app is damaged and can't be opened."** It isn't
damaged — it's the same unsigned-app quarantine — but on Apple chips it can't be cleared from the
menus. Drag **PCT.app** into your **Applications** folder, then run this once in **Terminal** and open
it normally:

```
xattr -cr /Applications/PCT.app
```

Prefer the **`arm64`** download on Apple Silicon; the Intel build also works but runs under Rosetta,
which Apple is retiring.

This is normal for a small open-source project without a paid signing certificate; the source is all
here for anyone who wants to check it or [build it themselves](#build-it-yourself).

## How PCT came to be

PCT started as a **community idea**. On the Aerofly FS 4 forum, **Michael (@ApfelFlieger)** had long
wanted a simple way to dress up the world with the sim's *own* built-in objects, without editing a single file by hand. He didn't just ask for it: he
handed over the complete file-format specification for POI scenery (the `.tsl` / `.toc` files) and
argued for a pragmatic starting scope (the static "XREF" objects that cover the large majority of
what people want to place). He did it a second time for the **airport** side — the `.tsc` / `.wad`
grammar, the field mask for every one of the six submenus, the order they appear in, and the rule that
the left column and the right column must always agree — and has tested every release since, twice
each: once without reading anything, then guided. He also coined the family name: PCT is the
POI-only cousin of the "Racing Creation Tool" (the sibling
[afs4-pylon-race](https://github.com/jlgabriel/afs4-pylon-race)).

As it took shape, more of the community pitched in:

- **Frank Boës (@Armitage on the forum, `fboes` on GitHub)** let PCT bundle a snapshot of his open **aerofly-data** airport list, which
  powers the in-app airport search that recenters the map on any core Aerofly airport.
- **Christophe (@chrispriv)** and **Rodeo** untangled the trickiest question — how Aerofly
  decides an object's height. Christophe pinned down the exact behaviour for library objects (they need an
  explicit height written in, there's no auto-height to lean on), which set PCT on the correct path;
  and Rodeo's hands-on method for reading real terrain elevation inside the sim is how those heights
  were validated on the ground. Christophe went on to design the **Sim-autoheight** mode added in v0.5 —
  the project-level approach and the exact `.tsl` / `.toc` behaviour behind it — with **@ApfelFlieger**.

The code itself was built by Anthropic's **Claude** models working in tandem: **Fable 5** designed the
architecture and reviewed every milestone, and **Claude Opus** wrote the implementation — all under
the direction of **Juan Luis Gabriel (@Jugac64)**, who created and steers the project.

## Thanks

- **Michael — @ApfelFlieger** — the driving idea, the file-format specification, and the scope that
  made a first release realistic.
- **Frank Boës — @Armitage (forum), `fboes` (GitHub)** — the [aerofly-data](https://github.com/fboes/aerofly-data) airport
  dataset (MIT), reused with permission.
- **Christophe — @chrispriv** — the object-height mechanics for library objects, and the design of the
  **Sim-autoheight** mode (v0.5) ([GitHub](https://chrispriv.github.io/aeroscenery-afs_addons/)).
- **Rodeo (forum)** — the in-sim ground-truth method for validating terrain elevation.
- **Fable 5** & **Claude Opus** (Anthropic) — architecture/reviews and implementation.

…and the wider Aerofly FS 4 forum community, who tested ideas and kept the thread alive.

## Aerofly FS 4 and IPACS

PCT only exists because of how **Aerofly FS 4** is built. IPACS made the simulator load add-on scenery
from **plain, human-readable text files**, and let that scenery place the sim's **own built-in objects
by name**. That's the whole foundation of this tool: PCT can read the object catalog straight from
*your* install and write a standard POI folder that simply *references* those objects — without ever
copying, extracting, or shipping a single piece of IPACS content. Our thanks to **IPACS** for a
simulator open enough to let its community build on it like this.

PCT is an **independent, unofficial community project** — not affiliated with or endorsed by IPACS.
Aerofly FS 4 and all its content belong to IPACS; PCT bundles none of it, and the POIs you create only
reference objects you already own.

## The guide

This README says what PCT is and how to install it. The guide takes you through using it, illustrated
from a real session at Barstow-Daggett:

**→ [guide/GUIDE.md](guide/GUIDE.md)**

Fourteen sections and forty-six pictures: a five-minute quickstart that puts one unmissable object
beside a runway, the editor panel by panel, placing and rotating, straightening and spacing a whole
row at once, **heights** — the part that repays reading, worked through as the three passes it
actually takes rather than the one you would hope for — lights and plants, exporting and installing,
**airports** end to end from the six catalog cards to the LOCATION menu, a cookbook of eight scenes
worth building, photos and footprints of your own, your own models, and what to look at when something
doesn't show up in the sim.

A twelve-object starter project comes with it, ready to install and then take apart:
[guide/example/kdag_starter.json](guide/example/kdag_starter.json).

## The Aerofly FS 4 technical reference

Building PCT meant working out how Aerofly FS 4 actually stores and places scenery — much of which
IPACS never documented. That knowledge is written up as a standalone field guide to **the simulator
and its on-disk format**, not to this tool:

**→ [reference/AFS4_KNOWLEDGE_BASE_EN.md](reference/AFS4_KNOWLEDGE_BASE_EN.md)**

Eighteen sections: where everything lives in an install, the `<[type][name][value]>` file grammar,
what `tm.log` tells you before you ever take off, POI vs airport placement, the built-in XREF
catalog, orientation and heading maths, heights and autoheight, plants, lights, your own `.tmb`
objects, built-in POIs and landmarks, heliports and the `.wad` projection, the UDP flight-data
stream, the Blender-to-`.tmb` pipeline, the public datasets worth knowing about, what makes an
airport actually load, user missions, and reading the simulator's own binary for the vocabulary it
accepts.

It's there for anyone building things for AFS4, whether or not they ever touch PCT. Verify anything
critical against your own install: the sim is undocumented in these areas and changes between
versions.

## For developers

PCT is an **Electron + TypeScript** app (Windows / macOS / Linux) built around a deliberately
**pure core**: `src/core/` takes strings and objects in and returns strings and objects out — no
Node, no DOM, no Electron — so all the catalog and geometry logic is 100% unit-testable. The scanner
and CLI do the file I/O and *feed* the core.

**The one hard rule:** PCT ships **zero IPACS assets**. It reads the object catalog from *your*
installed copy of the sim at runtime; nothing IPACS-derived (scanned object dimensions, `.tmi` /
`.tmb` bytes) is ever committed to this repo. Only object *names* — public facts — ship, in a curated
category table. Test fixtures use invented names.

The one binary PCT does ship is **its own**: `assets/pct_anchor.tmb` + `.ttx`, a tiny anchor mesh a POI
needs when it holds plants (without it the sim culls them at altitude — v0.4). Its mesh and texture are
ours, made for PCT and compiled with IPACS's official content converter; it carries zero IPACS bytes.
See the [License](#license) note.

### Build it yourself

Requires **Node.js ≥ 20** (developed on 24 LTS). An Aerofly FS 4 install is only needed to *scan* a
real catalog; the unit tests are self-contained.

```bash
npm install
npm run dev              # run the desktop app (electron-vite, hot reload)
npm test                 # unit + golden tests over src/core/ (self-contained)
npm run typecheck
npm run build:win        # or build:mac (on macOS) / build:linux  → dist/
```

There's also a headless CLI: `npm run scan` reads your install's object catalog and writes a
`catalog.json`, and `npm run export` builds a POI folder from a project file — handy for scripting.
On a stock install the scan finds **911 objects** across 7 XREF bundles.

## License

**GPL-3.0-or-later** © 2026 Juan Luis Gabriel

PCT is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at
your option) any later version. PCT is distributed in the hope that it will be useful, but **WITHOUT
ANY WARRANTY**; without even the implied warranty of merchantability or fitness for a particular
purpose. See the [`LICENSE`](LICENSE) file for the full text.

**The POI packages you create with PCT are your own.** They are the program's output and are **not**
covered by the GPL — do with them whatever you like.

PCT bundles third-party components (Leaflet, React, Zustand, Zod, Electron, and others) under their
own permissive licenses, and reuses Frank Boës's MIT airport data; their notices are preserved in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

**Bundled anchor mesh.** PCT ships one binary asset, `assets/pct_anchor.tmb` + `.ttx`, used to anchor a
POI's plants so Aerofly doesn't cull them at altitude (v0.4). Its geometry and texture are **our own
work** — © 2026 Juan Luis Gabriel, **GPL-3.0-or-later**, same as PCT — compiled into Aerofly's binary
format with IPACS's official **Aerofly FS 4 Content Converter**. That converter is IPACS's software and
is **not** redistributed here; only its output, built entirely from our own source mesh and texture,
ships in this repo (confirmed OK with IPACS via ApfelFlieger). See
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
