// --- IMMUTABLE STATIC CANVAS LOCK ---
const bounds = [
    [20.80, -158.45],
    [21.75, -156.45]
];

var map = L.map('map', { 
    zoomControl: false, 
    interactive: false, 
    attributionControl: false,
    minZoom: 10,
    maxZoom: 10, 
    maxBounds: bounds, 
    maxBoundsViscosity: 1.0 
}).setView([21.265, -157.785], 10);

// --- STRICT Z-INDEX HIERARCHY ---
map.createPane('depthPane');    map.getPane('depthPane').style.zIndex = 200;
map.createPane('windPane');     map.getPane('windPane').style.zIndex = 300;
map.createPane('radarPane');    map.getPane('radarPane').style.zIndex = 350; map.getPane('radarPane').style.opacity = 0.65;
map.createPane('currentPane');  map.getPane('currentPane').style.zIndex = 400;
map.createPane('trafficPane');  map.getPane('trafficPane').style.zIndex = 500;
map.createPane('surfPane');     map.getPane('surfPane').style.zIndex = 550;
map.createPane('poiPane');      map.getPane('poiPane').style.zIndex = 600;

// --- MAP TILES ---
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 13 }).addTo(map);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, className: 'blend-multiply' }).addTo(map);

// --- LAYER GROUPS ---
// depthLayer and surfLayer are PERMANENT — always visible regardless of panel state
var depthLayer    = L.layerGroup().addTo(map);
var surfLayer     = L.layerGroup().addTo(map);  // permanent surf spot labels
var staticPoiLayer = L.layerGroup().addTo(map);
// These toggle with panels:
var radarLayer    = L.tileLayer('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png', { pane: 'radarPane' });
var windLayer     = L.layerGroup();
var currentLayer  = L.layerGroup();
var trafficLayer  = L.layerGroup();
var buoyLayer     = L.layerGroup();
var quakeLayer    = L.layerGroup();

// --- SEEDED RANDOM NUMBER GENERATOR ---
// Using a fixed seed so depth numbers are consistent across page loads
function makeSeededRng(seed) {
    let s = seed >>> 0;
    return function() {
        s = Math.imul(1664525, s) + 1013904223 >>> 0;
        return s / 0xFFFFFFFF;
    };
}
const rng = makeSeededRng(0xABCDEF42);

// --- 1. BATHYMETRY: CURATED COASTAL DEPTHS (always correct) ---
const curatedDepths = [
    // Kaneohe Bay & Kailua
    { c: [21.46, -157.82], d: "14" }, { c: [21.43, -157.78], d: "45" }, { c: [21.41, -157.73], d: "35" },
    { c: [21.38, -157.75], d: "28" }, { c: [21.44, -157.80], d: "20" }, { c: [21.50, -157.86], d: "12" },
    // Pearl Harbor Approach & South Shore
    { c: [21.30, -157.98], d: "15" }, { c: [21.26, -157.94], d: "65" }, { c: [21.260, -157.845], d: "18" },
    { c: [21.242, -157.820], d: "65" }, { c: [21.230, -157.720], d: "210" }, { c: [21.215, -157.860], d: "30" },
    { c: [21.245, -157.900], d: "48" }, { c: [21.270, -157.950], d: "32" },
    // Waianae Coast
    { c: [21.43, -158.22], d: "75" }, { c: [21.33, -158.15], d: "85" }, { c: [21.28, -158.13], d: "120" },
    { c: [21.38, -158.20], d: "95" }, { c: [21.23, -158.10], d: "140" }, { c: [21.48, -158.25], d: "60" },
    // North Shore / Haleiwa
    { c: [21.62, -158.13], d: "80" }, { c: [21.64, -158.07], d: "45" }, { c: [21.68, -158.05], d: "110" },
    { c: [21.66, -158.10], d: "62" }, { c: [21.70, -158.03], d: "90" }, { c: [21.60, -158.05], d: "55" },
    { c: [21.72, -158.08], d: "130" }, { c: [21.58, -157.98], d: "72" },
    // Molokai South Shore Reef
    { c: [21.07, -157.20], d: "22" }, { c: [21.06, -157.10], d: "18" }, { c: [21.06, -156.90], d: "25" },
    { c: [21.05, -157.28], d: "65" }, { c: [21.03, -157.15], d: "90" }, { c: [21.08, -157.00], d: "35" },
    { c: [21.07, -156.95], d: "28" }, { c: [21.09, -157.25], d: "42" },
    // Molokai Halawa & North
    { c: [21.160, -156.710], d: "85" }, { c: [21.180, -156.750], d: "120" }, { c: [21.200, -156.800], d: "240" },
    { c: [21.170, -156.730], d: "105" }, { c: [21.190, -156.770], d: "180" },
    // Deep channel slopes
    { c: [21.185, -157.840], d: "510" }, { c: [21.225, -157.695], d: "310" }, { c: [21.190, -157.640], d: "590" },
    { c: [21.200, -157.750], d: "420" }, { c: [21.210, -157.680], d: "380" },
    { c: [20.950, -157.250], d: "55" }, { c: [20.900, -157.300], d: "62" }, { c: [21.000, -157.150], d: "95" },
    { c: [20.970, -157.180], d: "78" }, { c: [20.920, -157.270], d: "68" }
];
curatedDepths.forEach(s => {
    L.marker(s.c, { pane: 'depthPane', icon: L.divIcon({ className: 'depth-label', html: s.d, iconSize: [40, 15] }) }).addTo(depthLayer);
});

