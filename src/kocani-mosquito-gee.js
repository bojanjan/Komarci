// Satelles — Mosquito Habitat Suitability Model
// Kočani Valley, North Macedonia
// Last updated: June 2026
//
// ES5 only — no const/let, no arrow functions, no template literals.
// Paste into the GEE Code Editor and click Run.

// ═══════════════════════════════════════════════════════════
// SECTION 1 — STUDY AREA & MAP SETUP
// ═══════════════════════════════════════════════════════════

var kocani = ee.Geometry.Rectangle([22.20, 41.75, 22.65, 42.10]);
Map.centerObject(kocani, 11);
Map.setOptions('SATELLITE');
Map.style().set('cursor', 'crosshair');

// ═══════════════════════════════════════════════════════════
// SECTION 2 — DATES (Rolling 30-day window)
// ═══════════════════════════════════════════════════════════

var today      = ee.Date(Date.now());
var dataEnd    = today;
var dataStart  = today.advance(-30, 'day');
var ndviStart  = today.advance(-60, 'day');
var dateRange  = ee.DateRange(dataStart, dataEnd);
var ndviRange  = ee.DateRange(ndviStart, dataEnd);

var jsNow    = new Date();
var mkMonths = ['Јануари','Февруари','Март','Април','Мај','Јуни',
                'Јули','Август','Септември','Октомври','Ноември','Декември'];
var monthLabel = mkMonths[jsNow.getMonth()] + ' ' + jsNow.getFullYear();

function pad2(n) { return n < 10 ? '0' + n : '' + n; }
var d30ago     = new Date(jsNow.getTime() - 30 * 24 * 60 * 60 * 1000);
var startLabel = d30ago.getFullYear() + '-' + pad2(d30ago.getMonth() + 1) + '-' + pad2(d30ago.getDate());
var endLabel   = jsNow.getFullYear()  + '-' + pad2(jsNow.getMonth()  + 1) + '-' + pad2(jsNow.getDate());

// ═══════════════════════════════════════════════════════════
// SECTION 3 — DATA SOURCES & PROCESSING
// ═══════════════════════════════════════════════════════════

var LST          = ee.ImageCollection('MODIS/061/MOD11A1');
var NDVI         = ee.ImageCollection('MODIS/061/MOD13A1');
var Precip       = ee.ImageCollection('NASA/GPM_L3/IMERG_V07');
var Moisture     = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H');
var Elevation    = ee.Image('CGIAR/SRTM90_V4');
var SAR          = ee.ImageCollection('COPERNICUS/S1_GRD');
var SurfaceWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater');

function safeMean(collection, bandName, fallbackValue, region) {
  var real     = collection.mean().rename(bandName).clip(region);
  var fallback = ee.Image.constant(fallbackValue).rename(bandName).clip(region);
  return ee.Image(ee.Algorithms.If(collection.size().gt(0), real, fallback));
}
function safeSum(collection, bandName, fallbackValue, region) {
  var real     = collection.sum().rename(bandName).clip(region);
  var fallback = ee.Image.constant(fallbackValue).rename(bandName).clip(region);
  return ee.Image(ee.Algorithms.If(collection.size().gt(0), real, fallback));
}

var cLST = ee.Image(
  safeMean(
    LST.select('LST_Day_1km').filterDate(dateRange).filterBounds(kocani),
    'LST_Day_1km', 15000, kocani
  ).toFloat().multiply(0.02).subtract(273.15)
).resample('bilinear');

var cNDVI = ee.Image(safeMean(
  NDVI.select('NDVI').filterDate(ndviRange).filterBounds(kocani),
  'NDVI', 3000, kocani
)).multiply(0.0001).resample('bilinear');

var cPrecip = ee.Image(safeSum(
  Precip.select('precipitation').filterDate(dateRange).filterBounds(kocani),
  'precipitation', 0.5, kocani
)).resample('bilinear');

var gldasRange = ee.DateRange(today.advance(-90, 'day'), dataEnd);
var cHumidity = ee.Image(safeMean(
  Moisture.select('Qair_f_inst').filterDate(gldasRange).filterBounds(kocani),
  'Qair_f_inst', 0.008, kocani
)).resample('bilinear');
var cSoilMoisture = ee.Image(safeMean(
  Moisture.select('SoilMoi0_10cm_inst').filterDate(gldasRange).filterBounds(kocani),
  'SoilMoi0_10cm_inst', 20.0, kocani
)).resample('bilinear');
var cElevation = Elevation.clip(kocani);

