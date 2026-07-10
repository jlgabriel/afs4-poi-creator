# Third-Party Notices

PCT (POI Creation Tool) is licensed under **GPL-3.0-or-later** (see [`LICENSE`](LICENSE)).

The packaged application bundles the third-party components listed below. Each component remains
under its own license; PCT preserves their copyright and permission notices here as those
licenses require. **Nothing in this file changes PCT's own license.**

This list covers the runtime ("production") dependencies that ship inside the packaged binary,
verified with `npm ls --omit=dev --all`. Build- and test-only tooling (electron-vite, Vite,
Vitest, Playwright, TypeScript, tsx, and type-only packages such as `@types/*` / `csstype`) is
**not** distributed and is therefore not listed here.

| Component | Version | License | Copyright |
|---|---|---|---|
| Leaflet | 1.9.4 | BSD-2-Clause | © 2010–2023 Volodymyr Agafonkin; © 2010–2011 CloudMade |
| React | 19.2.7 | MIT | © Meta Platforms, Inc. and affiliates |
| React DOM | 19.2.7 | MIT | © Meta Platforms, Inc. and affiliates |
| scheduler | 0.27.0 | MIT | © Meta Platforms, Inc. and affiliates |
| react-window | 2.2.7 | MIT | © 2018 Brian Vaughn |
| Zod | 4.4.3 | MIT | © 2025 Colin McDonnell |
| Zustand | 5.0.14 | MIT | © 2019 Paul Henschel |
| Electron | 43.x | MIT | © Electron contributors; © 2013–2020 GitHub Inc. |

The **Electron** runtime additionally embeds **Chromium** and **Node.js**, themselves an aggregate
of many components under MIT, BSD, Apache-2.0, LGPL and other GPL-compatible licenses. When PCT is
packaged with electron-builder, the complete `LICENSE.electron.txt` and `LICENSES.chromium.html`
are included alongside the executable; refer to those files for the full, component-by-component
texts.

---

## MIT License

Applies to: **React**, **React DOM**, **scheduler** (© Meta Platforms, Inc. and affiliates),
**react-window** (© 2018 Brian Vaughn), **Zod** (© 2025 Colin McDonnell), **Zustand**
(© 2019 Paul Henschel), and **Electron** (© Electron contributors; © 2013–2020 GitHub Inc.).

The copyright holders are as listed above for each component.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## BSD-2-Clause License

Applies to: **Leaflet**.

```
BSD 2-Clause License

Copyright (c) 2010-2023, Volodymyr Agafonkin
Copyright (c) 2010-2011, CloudMade
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

## Bundled data

**Airport list** — `data/aerofly-data/` bundles a pinned snapshot of the **fboes/aerofly-data** airport
dataset, used by the top-bar airport search to recenter the map. It is data, not code (no npm
dependency), so it is not in the table above:

> Airport data © fboes/aerofly-data (MIT), derived from OurAirports (Public Domain).

fboes/aerofly-data is MIT-licensed (© Frank Boës); the underlying airport coordinates come from
OurAirports, released into the Public Domain. Bundling was OK'd by the author. See
[`data/aerofly-data/SOURCE.md`](data/aerofly-data/SOURCE.md) for provenance and the refresh procedure.

---

*Map tiles are fetched at runtime from Esri World Imagery and OpenStreetMap (or a user-configured
XYZ source); they are services, not bundled code, and their required attribution is shown on the
map.*
