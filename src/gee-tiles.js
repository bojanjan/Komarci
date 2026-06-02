/**
 * gee-tiles.js — Google Earth Engine tile server
 *
 * Deploy this as a Cloud Run (Node.js) or App Engine function.
 * It authenticates with GEE service account, computes the risk
 * raster, and returns XYZ tile URLs for MapLibre.
 *
 * LOCAL DEV: run `node gee-tiles.js` then point your map at
 *   http://localhost:3000/tiles/mosquito/{z}/{x}/{y}
 *   http://localhost:3000/tiles/soil/{z}/{x}/{y}
 *
 * DEPLOY: Cloud Run free tier (240K requests/month) is enough
 * for MVP. Tiles are cached by Cloudflare CDN automatically.
 */

const ee = require('@google/earthengine');
const express = require('express');
const app = express();

// ── Auth (use service account JSON in production) ─────────
// Set env var GEE_KEY_JSON or use Application Default Credentials
ee.data.authenticateViaPrivateKey(
  JSON.parse(process.env.GEE_KEY_JSON || '{}'),
  () => { ee.initialize(null, null, startServer); },
  err => { console.error('GEE auth failed:', err); process.exit(1); }
);

function startServer() {
  // ── Mosquito risk layer ──────────────────────────────────
  function getMosquitoLayer() {
    const kocani = ee.Geometry.Rectangle([22.2, 41.75, 22.65, 42.1]);
    const now    = ee.Date(Date.now());
    const past30 = now.advance(-30, 'day');

    // Sentinel-1 SAR — water/flood detection
    const s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
      .filterBounds(kocani)
      .filterDate(past30, now)
      .filter(ee.Filter.eq('instrumentMode', 'IW'))
      .select('VV')
      .mean();
    const water = s1.lt(-15).rename('water'); // SAR backscatter < -15dB = water

    // MODIS LST — 18–32°C breeding window
    const modisLST = ee.ImageCollection('MODIS/061/MOD11A1')
      .filterBounds(kocani)
      .filterDate(past30, now)
      .select('LST_Day_1km')
      .mean()
      .multiply(0.02).subtract(273.15); // Convert to Celsius
    const tempWindow = modisLST.gte(18).and(modisLST.lte(32)).rename('temp_window');

    // ERA5 rainfall proxy (wet days in last 30d)
    const era5 = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
      .filterBounds(kocani)
      .filterDate(past30, now)
      .select('total_precipitation')
      .sum()
      .rename('rainfall');
    const wetness = era5.divide(0.1).min(1); // Normalize 0–1

    // Risk score: water × temp window × wetness
    const risk = water.multiply(tempWindow).multiply(
      wetness.multiply(0.5).add(0.5)
    ).rename('risk');

    return risk.visualize({
      min: 0, max: 1,
      palette: ['00000000', 'ffdc00aa', 'f56800cc', 'e82828dd']
    });
  }

  // ── Soil health layer ────────────────────────────────────
  function getSoilLayer() {
    const kocani = ee.Geometry.Rectangle([22.2, 41.75, 22.65, 42.1]);
    const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(kocani)
      .filterDate(ee.Date(Date.now()).advance(-60, 'day'), ee.Date(Date.now()))
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
      .median();

    const ndvi = s2.normalizedDifference(['B8', 'B4']).rename('ndvi');
    const ndwi = s2.normalizedDifference(['B3', 'B8']).rename('ndwi');
    const ndmi = s2.normalizedDifference(['B8', 'B11']).rename('ndmi');

    // Combined soil health index
    const soil = ndvi.multiply(0.5).add(ndmi.multiply(0.3)).add(
      ndwi.multiply(0.2).multiply(-1).add(0.2)
    ).rename('soil_health');

    return soil.visualize({
      min: 0, max: 1,
      palette: ['e82828', 'f5a623', '3dba6f']
    });
  }

  // ── Tile endpoint ────────────────────────────────────────
  app.get('/tiles/:layer/:z/:x/:y', async (req, res) => {
    const { layer, z, x, y } = req.params;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h cache

    try {
      const image = layer === 'mosquito' ? getMosquitoLayer() : getSoilLayer();
      const mapId = await new Promise((resolve, reject) => {
        image.getMap({}, (mapId, err) => err ? reject(err) : resolve(mapId));
      });
      const tileUrl = `https://earthengine.googleapis.com/v1/projects/earthengine-public/maps/${mapId.mapid}/tiles/${z}/${x}/${y}`;
      const tile = await fetch(tileUrl, { headers: { Authorization: `Bearer ${mapId.token}` } });
      res.set('Content-Type', 'image/png');
      tile.body.pipe(res);
    } catch (err) {
      console.error(err);
      res.status(500).send('Tile error');
    }
  });

  // ── Health check ─────────────────────────────────────────
  app.get('/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

  app.listen(3000, () => console.log('GEE tile server running on :3000'));
}

module.exports = app; // For Cloud Run
