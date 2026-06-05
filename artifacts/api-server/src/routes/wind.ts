import { Router } from "express";

const router = Router();

// Key monitoring points across the Oahu/Molokai operating area
const POINTS = [
  { name: "Honolulu",       lat: 21.30, lng: -157.85 },
  { name: "Kailua Bay",     lat: 21.40, lng: -157.74 },
  { name: "North Shore",    lat: 21.63, lng: -158.07 },
  { name: "Makaha",         lat: 21.47, lng: -158.21 },
  { name: "Koko Head",      lat: 21.27, lng: -157.70 },
  { name: "Kaiwi Channel",  lat: 21.18, lng: -157.65 },
  { name: "Open Ocean SW",  lat: 20.92, lng: -157.90 },
  { name: "Open Ocean SE",  lat: 20.88, lng: -157.20 },
  { name: "Molokai",        lat: 21.10, lng: -157.02 },
  { name: "North Channel",  lat: 21.70, lng: -158.05 },
  { name: "Deep South",     lat: 20.82, lng: -157.55 },
  { name: "East Kaiwi",     lat: 21.15, lng: -157.42 },
];

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 30 * 60 * 1000; // 30 min — Open-Meteo updates hourly

// Wind FROM direction → map arrow (arrow points the way the air is going)
function dirToArrow(fromDeg: number): string {
  const toDeg = (fromDeg + 180) % 360;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return arrows[Math.round(toDeg / 45) % 8];
}

router.get("/wind", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const lats = POINTS.map((p) => p.lat).join(",");
    const lngs = POINTS.map((p) => p.lng).join(",");
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lats}&longitude=${lngs}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&timezone=Pacific/Honolulu`;

    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);

    const json = (await r.json()) as Array<{
      latitude: number;
      longitude: number;
      current: { wind_speed_10m: number; wind_direction_10m: number };
    }>;

    const arr = Array.isArray(json) ? json : [json];
    const points = arr.map((loc, i) => ({
      name:      POINTS[i]?.name ?? `Point ${i}`,
      lat:       loc.latitude,
      lng:       loc.longitude,
      speedKt:   Math.round(loc.current.wind_speed_10m),
      direction: Math.round(loc.current.wind_direction_10m),
      arrow:     dirToArrow(loc.current.wind_direction_10m),
    }));

    const data = { points, fetchedAt: Date.now(), source: "open-meteo" };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.warn({ err }, "Wind fetch failed — using ENE trade-wind fallback");
    // Typical Hawaii ENE trades at ~16 kt
    const data = {
      points: POINTS.map((p) => ({
        ...p, speedKt: 16, direction: 70, arrow: "↙",
      })),
      fetchedAt: Date.now(),
      source: "fallback",
    };
    res.json(data);
  }
});

export default router;
