# Guide images

The images `GUIDE.md` expects, by exact filename. Anything not on this list isn't referenced.

- `01_1_map_in_pct.jpg` — a scene arranged on the satellite map in PCT.
- `01_2_same_place_in_sim.jpg` — that same place, flown in Aerofly FS 4. The pair carries the whole
  idea; they run one after the other, not composed into a single file.
- `02_1_wizard_welcome.jpg` — the first-run wizard's opening screen.
- `02_2_wizard_install_folder.jpg` — the wizard asking you to confirm the Aerofly FS 4 install.
- `02_3_wizard_catalog_ready.jpg` — the scan result, bundle by bundle.
- `03_quickstart_map.jpg` — `tower00_large` placed beside the KDAG runway, selected.
- `04_quickstart_sim.jpg` — the same tower seen from the runway in the sim.
- `05_editor_overview.jpg` — the whole editor: top bar, catalog, map, inspector. Also the README's
  hero image (`resources/screenshot.png`, the same frame as a PNG).
- `06_rotate_handle.jpg` — mid-rotation: footprint rectangle swung off the cardinals, cyan handle, the
  live angle badge beside it, and the heading in the Inspector.
- `07_export_dialog.jpg` — the `/poi` export dialog, filled in, down to the installed list.
- `08_paste_photo.jpg` — the right-click menu open on a catalog card, with the object's exact photo
  name printed at the top of it.
- `09_1_defaults_sunk.jpg` — the example outpost exported with the defaults: the elevation service's
  figure puts the whole site underground.
- `09_2_site_figure_fixed.jpg` — the same outpost, same viewpoint, once **Base elevation** carries the
  sim's own figure.
- `09_3_offsets_tuned.jpg` — the same outpost with every object on the ground, after per-object
  *Terrain + offset* nudges.

The three are the worked example in section 6, and they must share a viewpoint — the reader compares
them. There is no 09.4: a close-up of the residual float was planned and dropped, because the
detached shadows in 09.2 already show it. The numbers run past 08 because the example was added after
the others, not because it appears last.

From here on the frames are crops of the app itself, not windows — the pass shot on 2026-07-30 to
**show the UI the text names instead of only describing it**. Sections 6 and 7 were the reason:
section 6 explained the height control over in-sim photos, and section 7 had no image at all.

The editor, off one staged screen (`guide/example/kdag_starter.json`, the hangar selected):

- `14_topbar.jpg` — the top bar, cropped to the strip: project, New/Open/Save, Undo/Redo,
  Export /poi…, Export /airports…, Rescan, Settings, Help, airport search, the Heights switch, the map
  style switch, the count.
- `15_catalog_objects.jpg` — the Catalog panel, all three sections open: search box, category tree,
  and cards carrying name, footprint and category.
- `16_inspector_object.jpg` — the Inspector on one selected object, with `FS4 internal (.wad)` shut.
- `17_placed_list.jpg` — the placed list, one row selected, Duplicate / Delete above it.
- `18_catalog_collapsed.jpg` — the Catalog as it opens: four sections shut, four counts.
- `19_height_control.jpg` — the Inspector after one press of −0.5: *Terrain* has become
  *Terrain + offset* at −0.50 m. Section 6's control, shown instead of only explained.
- `25_wad_readout.jpg` — `FS4 internal (.wad)` expanded, in section 14 where it's explained.

16 and 19 are the same panel a click apart, and that's the point of the pair: 19 is what section 6's
nudge does to it.

Arrange, section 5 — the one pair here that has to be read side by side:

- `10_1_arrange_before.jpg` — five aircraft parked by hand along the KDAG apron, crooked and unevenly
  spaced.
- `10_2_arrange_after.jpg` — the same five after Line up and Space evenly, with the arrange panel
  showing `Row: 368.8 m at 50.8°`. The map moves a little between the two; the before/after still
  reads, but a re-shoot should hold the frame still and have all five selected in both.

Lights and plants, section 7:

- `20_lights_catalog.jpg` — the Lights section open, PCT's point light first and the sim's fixtures
  under it.
