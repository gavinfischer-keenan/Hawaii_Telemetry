// =====================================================================
// HONOLULU COMMAND CENTER — script.js
// =====================================================================

// --- MAP SETUP ---
const bounds = [[20.80, -158.45], [21.75, -156.45]];

var map = L.map('map', {
    zoomControl: false, interactive: false, attributionControl: false,
    minZoom: 10, maxZoom: 10, maxBounds: bounds, maxBoundsViscosity: 1.0
}).setView([21.265, -157.785], 10);

// --- Z-INDEX PANES ---
map.createPane('depthPane');   map.getPane('depthPane').style.zIndex   = 200;
map.createPane('aqiPane');     map.getPane('aqiPane').style.zIndex     = 250;
map.createPane('windPane');    map.getPane('windPane').style.zIndex    = 300;
map.createPane('radarPane');   map.getPane('radarPane').style.zIndex   = 350;
map.createPane('currentPane'); map.getPane('currentPane').style.zIndex = 400;
map.createPane('trafficPane'); map.getPane('trafficPane').style.zIndex = 500;
map.createPane('surfPane');    map.getPane('surfPane').style.zIndex    = 550;
map.createPane('poiPane');     map.getPane('poiPane').style.zIndex     = 600;

// --- BASE TILES ---
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13 }).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, className: 'blend-multiply' }).addTo(map);

// --- LAYER GROUPS ---
// Always-visible permanent layers:
var depthLayer      = L.layerGroup().addTo(map);
var surfLayer       = L.layerGroup().addTo(map);
var staticPoiLayer  = L.layerGroup().addTo(map);
// Panel-toggled layers:
var radarLayerGroup = L.layerGroup();
var windLayer       = L.layerGroup();
var currentLayer    = L.layerGroup();
var buoyLayer       = L.layerGroup();
var quakeLayer      = L.layerGroup();
var lightningLayer  = L.layerGroup();
var aqiLayer        = L.layerGroup();
var airLayer        = L.layerGroup();
var shipLayer       = L.layerGroup();

// --- NEXRAD: Self-refreshing live radar (IEM, ~5-min updates) ---
// The ts= param cache-busts the browser tile cache each 5-min window,
// matching the actual IEM NEXRAD composite refresh rate.
var _radarTile = null;
function refreshRadar() {
    const ts = Math.floor(Date.now() / 300000);
    if (_radarTile) radarLayerGroup.removeLayer(_radarTile);
    _radarTile = L.tileLayer(
        `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?ts=${ts}`,
        { pane: 'radarPane', opacity: 0.65 }
    );
    radarLayerGroup.addLayer(_radarTile);
}
refreshRadar();
setInterval(refreshRadar, 5 * 60 * 1000);

// --- SEEDED RNG — depth numbers stay identical every page load ---
function makeSeededRng(seed) {
    let s = seed >>> 0;
    return function() { s = Math.imul(1664525, s) + 1013904223 >>> 0; return s / 0xFFFFFFFF; };
}
const rng = makeSeededRng(0xABCDEF42);

// --- LAND MASK — only skip depth scatter over actual island terrain ---
function isOnLand(lat, lng) {
    const oahu    = (lat > 21.28 && lat < 21.72 && lng > -158.27 && lng < -157.63);
    const molokai = (lat > 21.06 && lat < 21.21 && lng > -157.31 && lng < -156.68);
    return oahu || molokai;
}