// --- BATHYMETRY: HIGH-DENSITY ABYSSAL SCATTER (seeded = consistent) ---
function inCuratedZone(lat, lng) {
    return (lat > 20.95 && lat < 21.75 && lng > -158.3 && lng < -156.6);
}
// Increased density: step 0.07 lat / 0.10 lng (was 0.12 / 0.18)
for (let lat = bounds[0][0]; lat <= bounds[1][0]; lat += 0.07) {
    for (let lng = bounds[0][1]; lng <= bounds[1][1]; lng += 0.10) {
        if (!inCuratedZone(lat, lng)) {
            let jLat = lat + (rng() - 0.5) * 0.04;
            let jLng = lng + (rng() - 0.5) * 0.06;
            let depth = 1100 + Math.floor(Math.abs(21.26 - jLat) * 1300) + Math.floor(Math.abs(-157.78 - jLng) * 1100);
            // Add small variation via seeded rng
            depth += Math.floor((rng() - 0.5) * 200);
            L.marker([jLat, jLng], {
                pane: 'depthPane',
                icon: L.divIcon({ className: 'depth-label', html: depth.toString(), iconSize: [40, 15] })
            }).addTo(depthLayer);
        }
    }
}

// --- 2. FIXED NOAA STATION LABELS (always visible) ---
const staticPois = [
    { c: [21.211, -157.694], n: "⚓ NOAA 51211 (Koko Head)" },
    { c: [21.414, -157.678], n: "⚓ NOAA 51202 (Mokapu)" },
    { c: [21.127, -158.040], n: "⚓ NOAA 51212 (Barbers Pt)" },
    { c: [21.673, -158.112], n: "⚓ NOAA 51201 (Waimea)" }
];
staticPois.forEach(b => {
    L.marker(b.c, { pane: 'poiPane', icon: L.divIcon({ className: 'poi-label', html: b.n, iconSize: [150, 20] }) }).addTo(staticPoiLayer);
});

// --- 3. SURF SPOTS — permanent on map, heights updated from live buoy data ---
// Each spot has a "source" buoy that feeds its wave height estimate
const surfSpots = [
    { c: [21.665, -158.052], name: "Pipeline",  buoyId: "51201", scale: 1.05 },
    { c: [21.642, -158.068], name: "Waimea",    buoyId: "51201", scale: 0.95 },
    { c: [21.580, -158.020], name: "Sunset",    buoyId: "51201", scale: 0.90 },
    { c: [21.472, -158.228], name: "Makaha",    buoyId: "51212", scale: 0.85 },
    { c: [21.270, -157.832], name: "Waikiki",   buoyId: "51211", scale: 0.70 },
    { c: [21.287, -157.667], name: "Sandy's",   buoyId: "51211", scale: 0.90 },
    { c: [21.190, -157.252], name: "Kepuhi",    buoyId: "51202", scale: 0.80 },
    { c: [21.165, -156.717], name: "Halawa",    buoyId: "51202", scale: 0.75 }
];

