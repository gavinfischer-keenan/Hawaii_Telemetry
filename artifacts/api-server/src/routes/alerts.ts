import { Router } from "express";

const router = Router();

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

router.get("/alerts", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    // Fetch all active NWS alerts for Hawaii
    const r = await fetch("https://api.weather.gov/alerts/active?area=HI", {
      headers: { "User-Agent": "HonoluluCommandCenter/1.0 (contact@example.com)" },
    });
    if (!r.ok) throw new Error(`NWS alerts ${r.status}`);

    const json = (await r.json()) as {
      features: Array<{
        properties: {
          event: string;
          severity: string;
          headline: string;
          description: string;
          effective: string;
          expires: string;
          areaDesc: string;
        };
      }>;
    };

    const alerts = json.features.map((f) => ({
      event: f.properties.event,
      severity: f.properties.severity,
      headline: f.properties.headline,
      areaDesc: f.properties.areaDesc,
      effective: f.properties.effective,
      expires: f.properties.expires,
    }));

    const data = { alerts, fetchedAt: Date.now() };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch NWS alerts");
    res.status(502).json({ error: "Failed to fetch alerts", alerts: [] });
  }
});

export default router;