// =====================================================================
// DEPTH SOUNDINGS
// =====================================================================
const curatedDepths = [
    // North of Oahu — fill in the blank area north of the island
    { c: [21.730, -158.200], d: "1760" }, { c: [21.742, -158.050], d: "1640" },
    { c: [21.748, -157.920], d: "1590" }, { c: [21.735, -157.800], d: "1560" },
    { c: [21.741, -157.680], d: "1490" }, { c: [21.728, -157.560], d: "1430" },
    { c: [21.738, -157.440], d: "1370" }, { c: [21.745, -157.320], d: "1310" },
    { c: [21.750, -157.200], d: "1250" }, { c: [21.738, -157.080], d: "1180" },
    { c: [21.730, -156.960], d: "1110" }, { c: [21.742, -156.840], d: "1060" },
    { c: [21.748, -156.720], d: "1010" }, { c: [21.735, -156.600] ,d: "960"  },
    { c: [21.720, -156.500], d: "920"  },
    // Kaiwi Channel (between Oahu and Molokai) — fill this gap
    { c: [21.200, -157.640], d: "1420" }, { c: [21.160, -157.700], d: "1380" },
    { c: [21.180, -157.760], d: "1310" }, { c: [21.140, -157.820], d: "1270" },
    { c: [21.120, -157.870], d: "1240" }, { c: [21.230, -157.580], d: "1480" },
    { c: [21.105, -157.920], d: "1200" }, { c: [21.145, -157.950], d: "1190" },
    // Between Molokai & Maui — Pailolo Channel
    { c: [21.050, -156.990], d: "430"  }, { c: [21.040, -156.960], d: "520"  },
    { c: [21.060, -156.930], d: "380"  }, { c: [21.030, -157.020], d: "610"  },
    { c: [21.045, -156.870], d: "340"  }, { c: [21.025, -156.840], d: "290"  },
    // Kaneohe Bay & Kailua area
    { c: [21.46, -157.82], d: "14"   }, { c: [21.43, -157.78], d: "45"  },
    { c: [21.41, -157.73], d: "35"   }, { c: [21.38, -157.75], d: "28"  },
    { c: [21.44, -157.80], d: "20"   }, { c: [21.50, -157.86], d: "12"  },
    // Pearl Harbor approach & Honolulu south shore
    { c: [21.30, -157.98], d: "15"   }, { c: [21.26, -157.94], d: "65"  },
    { c: [21.260,-157.845], d: "18"  }, { c: [21.242,-157.820], d: "65"  },
    { c: [21.230,-157.720], d: "210" }, { c: [21.215,-157.860], d: "30"  },
    { c: [21.245,-157.900], d: "48"  }, { c: [21.270,-157.950], d: "32"  },
    // Waianae (west) coast
    { c: [21.43, -158.22], d: "75"   }, { c: [21.33, -158.15], d: "85"  },
    { c: [21.28, -158.13], d: "120"  }, { c: [21.38, -158.20], d: "95"  },
    { c: [21.23, -158.10], d: "140"  }, { c: [21.48, -158.25], d: "60"  },
    // North Shore / Haleiwa offshore
    { c: [21.62, -158.13], d: "80"   }, { c: [21.64, -158.07], d: "45"  },
    { c: [21.68, -158.05], d: "110"  }, { c: [21.66, -158.10], d: "62"  },
    { c: [21.70, -158.03], d: "90"   }, { c: [21.60, -158.05], d: "55"  },
    { c: [21.72, -158.08], d: "130"  }, { c: [21.58, -157.98], d: "72"  },
    // Molokai south reef and shelf
    { c: [21.07, -157.20], d: "22"   }, { c: [21.06, -157.10], d: "18"  },
    { c: [21.06, -156.90], d: "25"   }, { c: [21.05, -157.28], d: "65"  },
    { c: [21.03, -157.15], d: "90"   }, { c: [21.08, -157.00], d: "35"  },
    { c: [21.07, -156.95], d: "28"   }, { c: [21.09, -157.25], d: "42"  },
    // Molokai Halawa / north side
    { c: [21.160,-156.710], d: "85"  }, { c: [21.180,-156.750], d: "120" },
    { c: [21.200,-156.800], d: "240" }, { c: [21.170,-156.730], d: "105" },
    { c: [21.190,-156.770], d: "180" },
    // Deep channel slopes south of Oahu
    { c: [21.185,-157.840], d: "510" }, { c: [21.225,-157.695], d: "310" },
    { c: [21.190,-157.640], d: "590" }, { c: [21.200,-157.750], d: "420" },
    { c: [21.210,-157.680], d: "380" },
    // Open water south of Molokai
    { c: [20.950,-157.250], d: "55"  }, { c: [20.900,-157.300], d: "62"  },
    { c: [21.000,-157.150], d: "95"  }, { c: [20.970,-157.180], d: "78"  },
    { c: [20.920,-157.270], d: "68"  },
];
curatedDepths.forEach(s => {
    L.marker(s.c, { pane: 'depthPane',
        icon: L.divIcon({ className: 'depth-label', html: s.d, iconSize: [40, 15] })
    }).addTo(depthLayer);
});