var sarCollection = SAR
  .filterDate(dateRange)
  .filterBounds(kocani)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING'))
  .select('VV');

var sarImage = safeMean(sarCollection, 'VV', -15, kocani);
var sarWater = sarImage.lt(-15).rename('water_sar').toFloat();
var jrcWater = SurfaceWater.select('occurrence').clip(kocani).divide(100).unmask(0);
var combinedWater = sarWater.max(jrcWater).clamp(0, 1).rename('water_combined');

var tempWindow = cLST.gte(18).and(cLST.lte(32)).toFloat().rename('temp_window');

// ═══════════════════════════════════════════════════════════
// SECTION 4 — HABITAT SUITABILITY MODEL
// ═══════════════════════════════════════════════════════════

// Monthly weight vectors: [LST, NDVI, Precip, Humidity, Soil, Elevation, Water]
var weightTable = {
  0:  [0.007, 0.003, 0.015, 0.015, 0.041, 0.819, 0.100],
  1:  [0.018, 0.019, 0.070, 0.015, 0.021, 0.758, 0.100],
  2:  [0.199, 0.024, 0.156, 0.061, 0.012, 0.448, 0.100],
  3:  [0.056, 0.067, 0.037, 0.027, 0.021, 0.692, 0.100],
  4:  [0.133, 0.211, 0.146, 0.068, 0.034, 0.307, 0.100],
  5:  [0.202, 0.319, 0.018, 0.289, 0.095, 0.000, 0.077],
  6:  [0.203, 0.032, 0.028, 0.237, 0.075, 0.325, 0.100],
  7:  [0.278, 0.024, 0.017, 0.378, 0.090, 0.113, 0.100],
  8:  [0.336, 0.015, 0.015, 0.263, 0.206, 0.065, 0.100],
  9:  [0.427, 0.001, 0.204, 0.130, 0.068, 0.069, 0.100],
  10: [0.289, 0.053, 0.012, 0.013, 0.193, 0.339, 0.100],
  11: [0.127, 0.027, 0.037, 0.105, 0.043, 0.561, 0.100]
};

var w = weightTable[jsNow.getMonth()];
var W_LST = w[0], W_NDVI = w[1], W_PRECIP = w[2],
    W_HUMIDITY = w[3], W_SOIL = w[4], W_ELEV = w[5], W_WATER = w[6];

var lstNorm = cLST.expression(
  '(lst - 18.0) / (45.0 - 18.0)', { 'lst': cLST }
).clamp(0, 1);

var ndviNorm = cNDVI.expression(
  '(ndvi + 0.2) / (0.85 + 0.2)', { 'ndvi': cNDVI }
).clamp(0, 1);

var precipNorm = cPrecip.expression(
  'precip / 150.0', { 'precip': cPrecip }
).clamp(0, 1);

var humidityNorm = cHumidity.expression(
  '(humidity - 0.005) / (0.015 - 0.005)', { 'humidity': cHumidity }
).clamp(0, 1);

var soilNorm = cSoilMoisture.expression(
  '(soil - 5.0) / (45.0 - 5.0)', { 'soil': cSoilMoisture }
).clamp(0, 1);

var elevNorm = cElevation.expression(
  '(800 - elev) / (800 - 200)', { 'elev': cElevation }
).clamp(0, 1);

var waterNorm = combinedWater;

var rawSuitability = lstNorm.multiply(W_LST)
  .add(ndviNorm.multiply(W_NDVI))
  .add(precipNorm.multiply(W_PRECIP))
  .add(humidityNorm.multiply(W_HUMIDITY))
  .add(soilNorm.multiply(W_SOIL))
  .add(elevNorm.multiply(W_ELEV))
  .add(waterNorm.multiply(W_WATER))
  .rename('suitability');

var suitabilityMasked = rawSuitability.multiply(tempWindow);

var riskRaw = suitabilityMasked.expression(
  '((s - 0.05) / (0.85 - 0.05)) * 100', { 's': suitabilityMasked }
)
  .clamp(0, 100)
  .unmask(0)
  .rename('mosquito_risk')
  .clip(kocani);

// Bilinear on the composite ensures smooth interpolation at display time,
// even if individual input hints were lost during the weighted sum.
// focal_mean adds a 2-pixel smoothing pass on top.
var riskLayer = riskRaw
  .resample('bilinear')
  .focal_mean(2, 'circle', 'pixels')
  .clamp(0, 100)
  .rename('mosquito_risk')
  .clip(kocani);

