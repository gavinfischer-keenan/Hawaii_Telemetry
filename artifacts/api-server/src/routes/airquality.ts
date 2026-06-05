import { Router } from "express";

const router = Router();

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 15 * 60 * 1000;

// WAQI "demo" token — publicly documented for single-station queries
// Honolulu station feed
const STATIONS = [
  { name: "Honolulu", url: "https://api.waqi.info/feed/honolulu/?token=demo" },
];

router.get("/airquality", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const results = await Promise.allSettled(
      STATIONS.map(async (s) => {
        const r = await fetch(s.url, {
          headers: { "User-Agent": "HonoluluCommandCenter/1.0" },
        });
        if (!r.ok) throw new Error(`WAQI ${r.status}`);
        const json = (await r.json()) as {
          status: string;
          data: {
            aqi: number;
            city: { name: string; geo: [number, number] };
            iaqi: {
              pm25?: { v: number };
              pm10?: { v: number };
              o3?: { v: number };
              co?: { v: number };
              no2?: { v: number };
            };
            dominentpol: string;
            time: { s: string };
          };
        };
        if (json.status !== "ok") throw new Error("WAQI not ok");
        const d = json.data;
        return {
          name: s.name,
          lat: d.city.geo[0],
          lng: d.city.geo[1],
          aqi: d.aqi,
          pm25: d.iaqi?.pm25?.v ?? null,
          pm10: d.iaqi?.pm10?.v ?? null,
          o3: d.iaqi?.o3?.v ?? null,
          dominentpol: d.dominentpol,
          updatedAt: d.time.s,
        };
      }),
    );

    const sensors = results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled")
      .map((r) => r.value);

    const data = { sensors, fetchedAt: Date.now() };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch air quality");
    res.status(502).json({ error: "Failed to fetch AQI", sensors: [] });
  }
});

export default router;