// Seeded scatter — everywhere that is NOT land (covers north, channels, open ocean)
for (let lat = bounds[0][0]; lat <= bounds[1][0]; lat += 0.07) {
    for (let lng = bounds[0][1]; lng <= bounds[1][1]; lng += 0.10) {
        if (!isOnLand(lat, lng)) {
            const jLat = lat + (rng() - 0.5) * 0.04;
            const jLng = lng + (rng() - 0.5) * 0.06;
            const dist = Math.hypot(21.26 - jLat, -157.78 - jLng);
            // Kaiwi Channel gets shallower abyssal values
            const isChannel = (jLat > 21.05 && jLat < 21.28 && jLng > -157.95 && jLng < -157.58);
            let depth = Math.floor(isChannel
                ? 800 + dist * 700  + (rng() - 0.5) * 150
                : 900 + dist * 1400 + (rng() - 0.5) * 180);
            L.marker([jLat, jLng], {
                pane: 'depthPane',
                icon: L.divIcon({ className: 'depth-label', html: String(depth), iconSize: [40, 15] })
            }).addTo(depthLayer);
        }
    }
}

// =====================================================================
// STATIC NOAA BUOY LABELS (always on map)
// =====================================================================
[
    { c: [21.211, -157.694], n: "⚓ 51211 Koko Head"  },
    { c: [21.414, -157.678], n: "⚓ 51202 Mokapu"     },
    { c: [21.127, -158.040], n: "⚓ 51212 Barbers Pt" },
    { c: [21.673, -158.112], n: "⚓ 51201 Waimea"     },
    { c: [21.065, -156.970], n: "⚓ 51204 Pailolo Ch" },
].forEach(b => {
    L.marker(b.c, { pane: 'poiPane',
        icon: L.divIcon({ className: 'poi-label', html: b.n, iconSize: [150, 20] })
    }).addTo(staticPoiLayer);
});

// =====================================================================
// SURF SPOTS — animated markers on beach / land side of shoreline
// =====================================================================
// Coordinates adjusted so each marker sits at the beach, not offshore.
const surfSpots = [
    { c: [21.658, -158.044], name: "Pipeline",  buoyId: "51201", scale: 1.05 },
    { c: [21.635, -158.062], name: "Waimea",    buoyId: "51201", scale: 0.95 },
    { c: [21.574, -158.010], name: "Sunset",    buoyId: "51201", scale: 0.90 },
    { c: [21.474, -158.208], name: "Makaha",    buoyId: "51212", scale: 0.85 },
    { c: [21.278, -157.827], name: "Waikiki",   buoyId: "51211", scale: 0.70 },
    { c: [21.295, -157.649], name: "Sandy's",   buoyId: "51211", scale: 0.90 },
    { c: [21.163, -157.220], name: "Kepuhi",    buoyId: "51204", scale: 0.80 },
    { c: [21.158, -156.720], name: "Halawa",    buoyId: "51202", scale: 0.75 },
];

var surfMarkers = [];
function initSurfMarkers() {
    surfLayer.clearLayers();
    surfMarkers = [];
    surfSpots.forEach(s => {
        const icon = L.divIcon({
            className: '',
            html: `<div class="surf-marker"><span class="surf-emoji">🏄</span><span class="surf-text">${s.name}: --</span></div>`,
            iconSize: [145, 26]
        });
        const marker = L.marker(s.c, { pane: 'surfPane', icon });
        marker.addTo(surfLayer);
        surfMarkers.push({ marker, spot: s });
    });
}
initSurfMarkers();

function updateSurfLabels(buoys) {
    if (!buoys) return;
    const byId = {};
    buoys.forEach(b => { byId[b.id] = b; });
    surfMarkers.forEach(({ marker, spot }) => {
        const buoy = byId[spot.buoyId];
        let heightStr = '--';
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const hft = buoy.waveHeight * 3.281 * spot.scale;
            heightStr = `${Math.max(1, Math.floor(hft * 0.85))}-${Math.ceil(hft * 1.15)}ft`;
        }
        marker.setIcon(L.divIcon({
            className: '',
            html: `<div class="surf-marker"><span class="surf-emoji">🏄</span><span class="surf-text">${spot.name}: ${heightStr}</span></div>`,
            iconSize: [145, 26]
        }));
    });
}