// ═══════════════════════════════════════════════════════════
// SECTION 5 — CLASSIFIED VISUALIZATION (5 discrete classes)
// ═══════════════════════════════════════════════════════════

var CLASS_PALETTE = ['d6f9d2', '3bb273', 'ffd84d', 'ff8a3d', 'a000ff'];
var CLASS_COLORS  = ['#d6f9d2', '#3bb273', '#ffd84d', '#ff8a3d', '#a000ff'];
var CLASS_NAMES   = [
  'Многу низок ризик · 0–20%',
  'Низок ризик · 20–40%',
  'Среден ризик · 40–60%',
  'Висок ризик · 60–80%',
  'Критично · 80–100%'
];
var CLASS_LABELS = [
  'Практично нема услови за комарци.',
  'Низок ризик — следи ја состојбата.',
  'Среден ризик — можно е засилено присуство.',
  'Висок ризик — очекувај повеќе комарци.',
  'Критично — големо присуство и можни жаришта.'
];

// Continuous palette with many stops for smooth gradient rendering
var DISPLAY_PALETTE = [
  'f0f9e8', 'd6f9d2', 'a8e6a0', '3bb273',
  '7dc44d', 'c0d236', 'ffd84d',
  'ffbb3d', 'ff8a3d', 'f05a28',
  'd42a6b', 'a000ff'
];

var riskViz = { min: 0, max: 100, palette: DISPLAY_PALETTE };

// 0.75 opacity lets the satellite base map show through
Map.addLayer(riskLayer, riskViz, 'Ризик од комарци · ' + monthLabel, true, 0.75);

// Classified image kept for the inspector logic (not displayed)
var riskClasses = ee.Image(0)
  .where(riskLayer.gte(20), 1)
  .where(riskLayer.gte(40), 2)
  .where(riskLayer.gte(60), 3)
  .where(riskLayer.gte(80), 4)
  .unmask(0)
  .rename('risk_class')
  .clip(kocani);

// ═══════════════════════════════════════════════════════════
// SECTION 6 — CLICK INSPECTOR
// ═══════════════════════════════════════════════════════════

// Returns the raw reduceRegion dictionary. Classification happens client-side
// in the evaluate callback so we can correctly distinguish null from 0.
function getRiskAtPoint(point) {
  var buffered = point.buffer(60);
  return riskLayer.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: buffered,
    scale: 30,
    bestEffort: true
  });
}

function classifyRisk(value) {
  if (value >= 80) return 4;
  if (value >= 60) return 3;
  if (value >= 40) return 2;
  if (value >= 20) return 1;
  return 0;
}

// --- Inspector panel (bottom-center) ---

var inspectorTitle = ui.Label({
  value: 'Кликни на картата',
  style: {
    fontSize: '22px',
    fontWeight: 'bold',
    color: '#aaaaaa',
    margin: '0 0 4px 0',
    backgroundColor: 'rgba(0,0,0,0)'
  }
});

var inspectorSubtitle = ui.Label({
  value: 'за да го видиш ризикот на одредена локација.',
  style: {
    fontSize: '12px',
    color: '#999999',
    margin: '0',
    backgroundColor: 'rgba(0,0,0,0)'
  }
});

var inspectorPanel = ui.Panel({
  widgets: [inspectorTitle, inspectorSubtitle],
  style: {
    position: 'bottom-center',
    padding: '12px 20px',
    backgroundColor: 'rgba(10, 15, 13, 0.92)',
    border: '1px solid rgba(255,255,255,0.08)',
    width: '340px'
  }
});

Map.add(inspectorPanel);

// --- Map click handler ---

Map.onClick(function(coords) {
  var point = ee.Geometry.Point([coords.lon, coords.lat]);

  // Reject clicks outside the study area
  var inside = kocani.contains(point);
  inside.evaluate(function(isInside) {
    if (!isInside) {
      inspectorTitle.setValue('Надвор од опсегот');
      inspectorTitle.style().set('color', '#888888');
      inspectorSubtitle.setValue('Satelles моментално покрива само Кочанска Котлина.');
      return;
    }

    inspectorTitle.setValue('Пресметувам…');
    inspectorTitle.style().set('color', '#aaaaaa');
    inspectorSubtitle.setValue('');

    var result = getRiskAtPoint(point);
    result.evaluate(function(stats) {
      if (!stats || stats.mosquito_risk === null || stats.mosquito_risk === undefined) {
        inspectorTitle.setValue('Нема податоци');
        inspectorTitle.style().set('color', '#888888');
        inspectorSubtitle.setValue('Нема податоци за оваа локација.');
        return;
      }

      var pct   = Math.round(stats.mosquito_risk);
      var cls   = classifyRisk(pct);
      var color = CLASS_COLORS[cls] || '#888888';
      var label = CLASS_LABELS[cls] || '';

      inspectorTitle.setValue(pct + '% Ризик');
      inspectorTitle.style().set('color', color);
      inspectorSubtitle.setValue(label);
    });
  });
});

