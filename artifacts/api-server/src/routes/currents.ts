import { Router } from "express";

const router = Router();

// Ocean surface currents from the Open-Meteo Marine model (keyless, global).
// Returns model-derived current speed + direction at a spread of offshore
// points around Oahu / the inter-island channels. Cached server-side because
// the marine model only updates a few times per day.
const POINTS = [
  { name: "North Shore", lat: 21.72, lng: -158.1 },
  { name: "Kaena Point", lat: 21.55, lng: -158.3 },
  { name: "South Oahu", lat: 21.15, lng: -157.88 },
  { name: "Kaiwi Channel", lat: 21.12, lng: -157.65 },
  { name: "Penguin Bank", lat: 20.95, lng: -157.3 },
  { name: "Pailolo Channel", lat: 21.05, lng: -156.95 },
];

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
// ocean_current_direction = the compass heading the current flows TOWARD.
function arrowFor(dirDeg: number): string {
  return ARROWS[Math.round(((dirDeg % 360) / 45)) % 8];
}

type MarineCurrent = {
  current?: {
    ocean_current_velocity?: number; // km/h
    ocean_current_direction?: number; // deg (toward)
    sea_level_height_msl?: number; // m
  };
};

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

async function fetchPoint(p: (typeof POINTS)[number]) {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat}&longitude=${p.lng}` +
    `&current=ocean_current_velocity,ocean_current_direction,sea_level_height_msl&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo marine ${r.status}`);
  const j = (await r.json()) as MarineCurrent;
  const c = j.current ?? {};
  const kmh = c.ocean_current_velocity ?? null;
  const dir = c.ocean_current_direction ?? null;
  const kt = kmh != null ? Math.round(kmh * 0.539957 * 10) / 10 : null;
  return {
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    speedKt: kt,
    dirDeg: dir,
    arrow: dir != null ? arrowFor(dir) : "·",
    seaLevelM: c.sea_level_height_msl ?? null,
  };
}

router.get("/currents", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const results = await Promise.allSettled(POINTS.map(fetchPoint));
    const points = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof fetchPoint>>> => r.status === "fulfilled")
      .map((r) => r.value);

    const withSpeed = points.filter((p) => p.speedKt != null);
    const avgKt = withSpeed.length
      ? Math.round((withSpeed.reduce((s, p) => s + (p.speedKt as number), 0) / withSpeed.length) * 10) / 10
      : null;

    const data = { points, avgKt, source: "Open-Meteo Marine model", fetchedAt: Date.now() };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch ocean currents");
    res.status(502).json({ error: "Failed to fetch ocean currents", points: [] });
  }
});

export default router;
