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

Five frames the guide asks for and doesn't have. **None of them needs a flight** — every one is a
desktop screenshot of PCT. Each has a `<!-- SHOT … -->` comment sitting at the exact spot in
`GUIDE.md` where it goes; the guide reads fine without them, which is why they're comments and not
broken image links.

- `10_1_arrange_before.jpg` — a crooked, unevenly spaced row of 5–6 parked aircraft, all of them
  selected on the map, with the Inspector showing "N objects selected" and the `Row: … m at …°`
  read-out. (Section 5.)
- `10_2_arrange_after.jpg` — **the same viewpoint**, after Line up + Space evenly + Match row. The
  pair only works if the frame doesn't move between the two.
- `11_photo_on_cards.jpg` — the catalog with **real photos on several cards** next to a couple still
  showing the drawn icon, so the difference is visible in one frame. Better still with the hover
  preview open on one of them. This is the payoff shot section 10 has never had.
- `12_set_footprint.jpg` — the **Set footprint…** dialog open on a light card, figures typed in,
  ideally with that light on the map behind it. (Section 10.)
- `13_settings.jpg` — the **Settings** dialog: install folder, object photos folder, object
  footprints, Diagnostics. Sections 2, 10 and 12 all point the reader at Settings and none of them
  shows it. Two frames are fine if it doesn't fit in one.

Optional, lower value:

- **Re-shoot `05_editor_overview.jpg`.** The current one is from **0.9.0**: the title bar says so, and
  its Inspector predates the `FS4 internal (.wad)` row that section 4 now describes. Nothing in it is
  wrong, it's just a version behind.
- A shot of the **unregistered badge and the Register banner** for section 11. Needs a `.tmb` in
  `scenery/xref/` that PCT hasn't registered yet, which is harder to stage than it's worth.

Keep every file **under 1 MB**. The stills are JPEG (~q85): at full window size a PNG blows past the
limit and only gets under it by losing colours or scale, and scaled UI text stops being readable.
Every shot is a still: the two planned GIFs became stills.

That 1 MB started as the forum's attachment limit. The guide no longer goes to the forum, but the rule
stays as page weight: a dozen-plus full-size frames is what decides whether `GUIDE.md` opens quickly
on GitHub.
