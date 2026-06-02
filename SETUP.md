# Satelles setup

- **Run the GEE script** — Open [code.earthengine.google.com](https://code.earthengine.google.com), paste `src/kocani-mosquito-gee.js`, set `GEE_PROJECT` to your Cloud project ID, then click **Run**.
- **Copy the tile URL from Console** — In the Console tab, copy the line printed as `CONFIG.mosquitoTileUrl = '…';` (one line, ready to paste).
- **Paste it into `index.html` CONFIG** — In `index.html`, set `mosquitoTileUrl` to that URL string (not `null`). The demo banner hides automatically; uncomment the GEE raster block in `map.on('load')` when you are ready to show tiles instead of the demo grid.
- **Open the map in a browser** — Open `index.html` directly, or run `npx serve .` and visit `http://localhost:3000`.
- **Deploy to Cloudflare Pages** — In the [Cloudflare Pages](https://pages.cloudflare.com) dashboard, create a project and **drag and drop** the project folder (`index.html`, `manifest.json`, `sw.js`, `public/`, etc.); no build step required.