- `21_light_inspector.jpg` — a runway end light: fixture, Orientation °, red one way and green the
  other, visibility group.
- `22_point_light.jpg` — the point light: colour swatches, intensity, the Flashing tick-box. Shot
  unticked, so the caption points at the box rather than at Cycle / Sequence / Length.
- `23_plant_height.jpg` — a conifer, framed so **Plant height (m)** and the shared **Height** control
  are both visible. That pair *is* the classic mistake the text warns about.

Dialogs:

- `11_photo_on_cards.jpg` — a card carrying a real in-sim photo of a B777 among cards still showing
  the drawn icon, hover preview enlarging it, the exact id spelled out. Section 11's payoff, and the
  hole that section carried from the day it was written. Re-shot: the first take used a test
  placeholder, which undersold the feature it exists to sell.
- `12_set_footprint.jpg` — the footprint dialog on a light fixture, figures typed in.
- `13_settings.jpg` — Settings entire: both folders, the photos folder, map tiles, elevation
  provider, Rescan, the footprints Import / Export, Diagnostics. Sections 2, 11 and 13 all send the
  reader here.
- `24_installed_pois.jpg` — the foot of the `/poi` export dialog: installed POIs, each with its
  Uninstall. (`07_export_dialog.jpg` is the same dialog entire.)

Airports, section 9 — the 2026-08-18 pass, and the largest re-shoot this folder has had. `docs/shoot_airport.mjs`
drives the real built app through Playwright/Electron: a throwaway userData seeded from the real one
(so the catalog, the install paths and the airport-code check are genuine), `guide/example/kdag_starter.json`
opened through the real Open path, then a whole small airfield built the way a user builds one — arm the
card, click the map — and its coordinates typed into the Inspector so the framing is deliberate. It
installs `PCT001 Daggett Outpost Field` into the real sim, shoots the result, uninstalls it through the
app's own button and checks the disk. Nothing here is from the sim, and nothing it writes survives the
run. Re-running the script reproduces every frame below.

- `26_airport_editor.jpg` — the whole editor with an airfield in it: the Airport section open with all
  six counts, the field on the map, the airport selected in the Inspector, its rows atop the placed
  list. The section's opening frame, and the one image that shows the four places the feature lives at
  once.
- `27_airport_section.jpg` — the Airport section open, all six cards with their subtitles, nothing
  armed. Clipped to the panel rather than shot as the whole column: the section ends at 480 px and the
  rest is empty.
- `28_airfield_on_map.jpg` — the map alone at z17, everything **deselected**: the runway strip with a
  threshold handle at each end, the pad's white ring, the stand's violet one, the two pink glider
  starts, the winch's rope running off down the extended centreline, and the airport's ⊕ in the middle.
  The frame the text's "each one looks like itself" list points at.
- `29_helipad_close.jpg` — the pad and the stand at z19, close enough to read the **H** and the **P**.
  The pad is **selected** here, deliberately: the cyan grip only exists on a selected pad and the grip
  is half of what the frame is for, so the ring is amber rather than white and the caption says so.
- `30_inspector_airport.jpg` — the airport's own panel: Lon/Lat with their `WAD:` chips, Name with its
  21/29 counter, the ICAO code answering **Free on this machine**, the optional IATA code, the country
  code, and the **Export /airports…** button.
- `31_inspector_runway_1.jpg` / `31_inspector_runway_2.jpg` — the runway panel, top and bottom. It is
  784 px of content in a 505 px panel, so it is two frames rather than one squeezed one; the first
  carries the width, the derived `695 m long · 080° / 260° true`, and END 1 with MALSF and a left PAPI,
  the second END 2.
- `32_inspector_helipad.jpg` — one pad: Lon, Lat, Heading — true, Size — m, Name, and the folded `?`
  notes beside three of them.
- `33_inspector_parking.jpg` — one stand, the same mask plus **Type**.
- `34_inspector_aerotow.jpg` — one aerotow: a point, a heading, a name.
- `35_inspector_winch.jpg` — one winch launch: two coordinate pairs, no heading field at all, the
  `899 m of rope · 260° true` read-out, the glider spacing and the name. The absence of a heading is the
  point of the frame.