// Store marker references so we can update labels when buoy data arrives
var surfMarkers = [];
surfSpots.forEach(s => {
    const icon = L.divIcon({ className: 'surf-label', html: `🏄 ${s.name}: --`, iconSize: [130, 22] });
    const marker = L.marker(s.c, { pane: 'surfPane', icon }).addTo(surfLayer);
    surfMarkers.push({ marker, spot: s });
});

function updateSurfLabels(buoys) {
    if (!buoys) return;
    const byId = {};
    buoys.forEach(b => { byId[b.id] = b; });
    surfMarkers.forEach(({ marker, spot }) => {
        const buoy = byId[spot.buoyId];
        let label;
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const heightFt = buoy.waveHeight * 3.281 * spot.scale;
            const low = Math.max(1, Math.floor(heightFt * 0.85));
            const high = Math.ceil(heightFt * 1.15);
            label = `🏄 ${spot.name}: ${low}-${high}ft`;
        } else {
            label = `🏄 ${spot.name}: --`;
        }
        marker.setIcon(L.divIcon({ className: 'surf-label', html: label, iconSize: [140, 22] }));
    });
}

// --- 4. WIND VECTORS ---
for (let lat = bounds[0][0]; lat <= bounds[1][0]; lat += 0.06) {
    for (let lng = bounds[0][1]; lng <= bounds[1][1]; lng += 0.08) {
        let oahuLand    = (lat > 21.22 && lat < 21.72 && lng > -158.3 && lng < -157.62);
        let molokaiCoast = (lat > 21.03 && lat < 21.22 && lng > -157.32 && lng < -156.66);
        if (!oahuLand && !molokaiCoast) {
            let dir = '↙'; let spd = 18;
            if (lng < -158.0 && lat < 21.6 && lat > 21.2) { dir = '↖'; spd = Math.floor(rng() * 4) + 2; }
            if (lng > -157.7 && lng < -157.4 && lat > 21.1 && lat < 21.3) { spd = 24; }
            let html = `${dir}<br><span style="font-size:10px; color:#00ffcc;">${spd}</span>`;
            L.marker([lat, lng], { pane: 'windPane', icon: L.divIcon({ className: 'vector-arrow', html, iconSize: [30, 30] }) }).addTo(windLayer);
        }
    }
}

const currentData = [
    { c: [21.55, -157.30], d: '↙' }, { c: [21.65, -157.85], d: '↙' },
    { c: [21.24, -157.62], d: '↙' }, { c: [21.18, -157.65], d: '↙' },
    { c: [21.20, -157.75], d: '↙' }, { c: [21.10, -157.88], d: '⬅' },
    { c: [21.40, -157.60], d: '↙' }, { c: [21.25, -158.15], d: '↖' },
    { c: [20.95, -157.50], d: '⬅' }, { c: [20.85, -157.10], d: '⬅' }
];
currentData.forEach(pt => {
    L.marker(pt.c, { pane: 'currentPane', icon: L.divIcon({ className: 'current-arrow', html: pt.d, iconSize: [20, 20] }) }).addTo(currentLayer);
});

// --- 5. AIR & MARITIME TRAFFIC ---
const airTraffic = [
    { c: [21.320, -157.860], text: "✈️ HAL12 FL310" },
    { c: [21.255, -157.710], text: "✈️ SWA453 4.2k" },
    { c: [21.130, -157.480], text: "✈️ UAL930 FL240" },
    { c: [21.180, -156.920], text: "🚁 TOUR01 700ft" }
];
const shipTraffic = [
    { c: [21.228, -157.800], text: "🚢 MATSON NAVIGATOR" },
    { c: [21.020, -157.150], text: "🚢 LAHAINA CRUISER" },
    { c: [21.340, -158.050], text: "🚢 ALOHA MARINER" },
    { c: [21.150, -157.550], text: "⛵ HOKULEʻA" }
];
const airLayer  = L.layerGroup();
const shipLayer = L.layerGroup();

airTraffic.forEach(t => {
    L.marker(t.c, { pane: 'trafficPane', icon: L.divIcon({ className: 'traffic-label traffic-label-air', html: t.text, iconSize: [160, 20] }) }).addTo(airLayer);
});
shipTraffic.forEach(t => {
    L.marker(t.c, { pane: 'trafficPane', icon: L.divIcon({ className: 'traffic-label traffic-label-ship', html: t.text, iconSize: [180, 20] }) }).addTo(shipLayer);
});