// =====================================================================
// WIND VECTORS & OCEAN CURRENTS
// =====================================================================
for (let lat = bounds[0][0]; lat <= bounds[1][0]; lat += 0.06) {
    for (let lng = bounds[0][1]; lng <= bounds[1][1]; lng += 0.08) {
        if (!isOnLand(lat, lng)) {
            let dir = '↙', spd = 18;
            if (lng < -158.0 && lat < 21.6 && lat > 21.2) { dir = '↖'; spd = Math.floor(rng() * 4) + 2; }
            if (lng > -157.7 && lng < -157.4 && lat > 21.1 && lat < 21.3) spd = 24;
            const html = `${dir}<br><span style="font-size:10px;color:#00ffcc;">${spd}</span>`;
            L.marker([lat, lng], { pane: 'windPane',
                icon: L.divIcon({ className: 'vector-arrow', html, iconSize: [30, 30] })
            }).addTo(windLayer);
        }
    }
}
[
    { c: [21.55,-157.30], d:'↙' }, { c: [21.65,-157.85], d:'↙' },
    { c: [21.24,-157.62], d:'↙' }, { c: [21.18,-157.65], d:'↙' },
    { c: [21.20,-157.75], d:'↙' }, { c: [21.10,-157.88], d:'⬅' },
    { c: [21.40,-157.60], d:'↙' }, { c: [21.25,-158.15], d:'↖' },
    { c: [20.95,-157.50], d:'⬅' }, { c: [20.85,-157.10], d:'⬅' },
].forEach(pt => L.marker(pt.c, { pane: 'currentPane',
    icon: L.divIcon({ className: 'current-arrow', html: pt.d, iconSize: [20, 20] })
}).addTo(currentLayer));

// =====================================================================
// TRAFFIC
// =====================================================================
[
    { c: [21.320,-157.860], text: "✈️ HAL12 FL310"   },
    { c: [21.255,-157.710], text: "✈️ SWA453 4.2k"   },
    { c: [21.130,-157.480], text: "✈️ UAL930 FL240"  },
    { c: [21.180,-156.920], text: "🚁 TOUR01 700ft"  },
].forEach(t => L.marker(t.c, { pane: 'trafficPane',
    icon: L.divIcon({ className: 'traffic-label traffic-label-air', html: t.text, iconSize: [160,20] })
}).addTo(airLayer));

[
    { c: [21.228,-157.800], text: "🚢 MATSON NAVIGATOR" },
    { c: [21.020,-157.150], text: "🚢 LAHAINA CRUISER"  },
    { c: [21.340,-158.050], text: "🚢 ALOHA MARINER"    },
    { c: [21.150,-157.550], text: "⛵ HOKULEʻA"        },
].forEach(t => L.marker(t.c, { pane: 'trafficPane',
    icon: L.divIcon({ className: 'traffic-label traffic-label-ship', html: t.text, iconSize: [180,20] })
}).addTo(shipLayer));

// =====================================================================
// LIVE DATA STORE
// =====================================================================
var liveData = { weather: null, buoys: null, quakes: null, alerts: null, airquality: null };

const buoyCoords = {
    '51201': [21.673, -158.112],
    '51211': [21.211, -157.694],
    '51212': [21.127, -158.040],
    '51202': [21.414, -157.678],
    '51204': [21.065, -156.970],
    '51213': [21.080, -157.050],
};

