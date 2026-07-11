# Build resources

electron-builder's `buildResources` directory (see `electron-builder.yml`). Holds the app icons,
which electron-builder auto-detects at build time:

- `icon.ico` — Windows (multi-res, 16–256 px)
- `icon.icns` — macOS
- `icon.png` — Linux (1024×1024)
- `screenshot.png` — the editor shot used in the top-level README (not a build input)

The icon is a map pin in the app's brand blue (`#2563eb`) on the dark TopBar background, generated
from a single 1024² master (`scripts/`-free; a one-off Pillow script). This directory is
intentionally **not** `build/` — that name is a scratch target for `npm run export`.
