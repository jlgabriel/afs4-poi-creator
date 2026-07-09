# Build resources

electron-builder's `buildResources` directory (see `electron-builder.yml`). Drop platform icons
here when we brand the app (M3):

- `icon.ico` — Windows (256×256 multi-res)
- `icon.icns` — macOS
- `icon.png` — Linux (512×512)

Until then the dev builds fall back to Electron's default icon (electron-builder prints a warning,
which is expected). This directory is intentionally **not** `build/` — that name is a scratch target
for `npm run export`.
