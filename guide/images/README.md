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

From here on the frames are crops of the app itself, not windows — the pass that shows the UI the
text names instead of only describing it. They come off one staged editor screen (session A below):

- `14_topbar.jpg` — the top bar, cropped to the strip: project, New/Open/Save, Export POI…, Rescan,
  Settings, airport search, the Heights switch, the map style switch, the count.
- `15_catalog_objects.jpg` — the Catalog panel, all three sections open: search box, category tree,
  and cards carrying name, footprint and category.
- `16_inspector_object.jpg` — the Inspector on one selected object, with `FS4 internal (.wad)` shut.
- `17_placed_list.jpg` — the placed list, one row selected, Duplicate / Delete above it.
- `19_height_control.jpg` — the Inspector after one press of −0.5: *Terrain* has become
  *Terrain + offset* at −0.50 m. Section 6's control, shown instead of only explained.
- `25_wad_readout.jpg` — `FS4 internal (.wad)` expanded, in section 13 where it's explained.

16 and 19 are the same panel a click apart, and that's the point of the pair: 19 is what section 6's
nudge does to it.

## Still to shoot

Eleven frames the guide asks for and doesn't have. **None of them needs a flight** — every one is a
desktop screenshot of PCT. Each has a `<!-- SHOT … -->` comment sitting at the exact spot in
`GUIDE.md` where it goes; the guide reads fine without them, which is why they're comments and not
broken image links.

They're the rest of the pass Juan asked for on 2026-07-30: **show the app instead of only describing
it** — every panel, field and dialog the text names and never puts on screen. Section 7 is the reason
it still matters; it has no image at all. **Session A is shot and in** (14, 15, 16, 17, 19, 25).

**These are crops, not windows.** A crop of the Inspector column is 40–100 KB — the six from session A
together weigh less than *one* of the existing full-window frames. Nothing here needs to be cut for
page weight.

**Each frame is cropped as it's shot**, so what's below is a framing spec, one entry per file. They're
grouped by what has to be on screen at once, because staging the app once yields several frames off
the same screen. A crop that's already JPEG and under the limit passes through `fit` untouched: the
framing you shoot is the framing that ships.

### Session A — the editor, one object selected — DONE

Left over from it, optional: **re-shoot `05_editor_overview.jpg`.** The current one is from 0.9.0 —
the title bar says so, and its Inspector predates the `FS4 internal (.wad)` row section 4 describes.

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