// Future: reuse getRiskAtPoint(ee.Geometry.Point([lon, lat])) for geolocation.

// ═══════════════════════════════════════════════════════════
// SECTION 7 — UI PANEL (Branding, Legend, Tile URL)
// ═══════════════════════════════════════════════════════════

var bg = '#0a0f0d';

var panel = ui.Panel({
  layout: ui.Panel.Layout.flow('vertical'),
  style: {
    width: '260px',
    backgroundColor: bg,
    border: 'none',
    position: 'top-left',
    padding: '16px'
  }
});

// --- Branding ---

panel.add(ui.Label({
  value: 'Satelles',
  style: {
    fontSize: '26px',
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: bg,
    margin: '0 0 4px 0'
  }
}));

panel.add(ui.Label({
  value: 'Активен мониторинг · Кочани',
  style: {
    fontSize: '12px',
    color: '#999999',
    backgroundColor: bg,
    margin: '0 0 16px 0'
  }
}));

// --- Status indicator ---

var statusPanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    backgroundColor: '#1a2421',
    padding: '8px 12px',
    margin: '0 0 20px 0'
  }
});

statusPanel.add(ui.Label({
  value: '●',
  style: {
    fontSize: '10px',
    color: '#3dba6f',
    backgroundColor: 'rgba(0,0,0,0)',
    margin: '2px 6px 0 0'
  }
}));

statusPanel.add(ui.Label({
  value: 'Ажурирано · ' + endLabel,
  style: {
    fontSize: '11px',
    color: '#f0ede8',
    backgroundColor: 'rgba(0,0,0,0)',
    margin: '0'
  }
}));

panel.add(statusPanel);

// --- Legend ---

panel.add(ui.Label({
  value: 'Легенда',
  style: {
    color: '#ffffff',
    fontSize: '13px',
    fontWeight: 'bold',
    backgroundColor: bg,
    margin: '0 0 8px 0'
  }
}));

for (var i = 0; i < CLASS_NAMES.length; i++) {
  panel.add(ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      backgroundColor: bg,
      padding: '2px 0'
    },
    widgets: [
      ui.Label({
        value: '',
        style: {
          backgroundColor: CLASS_COLORS[i],
          width: '14px',
          height: '14px',
          margin: '2px 10px 2px 0'
        }
      }),
      ui.Label({
        value: CLASS_NAMES[i],
        style: {
          color: '#cccccc',
          fontSize: '11px',
          backgroundColor: bg,
          margin: '2px 0'
        }
      })
    ]
  }));
}

// --- Divider ---

panel.add(ui.Label({
  value: '',
  style: {
    backgroundColor: '#222222',
    height: '1px',
    margin: '16px 0'
  }
}));

// --- Disclaimer ---

panel.add(ui.Label({
  value: 'Satelles ги користи сателитските податоци (температура, вода, ' +
    'вегетација) за да процени услови за комарци. Овие информации се ' +
    'индикативни и не се медицинска дијагноза ниту официјално ' +
    'здравствено предупредување.',
  style: {
    fontSize: '9px',
    color: '#777777',
    margin: '0 0 16px 0',
    whiteSpace: 'pre-wrap',
    backgroundColor: bg
  }
}));

// --- Tile URL export button ---

panel.add(ui.Button({
  label: 'Копирај Tile URL за Web',
  style: {
    stretch: 'horizontal',
    color: '#000000'
  },
  onClick: function() {
    print('Генерирање URL…');
    riskLayer.getMap(
      { min: 0, max: 100, palette: DISPLAY_PALETTE },
      function(mapId, error) {
        if (error) { print('Грешка: ' + error); return; }
        print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        print("CONFIG.mosquitoTileUrl = '" + mapId.urlFormat + "';");
        print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    );
  }
}));

Map.add(panel);