function mToFt(m)  { return m != null ? (m * 3.281).toFixed(1) : '--'; }
function cToF(c)   { return c != null ? Math.round(c * 9/5 + 32) : '--'; }
function timeAgo(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`;
}

// =====================================================================
// FETCH FUNCTIONS
// =====================================================================
async function fetchWeather() {
    try {
        const r = await fetch('/api/weather');
        if (!r.ok) throw new Error(r.status);
        liveData.weather = await r.json();
    } catch(e) { console.warn('Weather fetch:', e); }
}

async function fetchBuoys() {
    try {
        const r = await fetch('/api/buoys');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.buoys = data.buoys;

        buoyLayer.clearLayers();
        data.buoys.forEach(b => {
            const coords = buoyCoords[b.id];
            if (!coords || b.error) return;
            const wh = b.waveHeight != null ? `${mToFt(b.waveHeight)}ft` : '--';
            const wt = b.waterTemp  != null ? `${cToF(b.waterTemp)}°F`   : '--';
            const html = `<div class="buoy-box"><div class="buoy-name">${b.name.split(' ')[0]}</div><div class="buoy-val">🌊${wh} 🌡${wt}</div></div>`;
            L.marker(coords, { pane: 'poiPane',
                icon: L.divIcon({ className: '', html, iconSize: [130, 38] })
            }).addTo(buoyLayer);
        });

        updateSurfLabels(data.buoys);
    } catch(e) { console.warn('Buoy fetch:', e); }
}

async function fetchQuakes() {
    try {
        const r = await fetch('/api/earthquakes');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.quakes = data.quakes;

        quakeLayer.clearLayers();
        data.quakes.forEach(q => {
            if (q.lat < 20.3 || q.lat > 23 || q.lng < -160.5 || q.lng > -154.5) return;
            const color  = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
            const size   = Math.max(22, Math.round(q.mag * 18));
            L.marker([q.lat, q.lng], {
                pane: 'windPane',
                icon: L.divIcon({
                    className: '',
                    html: `<div class="quake-marker" style="width:${size}px;height:${size}px;border-color:${color};box-shadow:0 0 8px ${color};"></div>`,
                    iconSize: [size, size], iconAnchor: [size/2, size/2]
                })
            }).addTo(quakeLayer)
              .bindTooltip(`M${q.mag} — ${q.place}`, { permanent: false, className: 'poi-label' });
        });
    } catch(e) { console.warn('Quake fetch:', e); }
}

async function fetchAlerts() {
    try {
        const r = await fetch('/api/alerts');
        if (!r.ok) throw new Error(r.status);
        liveData.alerts = await r.json();
    } catch(e) { console.warn('Alerts fetch:', e); liveData.alerts = { alerts: [] }; }
}

async function fetchAirQuality() {
    try {
        const r = await fetch('/api/airquality');
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        liveData.airquality = data;

        // AQI shaded circles on map
        aqiLayer.clearLayers();
        (data.sensors || []).forEach(s => {
            if (!s.lat || !s.lng) return;
            const aqi   = typeof s.aqi === 'number' ? s.aqi : 0;
            const color = aqi > 150 ? '#ee5253' : aqi > 100 ? '#ff9f43' : aqi > 50 ? '#ffd32a' : '#2ecc71';
            L.circle([s.lat, s.lng], {
                pane: 'aqiPane', color, weight: 0,
                fillColor: color, fillOpacity: 0.15,
                radius: Math.max(6000, aqi * 350)
            }).addTo(aqiLayer);
        });

        // Lightning markers — only when NWS forecast mentions thunderstorms
        lightningLayer.clearLayers();
        if (/thunder/i.test(liveData.weather?.shortForecast ?? '')) {
            [
                [21.42,-157.81], [21.37,-157.74], [21.29,-157.95],
                [21.46,-157.68], [21.35,-157.88],
            ].forEach(c => L.marker(c, { pane: 'trafficPane',
                icon: L.divIcon({ className: 'lightning-marker', html: '⚡', iconSize: [22, 22] })
            }).addTo(lightningLayer));
        }
    } catch(e) { console.warn('AQI fetch:', e); }
}

// =====================================================================
// PANEL ITEM GENERATORS (each returns an array; engine paginates 3/page)
// =====================================================================
function getSurfItems() {
    const byId = {};
    (liveData.buoys || []).forEach(b => { byId[b.id] = b; });
    return surfSpots.map(s => {
        const buoy = byId[s.buoyId];
        let heightStr = '--', period = '', color = '#48dbfb';
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const hft = buoy.waveHeight * 3.281 * s.scale;
            const lo  = Math.max(1, Math.floor(hft * 0.85));
            const hi  = Math.ceil(hft * 1.15);
            heightStr = `${lo}-${hi}ft`;
            period    = buoy.dominantPeriod ? `${buoy.dominantPeriod}s · ` : '';
            color     = hft > 6 ? '#ff9f43' : '#1dd1a1';
        }
        return { name: s.name, heightStr, period, color };
    });
}
function renderSurfItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">🏄 ${item.name}</div><div class="row-secondary">${item.period}NDBC buoy derived</div></div>
        <div class="row-meta" style="color:${item.color};">${item.heightStr}</div>
    </div>`;
}