// --- LIVE DATA STORE ---
var liveData = { weather: null, buoys: null, quakes: null };

// Buoy map marker coords
const buoyCoords = {
    '51201': [21.673, -158.112],
    '51211': [21.211, -157.694],
    '51212': [21.127, -158.040],
    '51202': [21.414, -157.678]
};

// --- HELPERS ---
function mToFt(m)       { return m != null ? (m * 3.281).toFixed(1) : '--'; }
function cToF(c)        { return c != null ? Math.round(c * 9/5 + 32) : '--'; }
function timeAgo(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`;
}

// --- LIVE FETCH FUNCTIONS ---
async function fetchWeather() {
    try {
        const res = await fetch('/api/weather');
        if (!res.ok) throw new Error(res.status);
        liveData.weather = await res.json();
    } catch(e) { console.warn('Weather fetch failed:', e); }
}

async function fetchBuoys() {
    try {
        const res = await fetch('/api/buoys');
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        liveData.buoys = data.buoys;

        // Update buoy HUD markers on map
        buoyLayer.clearLayers();
        data.buoys.forEach(b => {
            const coords = buoyCoords[b.id];
            if (!coords || b.error) return;
            const wh = b.waveHeight != null ? `${mToFt(b.waveHeight)}ft` : '--';
            const wt = b.waterTemp  != null ? `${cToF(b.waterTemp)}°F` : '--';
            const html = `<div class="buoy-box"><div class="buoy-name">${b.name.split(' ')[0]}</div><div class="buoy-val">🌊${wh} 🌡${wt}</div></div>`;
            L.marker(coords, { pane: 'poiPane', icon: L.divIcon({ className: '', html, iconSize: [130, 38] }) }).addTo(buoyLayer);
        });

        // Update surf labels from buoy data
        updateSurfLabels(data.buoys);
    } catch(e) { console.warn('Buoy fetch failed:', e); }
}

async function fetchQuakes() {
    try {
        const res = await fetch('/api/earthquakes');
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        liveData.quakes = data.quakes;

        quakeLayer.clearLayers();
        data.quakes.forEach(q => {
            if (q.lat < 18 || q.lat > 23) return;
            const color  = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
            const radius = Math.max(3000, q.mag * 4000);
            L.circle([q.lat, q.lng], { pane: 'windPane', color, weight: 1, fillColor: color, fillOpacity: 0.25, radius })
             .addTo(quakeLayer)
             .bindTooltip(`M${q.mag} — ${q.place}`, { permanent: false, className: 'poi-label' });
        });
    } catch(e) { console.warn('Quake fetch failed:', e); }
}

// --- PANEL RENDERERS ---
function renderWeatherPanel() {
    const w = liveData.weather;
    if (!w) return `<div class="data-row"><div class="row-primary">Loading NWS data…</div></div>`;
    return `
        <div class="metric-grid">
            <div class="metric-box"><div class="metric-val">${w.tempF}°F</div><div class="metric-lbl">${w.location}</div></div>
            <div class="metric-box"><div class="metric-val">${w.humidity != null ? w.humidity+'%' : '--'}</div><div class="metric-lbl">Humidity</div></div>
            <div class="metric-box"><div class="metric-val">${w.windDirection} ${w.windSpeed}</div><div class="metric-lbl">Wind</div></div>
            <div class="metric-box"><div class="metric-val">${w.precipChance != null ? w.precipChance+'%' : '--'}</div><div class="metric-lbl">Precip</div></div>
        </div>
        <div class="data-row" style="margin-top:6px; border-left-color:#48dbfb;">
            <div><div class="row-primary">${w.shortForecast}</div><div class="row-secondary">NWS Honolulu — Updated ${new Date(w.fetchedAt).toLocaleTimeString()}</div></div>
            <div class="row-meta" style="color:#2ecc71;">LIVE</div>
        </div>`;
}

function renderSurfPanel() {
    const buoys = liveData.buoys;
    const byId  = {};
    if (buoys) buoys.forEach(b => { byId[b.id] = b; });

    const rows = surfSpots.slice(0, 5).map(s => {
        const buoy = byId[s.buoyId];
        let heightStr = '--';
        let period = '';
        if (buoy && !buoy.error && buoy.waveHeight != null) {
            const hft = buoy.waveHeight * 3.281 * s.scale;
            const lo = Math.max(1, Math.floor(hft * 0.85));
            const hi = Math.ceil(hft * 1.15);
            heightStr = `${lo}-${hi}ft`;
            period = buoy.dominantPeriod ? `${buoy.dominantPeriod}s` : '';
        }
        const color = heightStr === '--' ? '#48dbfb' : parseFloat(heightStr) > 5 ? '#ff9f43' : '#1dd1a1';
        return `<div class="data-row" style="border-left-color:${color};">
            <div><div class="row-primary">🏄 ${s.name}</div><div class="row-secondary">${period ? period+' period' : 'NDBC derived'}</div></div>
            <div class="row-meta" style="color:${color};">${heightStr}</div>
        </div>`;
    }).join('');
    return `<div class="data-list">${rows}</div>`;
}

function renderBuoyPanel() {
    const buoys = liveData.buoys;
    if (!buoys) return `<div class="data-row"><div class="row-primary">Loading NDBC data…</div></div>`;
    const rows = buoys.filter(b => !b.error).map(b => {
        const wh = b.waveHeight != null ? `${mToFt(b.waveHeight)} ft` : '--';
        const wt = b.waterTemp  != null ? `${cToF(b.waterTemp)}°F`   : '--';
        const pd = b.dominantPeriod != null ? `${b.dominantPeriod}s period` : '';
        return `<div class="data-row" style="border-left-color:#0abde3;">
            <div><div class="row-primary">${b.name}</div><div class="row-secondary">${pd}</div></div>
            <div class="row-meta">🌊${wh}<br><span style="font-size:0.75em;color:#a4b0be;">🌡${wt}</span></div>
        </div>`;
    }).join('');
    return `<div class="data-list">${rows || '<div class="data-row"><div class="row-primary">No buoy data</div></div>'}</div>`;
}

function renderQuakePanel() {
    const quakes = liveData.quakes;
    if (!quakes) return `<div class="data-row"><div class="row-primary">Loading USGS data…</div></div>`;
    const recent = quakes.slice(0, 4);
    if (!recent.length) return `<div class="data-row"><div class="row-primary">No recent seismic activity</div></div>`;
    return `<div class="data-list">${recent.map(q => {
        const color = q.mag >= 3 ? '#ee5253' : q.mag >= 2 ? '#ff9f43' : '#ffd32a';
        const place = q.place.replace(/, Hawaii( Island)?$/, '');
        return `<div class="data-row" style="border-left-color:${color};">
            <div><div class="row-primary">${place}</div><div class="row-secondary">${q.depth.toFixed(1)} km depth</div></div>
            <div class="row-meta" style="color:${color};">M${q.mag}<br><span style="font-size:0.7em;color:#a4b0be;">${timeAgo(q.time)}</span></div>
        </div>`;
    }).join('')}</div>`;
}

// --- AUTOMATED STATE ROTATION ENGINE ---
const uiStates = [
    {
        title: "METEOROLOGICAL", sub: "LIVE NWS DOPPLER", duration: 6000,
        layersOn:  [radarLayer],
        layersOff: [windLayer, airLayer, shipLayer, buoyLayer, quakeLayer],
        warn: false,
        html: () => renderWeatherPanel()
    },
    {
        title: "METEOROLOGICAL", sub: "SURFACE WIND MATRIX", duration: 5000,
        layersOn:  [windLayer],
        layersOff: [radarLayer, airLayer, shipLayer, buoyLayer, quakeLayer],
        warn: false,
        html: () => `<div class="data-list">
            <div class="data-row">
                <div><div class="row-primary">PacIOOS GRIB2 / HRRR Model</div><div class="row-secondary">ENE Trades — Channel Acceleration Active</div></div>
                <div class="row-meta" style="color:#2ecc71;">LIVE</div>
            </div>
        </div>`
    },
    {
        title: "SURF REPORT", sub: "NDBC WAVE ANALYSIS", duration: 7000,
        layersOn:  [],
        layersOff: [radarLayer, windLayer, airLayer, shipLayer, buoyLayer, quakeLayer],
        warn: false,
        html: () => renderSurfPanel()
    },
    {
        title: "OCEANOGRAPHIC", sub: "NDBC BUOY TELEMETRY", duration: 7000,
        layersOn:  [buoyLayer],
        layersOff: [radarLayer, windLayer, airLayer, shipLayer, quakeLayer],
        warn: false,
        html: () => renderBuoyPanel()
    },
    {
        title: "TRAFFIC — AVIATION", sub: "FLIGHT VECTOR LOG", duration: 4000,
        layersOn:  [airLayer],
        layersOff: [radarLayer, windLayer, shipLayer, buoyLayer, quakeLayer],
        warn: false,
        html: () => `<div class="data-list">
            <div class="data-row" style="border-left-color:#10ac84;">
                <div><div class="row-primary">HAL12 (A330)</div><div class="row-secondary">HNL ➔ LAX</div></div>
                <div class="row-meta">FL310<br><span style="font-size:0.75em;color:#a4b0be;">475 kts</span></div>
            </div>
            <div class="data-row" style="border-left-color:#10ac84;">
                <div><div class="row-primary">SWA453 (B738)</div><div class="row-secondary">OAK ➔ HNL</div></div>
                <div class="row-meta">4,200ft<br><span style="font-size:0.75em;color:#a4b0be;">180 kts</span></div>
            </div>
            <div class="data-row" style="border-left-color:#10ac84;">
                <div><div class="row-primary">UAL930 (B777)</div><div class="row-secondary">HNL ➔ ORD</div></div>
                <div class="row-meta">FL240<br><span style="font-size:0.75em;color:#a4b0be;">Climbing</span></div>
            </div>
        </div>`
    },
    {
        title: "TRAFFIC — MARITIME", sub: "VESSEL TRACKING LOG", duration: 4000,
        layersOn:  [shipLayer],
        layersOff: [radarLayer, windLayer, airLayer, buoyLayer, quakeLayer],
        warn: false,
        html: () => `<div class="data-list">
            <div class="data-row" style="border-left-color:#0984e3;">
                <div><div class="row-primary">MATSON NAVIGATOR</div><div class="row-secondary">Commercial Cargo · Honolulu Channel</div></div>
                <div class="row-meta">16.2 kt</div>
            </div>
            <div class="data-row" style="border-left-color:#0984e3;">
                <div><div class="row-primary">LAHAINA CRUISER</div><div class="row-secondary">Ferry · Maui Crossing</div></div>
                <div class="row-meta">22.4 kt</div>
            </div>
            <div class="data-row" style="border-left-color:#0984e3;">
                <div><div class="row-primary">ALOHA MARINER</div><div class="row-secondary">Container · Kaiwi Channel</div></div>
                <div class="row-meta">14.8 kt</div>
            </div>
            <div class="data-row" style="border-left-color:#ffd32a;">
                <div><div class="row-primary">HOKULEʻA</div><div class="row-secondary">Traditional Voyaging Canoe</div></div>
                <div class="row-meta">6 kt</div>
            </div>
        </div>`
    },
    {
        title: "SEISMIC MONITOR", sub: "USGS LIVE FEED", duration: 7000,
        layersOn:  [quakeLayer],
        layersOff: [radarLayer, windLayer, airLayer, shipLayer, buoyLayer],
        warn: false,
        html: () => renderQuakePanel()
    }
];

let currentStateIndex = 0;

function transitionState() {
    const state = uiStates[currentStateIndex];

    document.getElementById('tab-title').innerText    = state.title;
    document.getElementById('sub-indicator').innerText = state.sub;
    document.getElementById('panel-content').innerHTML = typeof state.html === 'function' ? state.html() : state.html;

    const dash = document.getElementById('main-dash');
    if (state.warn) dash.classList.add('warning-active');
    else            dash.classList.remove('warning-active');

    state.layersOn.forEach(l  => { if (!map.hasLayer(l)) map.addLayer(l); });
    state.layersOff.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });

    setTimeout(() => {
        currentStateIndex = (currentStateIndex + 1) % uiStates.length;
        transitionState();
    }, state.duration);
}

// Pre-fetch all live data, then start rotation
Promise.all([fetchWeather(), fetchBuoys(), fetchQuakes()]).finally(() => {
    transitionState();
    setInterval(fetchWeather, 10 * 60 * 1000);
    setInterval(fetchBuoys,    5 * 60 * 1000);
    setInterval(fetchQuakes,   5 * 60 * 1000);
});
