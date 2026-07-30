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
- `05_editor_overview.jpg` — the whole editor: top bar, catalog, map, inspector.
- `06_rotate_handle.jpg` — mid-rotation: footprint rectangle swung off the cardinals, cyan handle, the
  live angle badge beside it, and the heading in the Inspector.
- `07_export_dialog.jpg` — the Export POI dialog, filled in.
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

## Still to shoot

Seventeen frames the guide asks for and doesn't have. **None of them needs a flight** — every one is
a desktop screenshot of PCT. Each has a `<!-- SHOT … -->` comment sitting at the exact spot in
`GUIDE.md` where it goes; the guide reads fine without them, which is why they're comments and not
broken image links.

Twelve of them (14–25) come from the pass Juan asked for on 2026-07-30: **show the app instead of
only describing it** — every panel, field and dialog the text names and never puts on screen.
Sections 6 and 7 are the reason it matters. Section 6 explains the height control and shows only
in-sim photos; section 7 has no image at all.

**Most of these are crops, not windows.** A crop of the Inspector column is 40–100 KB, so the twelve
together weigh about as much as *one* of the existing full-window frames. Nothing here needs to be
cut for page weight. They're grouped below by what has to be on screen at once, because one staged
screenshot yields several crops.

### Session A — the editor, one object selected

Open `guide/example/kdag_starter.json`, **Objects** expanded, one object selected (the hangar is a
good one), and press **Fetch elevation** before shooting so the resolved ground figure is on screen.
One screenshot, six images:

- `05_editor_overview.jpg` — **re-shoot.** The current one is from 0.9.0: the title bar says so, and
  its Inspector predates the `FS4 internal (.wad)` row section 4 now describes.
- `14_topbar.jpg` — the top bar alone, full width, cropped to the strip. Everything section 4 lists:
  project, New/Open/Save, Export POI…, Rescan, Settings, airport search, the Heights switch, the map
  style switch, the count.
- `15_catalog_objects.jpg` — the catalog panel with Objects open: category tree, search box, cards
  showing name, footprint and category.
- `16_inspector_object.jpg` — the Inspector column: Lat/Lon, Heading °, Scale ×, Height, Label, Lock,
  and `FS4 internal (.wad)` **shut** at the bottom.
- `17_placed_list.jpg` — the placed list with a dozen rows, one selected, Duplicate / Delete above.
- `19_height_control.jpg` — the Height block on its own: the three mode radios, the metres field, the
  ±0.5 / ±5 buttons, and `terrain ≈ … m ASL`. **The most valuable frame on this list.** Best shot
  with the object in *Terrain + offset* on a negative number — that's pass three of section 6.

### Session B — the catalog in its two states

- `18_catalog_collapsed.jpg` — all three sections shut, so the three families and their counts read
  at a glance, the way section 4 claims.
- `11_photo_on_cards.jpg` — the catalog with **real photos on several cards** next to a couple still
  showing the drawn icon, so the difference is visible in one frame. Better still with the hover
  preview open on one of them. The payoff shot section 10 has never had.

### Session C — lights (section 7 has no images at all)

- `20_lights_catalog.jpg` — the Lights section open: the sim's fixtures and the point light.
- `21_light_inspector.jpg` — an airport light fixture selected: Fixture, Colour, Opposite,
  Orientation °, Visibility group.
- `22_point_light.jpg` — the point light selected: colour, intensity, and **Flashing** ticked so
  Cycle / Sequence / Length show.

**Visibility group is a native `<select>`.** Open, it may not survive the capture — `Win+Shift+S`
closes the popup, `Alt+PrtScn` keeps it. If it fights you, shoot it closed: the four options are
already a table in the text.

### Session D — plants (same section, same problem)

- `23_plant_height.jpg` — a plant selected, cropped so **Plant height (m)** and the shared **Height**
  control are both in frame, one above the other. That pair *is* the classic mistake the text warns
  about. Plants open behind it so the cards' natural heights show.

### Session E — arrange, before and after

- `10_1_arrange_before.jpg` — a crooked, unevenly spaced row of 5–6 parked aircraft, all of them
  selected on the map, with the Inspector showing "N objects selected" and the `Row: … m at …°`
  read-out. (Section 5.)
- `10_2_arrange_after.jpg` — **the same viewpoint**, after Line up + Space evenly + Match row. The
  pair only works if the frame doesn't move between the two.

### Dialogs and read-outs, one at a time

- `13_settings.jpg` — the **Settings** dialog: install folder, object photos folder, object
  footprints, Diagnostics. Sections 2, 10 and 12 all point the reader at Settings and none of them
  shows it. Two frames are fine if it doesn't fit in one.
- `12_set_footprint.jpg` — the **Set footprint…** dialog open on a light card, figures typed in,
  ideally with that light on the map behind it. (Section 10.)
- `24_installed_pois.jpg` — the foot of the Export dialog: the **Installed POIs** list with an
  Uninstall button, and a "not by PCT" row if the install has one. Sections 3, 8 and 12 send the
  reader here. (`07_export_dialog.jpg` already covers the top of the dialog.)
- `25_wad_readout.jpg` — `FS4 internal (.wad)` **expanded**: the projected coordinates and the
  rotation in radians. Section 4 mentions it shut; section 13 is where it's open.

Optional, lower value:

- The **unregistered badge and the Register banner** for section 11. Needs a `.tmb` in
  `scenery/xref/` that PCT hasn't registered yet, which is harder to stage than it's worth.
- The **export refusal in autoheight mode** with a light in the project — a real error screen that
  sections 6 and 12 both describe.

Keep every file **under 1 MB**. The stills are JPEG (~q85): at full window size a PNG blows past the
limit and only gets under it by losing colours or scale, and scaled UI text stops being readable.
Every shot is a still: the two planned GIFs became stills.

That 1 MB started as the forum's attachment limit. The guide no longer goes to the forum, but the rule
stays as page weight: a dozen-plus full-size frames is what decides whether `GUIDE.md` opens quickly
on GitHub. Crops are what keep that budget from mattering.