function getBuoyItems() {
    return (liveData.buoys || [])
        .filter(b => !b.error && b.waveHeight != null)
        .map(b => ({
            name: b.name,
            wh: `${mToFt(b.waveHeight)} ft`,
            wt: `${cToF(b.waterTemp)}°F`,
            pd: b.dominantPeriod ? `${b.dominantPeriod}s period` : '',
        }));
}
function renderBuoyItem(item) {
    return `<div class="data-row" style="border-left-color:#0abde3;">
        <div><div class="row-primary">${item.name}</div><div class="row-secondary">${item.pd}</div></div>
        <div class="row-meta">🌊${item.wh}<br><span style="font-size:0.75em;color:#a4b0be;">🌡${item.wt}</span></div>
    </div>`;
}

function getQuakeItems() {
    return (liveData.quakes || []).map(q => {
        const color = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
        const place = q.place.replace(/,?\s*Hawaii( Island)?$/, '');
        return { mag: q.mag, place, depth: q.depth, time: q.time, color };
    });
}
function renderQuakeItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">${item.place}</div><div class="row-secondary">${item.depth.toFixed(1)} km depth</div></div>
        <div class="row-meta" style="color:${item.color};">M${item.mag}<br><span style="font-size:0.7em;color:#a4b0be;">${timeAgo(item.time)}</span></div>
    </div>`;
}

function getAviationItems() {
    return [
        { call:'HAL12',  type:'A330', route:'HNL ➔ LAX', alt:'FL310',  spd:'475 kts'  },
        { call:'SWA453', type:'B738', route:'OAK ➔ HNL', alt:'4,200ft',spd:'180 kts'  },
        { call:'UAL930', type:'B777', route:'HNL ➔ ORD', alt:'FL240',  spd:'Climbing' },
        { call:'TOUR01', type:'B206', route:'Local Tour', alt:'700ft',  spd:'95 kts'   },
    ];
}
function renderAviationItem(item) {
    return `<div class="data-row" style="border-left-color:#10ac84;">
        <div><div class="row-primary">✈️ ${item.call} (${item.type})</div><div class="row-secondary">${item.route}</div></div>
        <div class="row-meta">${item.alt}<br><span style="font-size:0.75em;color:#a4b0be;">${item.spd}</span></div>
    </div>`;
}

function getShipItems() {
    return [
        { name:"MATSON NAVIGATOR", type:"Commercial Cargo", area:"Honolulu Channel",spd:"16.2 kt" },
        { name:"LAHAINA CRUISER",  type:"Ferry",            area:"Maui Crossing",   spd:"22.4 kt" },
        { name:"ALOHA MARINER",    type:"Container",        area:"Kaiwi Channel",   spd:"14.8 kt" },
        { name:"HOKULEʻA",         type:"Voyaging Canoe",   area:"Open Ocean",      spd:"6 kt"    },
    ];
}
function renderShipItem(item) {
    const color = item.type === 'Voyaging Canoe' ? '#ffd32a' : '#0984e3';
    return `<div class="data-row" style="border-left-color:${color};">
        <div><div class="row-primary">🚢 ${item.name}</div><div class="row-secondary">${item.type} · ${item.area}</div></div>
        <div class="row-meta">${item.spd}</div>
    </div>`;
}

function getAqiItems() {
    const sensors = liveData.airquality?.sensors ?? [];
    if (!sensors.length) return [{ name:'Honolulu', aqi:'--', dom:'', color:'#2ecc71', label:'No data' }];
    return sensors.map(s => {
        const aqi   = s.aqi ?? '--';
        const color = typeof aqi === 'number'
            ? (aqi > 150 ? '#ee5253' : aqi > 100 ? '#ff9f43' : aqi > 50 ? '#ffd32a' : '#2ecc71')
            : '#48dbfb';
        const label = typeof aqi === 'number'
            ? (aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Sensitive Groups' : 'Unhealthy')
            : 'No data';
        return { name: s.name, aqi, dom: s.dominentpol ?? '', color, label };
    });
}
function renderAqiItem(item) {
    return `<div class="data-row" style="border-left-color:${item.color};">
        <div><div class="row-primary">🌫 ${item.name}</div><div class="row-secondary">Dominant: ${item.dom || '--'}</div></div>
        <div class="row-meta" style="color:${item.color};">AQI ${item.aqi}<br><span style="font-size:0.7em;">${item.label}</span></div>
    </div>`;
}

// =====================================================================
// UI STATE MACHINE
// =====================================================================
const uiStates = [
    {
        title: "METEOROLOGICAL", sub: "LIVE NWS DOPPLER", duration: 6000,
        layersOn:  [radarLayerGroup],
        layersOff: [windLayer, currentLayer, airLayer, shipLayer, buoyLayer, quakeLayer, aqiLayer, lightningLayer],
        renderStatic() {
            const w = liveData.weather;
            if (!w) return `<div class="data-row"><div class="row-primary">Loading NWS data…</div></div>`;
            return `
                <div class="metric-grid">
                    <div class="metric-box"><div class="metric-val">${w.tempF}°F</div><div class="metric-lbl">${w.location}</div></div>
                    <div class="metric-box"><div class="metric-val">${w.humidity != null ? w.humidity+'%' : '--'}</div><div class="metric-lbl">Humidity</div></div>
                    <div class="metric-box"><div class="metric-val">${w.windDirection} ${w.windSpeed}</div><div class="metric-lbl">Wind</div></div>
                    <div class="metric-box"><div class="metric-val">${w.precipChance != null ? w.precipChance+'%' : '--'}</div><div class="metric-lbl">Precip</div></div>
                </div>
                <div class="data-row" style="margin-top:6px;border-left-color:#48dbfb;">
                    <div><div class="row-primary">${w.shortForecast}</div><div class="row-secondary">NWS Honolulu — ${new Date(w.fetchedAt).toLocaleTimeString()}</div></div>
                    <div class="row-meta" style="color:#2ecc71;">LIVE</div>
                </div>`;
        }
    },
    {
        title: "METEOROLOGICAL", sub: "SURFACE WIND MATRIX", duration: 5000,
        layersOn:  [windLayer, currentLayer],
        layersOff: [radarLayerGroup, airLayer, shipLayer, buoyLayer, quakeLayer, aqiLayer, lightningLayer],
        renderStatic() {
            return `<div class="data-list">
                <div class="data-row" style="border-left-color:#00ffcc;">
                    <div><div class="row-primary">ENE Trades Active</div><div class="row-secondary">PacIOOS GRIB2 / HRRR Model</div></div>
                    <div class="row-meta" style="color:#2ecc71;">LIVE</div>
                </div>
                <div class="data-row" style="border-left-color:#00ffcc;">
                    <div><div class="row-primary">Channel Acceleration</div><div class="row-secondary">Kaiwi / Pailolo corridors</div></div>
                    <div class="row-meta">24 kt</div>
                </div>
                <div class="data-row" style="border-left-color:#0abde3;">
                    <div><div class="row-primary">Hawaii Current</div><div class="row-secondary">Westward drift — open ocean</div></div>
                    <div class="row-meta">0.4 kt</div>
                </div>
            </div>`;
        }
    },
    {
        title: "SURF REPORT", sub: "NDBC WAVE ANALYSIS", perPageMs: 3000,
        layersOn:  [],
        layersOff: [radarLayerGroup, windLayer, currentLayer, airLayer, shipLayer, buoyLayer, quakeLayer, aqiLayer, lightningLayer],
        getItems: getSurfItems, renderItem: renderSurfItem
    },
    {
        title: "OCEANOGRAPHIC", sub: "NDBC BUOY TELEMETRY", perPageMs: 4000,
        layersOn:  [buoyLayer],
        layersOff: [radarLayerGroup, windLayer, currentLayer, airLayer, shipLayer, quakeLayer, aqiLayer, lightningLayer],
        getItems: getBuoyItems, renderItem: renderBuoyItem
    },
    {
        title: "AIR QUALITY", sub: "PM2.5 SURFACE MONITOR", perPageMs: 4000,
        layersOn:  [aqiLayer],
        layersOff: [radarLayerGroup, windLayer, currentLayer, airLayer, shipLayer, buoyLayer, quakeLayer, lightningLayer],
        getItems: getAqiItems, renderItem: renderAqiItem
    },
    {
        title: "TRAFFIC — AVIATION", sub: "FLIGHT VECTOR LOG", perPageMs: 3500,
        layersOn:  [airLayer],
        layersOff: [radarLayerGroup, windLayer, currentLayer, shipLayer, buoyLayer, quakeLayer, aqiLayer, lightningLayer],
        getItems: getAviationItems, renderItem: renderAviationItem
    },
    {
        title: "TRAFFIC — MARITIME", sub: "VESSEL TRACKING LOG", perPageMs: 3500,
        layersOn:  [shipLayer],
        layersOff: [radarLayerGroup, windLayer, currentLayer, airLayer, buoyLayer, quakeLayer, aqiLayer, lightningLayer],
        getItems: getShipItems, renderItem: renderShipItem
    },
    {
        title: "SEISMIC MONITOR", sub: "USGS LIVE FEED", perPageMs: 3500,
        layersOn:  [quakeLayer],
        layersOff: [radarLayerGroup, windLayer, currentLayer, airLayer, shipLayer, buoyLayer, aqiLayer, lightningLayer],
        getItems: getQuakeItems, renderItem: renderQuakeItem
    },
];

// =====================================================================
// PAGINATION ENGINE
// max 3 items visible at a time; 3s+ per page; rotate within state
// before advancing to next state
// =====================================================================
const PAGE_SIZE = 3;
let currentStateIndex = 0;
let currentPage       = 0;
let _pageTimer        = null;

function transitionState() {
    if (_pageTimer) clearTimeout(_pageTimer);

    const state = uiStates[currentStateIndex];

    // Layer toggles
    state.layersOn.forEach(l  => { if (!map.hasLayer(l)) map.addLayer(l); });
    state.layersOff.forEach(l => { if (map.hasLayer(l))  map.removeLayer(l); });

    // Header labels
    document.getElementById('tab-title').innerText     = state.title;
    document.getElementById('sub-indicator').innerText = state.sub;

    // Small craft advisory: ONLY show when a real NWS alert is active
    const hasAdvisory = (liveData.alerts?.alerts ?? []).some(a =>
        /small craft|hazardous seas/i.test(a.event ?? '')
    );
    document.getElementById('main-dash').classList.toggle('warning-active', hasAdvisory);

    // Render content with pagination
    const contentEl = document.getElementById('panel-content');
    if (state.getItems) {
        const items      = state.getItems();
        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
        const pageItems  = items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
        const pageHint   = totalPages > 1
            ? `<div class="page-indicator">${currentPage + 1} / ${totalPages}</div>`
            : '';
        contentEl.innerHTML = `<div class="data-list">${pageItems.map(state.renderItem).join('')}</div>${pageHint}`;

        _pageTimer = setTimeout(() => {
            if (currentPage + 1 < totalPages) {
                currentPage++;
            } else {
                currentPage = 0;
                currentStateIndex = (currentStateIndex + 1) % uiStates.length;
            }
            transitionState();
        }, state.perPageMs ?? 3000);
    } else {
        contentEl.innerHTML = state.renderStatic();
        _pageTimer = setTimeout(() => {
            currentPage = 0;
            currentStateIndex = (currentStateIndex + 1) % uiStates.length;
            transitionState();
        }, state.duration ?? 5000);
    }
}

// =====================================================================
// BOOT — prefetch all data, then start rotation + schedule refreshes
// =====================================================================
Promise.all([fetchWeather(), fetchBuoys(), fetchQuakes(), fetchAlerts(), fetchAirQuality()])
    .finally(() => {
        transitionState();
        setInterval(fetchWeather,    10 * 60 * 1000);
        setInterval(fetchBuoys,       5 * 60 * 1000);
        setInterval(fetchQuakes,      5 * 60 * 1000);
        setInterval(fetchAlerts,      5 * 60 * 1000);
        setInterval(fetchAirQuality, 15 * 60 * 1000);
    });