- `36_airports_dialog.jpg` — the **Export to /airports** dialog with **Base elevation** filled in, on a
  machine where the code is free (so the button reads *Export to /airports*, not *Replace in*).
- `37_airports_done.jpg` — the result screen: the folder it went to, and the "search LOCATION by name,
  the row may come up blank" instruction that saves the first support question.
- `38_installed_airports.jpg` — the same dialog after the install: the installed list with
  **Uninstall**. 36 and 38 are deliberately the same dialog before and after.
- `39_placed_list_airport.jpg` — the placed list with the airport's own row selected at the top, then
  its five parts in the catalog's order, then the objects. The frame that shows the two columns agree.

**Re-shot in the same pass, because v1.4–v1.8 made them wrong:**

- `05_editor_overview.jpg` — the old one was from **v0.8.0** and said so in its title bar: three catalog
  sections, no Undo/Redo, "Export POI…", an Inspector predating the `.wad` row. Now the current app at
  the starter project's own camera, with the hangar selected. This one had sat in "optional, never shot"
  since the guide was written.
- `07_export_dialog.jpg` — v1.8 (#296) renamed the Destination radios and the primary button:
  *Install into Aerofly FS 4* / *Export to a folder…* became *Aerofly FS 4 — …/scenery/poi* / *A folder
  I choose…*, and *Install into AFS4* became *Export to /poi*. Shot by `docs/shoot_export.mjs`, which
  installs the starter project as a POI so the **Installed POIs** list has a row in it, then uninstalls
  it. ★ The dialog's own title still reads **Export POI**; that is the app, not the frame, and the guide
  says so out loud.
- `24_installed_pois.jpg` — the foot of that same dialog, from the same run.
- `14_topbar.jpg` — the old one had **Export POI…** and **Install HELIPORT…**, and no Undo/Redo. It is
  two rows at 1904 px now rather than one; that is the current layout, not a framing choice.
- `18_catalog_collapsed.jpg` — the counts moved (Objects 855, Airport 6), and the frame is clipped to
  the panel instead of starting at the window's top-left corner.

**Retired with the v1.3 model they documented:** `26_heliport_editor`, `28_helipad_on_map`,
`29_heliport_geometry`, `30_heliport_identity`, `31_install_heliport_dialog`, `32_heliport_installed`,
`33_installed_heliports`. Their numbers are reused above. `docs/shoot_heliport.mjs` still exists and
still runs, but what it shoots — one pad, identity inside the pad's panel, *Install HELIPORT…* — is not
the app any more.

## Optional, never shot

- The **unregistered badge and the Register banner** for section 12. Needs a `.tmb` in
  `scenery/xref/` that PCT hasn't registered yet, which is harder to stage than it's worth.
- The **export refusal in autoheight mode** with a light in the project — a real error screen that
  sections 6 and 12 both describe.
- The **airport install refusing** with neither helipad nor runway, and the **`?` note opened** on a
  field. Both are one line of script away now that `shoot_airport.mjs` exists; neither is worth a frame
  the text does not need.

## Rules

**Each frame is cropped as it's shot**, by hand, at native resolution. A crop that's already JPEG and
under the limit passes through `prep_guide_images.py fit` untouched, so the framing shot is the
framing published. GitHub never scales an image up: a 298 px panel crop renders at 298 px.

Keep every file **under 1 MB**. The stills are JPEG (~q85): at full window size a PNG blows past the
limit and only gets under it by losing colours or scale, and scaled UI text stops being readable.
Every shot is a still: the two planned GIFs became stills.

That 1 MB started as the forum's attachment limit. The guide no longer goes to the forum, but the rule
stays as page weight: a dozen-plus full-size frames is what decides whether `GUIDE.md` opens quickly
on GitHub. Crops are what keep that budget from mattering — the seventeen UI crops together weigh
less than two of the full-window frames.
