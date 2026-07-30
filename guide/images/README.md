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

From here on the frames are crops of the app itself, not windows — the pass shot on 2026-07-30 to
**show the UI the text names instead of only describing it**. Sections 6 and 7 were the reason:
section 6 explained the height control over in-sim photos, and section 7 had no image at all.

The editor, off one staged screen (`guide/example/kdag_starter.json`, the hangar selected):

- `14_topbar.jpg` — the top bar, cropped to the strip: project, New/Open/Save, Export POI…, Rescan,
  Settings, airport search, the Heights switch, the map style switch, the count.
- `15_catalog_objects.jpg` — the Catalog panel, all three sections open: search box, category tree,
  and cards carrying name, footprint and category.
- `16_inspector_object.jpg` — the Inspector on one selected object, with `FS4 internal (.wad)` shut.
- `17_placed_list.jpg` — the placed list, one row selected, Duplicate / Delete above it.
- `18_catalog_collapsed.jpg` — the Catalog as it opens: three sections shut, three counts.
- `19_height_control.jpg` — the Inspector after one press of −0.5: *Terrain* has become
  *Terrain + offset* at −0.50 m. Section 6's control, shown instead of only explained.
- `25_wad_readout.jpg` — `FS4 internal (.wad)` expanded, in section 13 where it's explained.

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

- `11_photo_on_cards.jpg` — a card carrying a photo among cards still showing the drawn icon, hover
  preview open, the exact id spelled out. Section 10's payoff. The photo on it is a test placeholder;
  a real in-sim shot would sell the feature harder.
- `12_set_footprint.jpg` — the footprint dialog on a light fixture, figures typed in.
- `13_settings.jpg` — Settings entire: both folders, the photos folder, map tiles, elevation
  provider, Rescan, the footprints Import / Export, Diagnostics. Sections 2, 10 and 12 all send the
  reader here.
- `24_installed_pois.jpg` — the foot of the Export dialog: installed POIs, each with its Uninstall.
  (`07_export_dialog.jpg` covers the top of the same dialog.)

## Optional, never shot

- **Re-shoot `05_editor_overview.jpg`.** The current one is from 0.9.0 — the title bar says so, and
  its Inspector predates the `FS4 internal (.wad)` row section 4 describes.
- The **unregistered badge and the Register banner** for section 11. Needs a `.tmb` in
  `scenery/xref/` that PCT hasn't registered yet, which is harder to stage than it's worth.
- The **export refusal in autoheight mode** with a light in the project — a real error screen that
  sections 6 and 12 both describe.

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
