# Сателес (Satelles) — MVP

Mosquito breeding risk + soil health map for Kočani Valley, North Macedonia.
Free, public, mobile-first. No login. No ads. No friction.

---

## Getting started in 5 minutes

```bash
# 1. Clone / open in Cursor
cd satelles

# 2. Open index.html in your browser — works with zero setup
open index.html
# or: npx serve .
```

That's it for the frontend. You'll see a dark map of Macedonia with a demo
mosquito risk grid and the full UI already working.

---

## Project structure

```
satelles/
├── index.html          ✅ Complete — map + all UI in one file
├── manifest.json       ✅ PWA manifest
├── sw.js               ✅ Service worker (offline)
├── .cursorrules        ✅ Cursor AI context
├── src/
│   └── gee-tiles.js    🔧 GEE tile server (needs GEE credentials)
└── public/
    ├── icon-192.png    🔧 Add your app icon (192×192 px)
    └── icon-512.png    🔧 Add your app icon (512×512 px)
```

---

## Cursor workflows — copy-paste prompts

### Add the real GEE tile layer

Open `index.html` in Cursor and paste:

```
In CONFIG at the top of the script, set mosquitoTileUrl and soilTileUrl
to the real GEE tile endpoints from gee-tiles.js. Then uncomment the
GEE raster tile source block in the map.on('load') handler. Keep the
demo GeoJSON grid for local development fallback.
```

### Make the search autocomplete as-you-type

```
In initSearch(), add a debounced fetch to the Nominatim API on every
keystroke (300ms debounce). Show results in a dropdown list below the
input. On click, fly to that result and close the dropdown. Style the
dropdown with the same .glass class.
```

### Add a date range slider for historical data

```
Add a horizontal range slider fixed at the bottom-center of the screen
(above the legend). It should let users scrub through the last 30 days.
On change, update the tile URL query param ?date=YYYY-MM-DD and refresh
the risk layer. Style with glass background, red accent for mosquito mode,
green for soil.
```

### Macedonian / English language toggle

```
Add a small language toggle button (MK / EN) to the controls-right panel.
Use a data-i18n attribute pattern: every text string in the HTML gets
data-i18n="key". Create a translations object for both languages.
Toggle swaps all strings. Default is Macedonian (mk).
```

### Deploy to Cloudflare Pages

```
Create a wrangler.toml for Cloudflare Pages deployment. The site is
static — just index.html + manifest.json + sw.js + public/.
Add a _headers file that sets Cache-Control: public, max-age=3600
for all files and Cross-Origin-Opener-Policy: same-origin.
```

---

## Connecting to Google Earth Engine

1. Create a GEE project at code.earthengine.google.com
2. Enable Earth Engine API in Google Cloud Console
3. Create a service account + download JSON key
4. Set env var: `export GEE_KEY_JSON=$(cat your-key.json)`
5. `cd src && npm install @google/earthengine express`
6. `node gee-tiles.js` — server starts on :3000
7. In `index.html`, set `CONFIG.mosquitoTileUrl = 'http://localhost:3000/tiles/mosquito/{z}/{x}/{y}'`

For production: deploy `gee-tiles.js` to Cloud Run (free tier covers MVP scale).

---

## Day-1 fork: NASA iMMOD

Before writing your own GEE risk model, fork this open-source code:
https://github.com/NASA-DEVELOP/iMMOD

It's a complete GEE mosquito habitat model. Adapt the outputs to feed
your tile server instead of writing from scratch.

---

## Revenue milestones

| Stage | Action | Revenue |
|-------|--------|---------|
| Now   | Deploy public map, get press | €0 — building trust |
| +3mo  | Apply for EU IPA / Google.org grant | €30k–€100k |
| +6mo  | Pitch Kočani + 2 neighboring municipalities | €15k–€60k/yr |
| +12mo | Approach agrochemical / insurance sponsor | €10k–€50k/yr |
| +18mo | B2B API for crop insurers | €500–€5k/mo |

---

## Tech stack cheat sheet

| What | Tool | Cost |
|------|------|------|
| Map renderer | MapLibre GL JS | Free |
| Base tiles | OpenStreetMap | Free |
| Satellite data | Google Earth Engine | Free (research) |
| Hosting | Cloudflare Pages | Free |
| Geocoding | Nominatim | Free |
| Tile server | Cloud Run (Node.js) | Free tier |
| PWA | manifest.json + sw.js | Free |

---

*Kočani Valley · Satelles Reference Document · May 2026*
