import { Router } from "express";

const router = Router();

// OpenSky Network — free, no API key required (up to ~400 req/day for anonymous)
// Hawaii bounding box
const BBOX = { lamin: 20.5, lomin: -159.5, lamax: 22.2, lomax: -155.5 };

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10-min cache stays well within daily limit

router.get("/aircraft", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const url =
      `https://opensky-network.org/api/states/all` +
      `?lamin=${BBOX.lamin}&lomin=${BBOX.lomin}&lamax=${BBOX.lamax}&lomax=${BBOX.lomax}`;

    const r = await fetch(url, {
      headers: { "User-Agent": "HonoluluCommandCenter/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`OpenSky ${r.status}`);

    const json = (await r.json()) as { states: Array<Array<unknown>> | null; time: number };

    const aircraft = (json.states ?? [])
      .filter((s) => s[5] != null && s[6] != null && !s[8]) // has position, not on ground
      .map((s) => ({
        icao24: s[0] as string,
        callsign: ((s[1] as string) ?? "").trim() || "UNKNWN",
        lat: s[6] as number,
        lng: s[5] as number,
        altFt: s[7] != null ? Math.round((s[7] as number) * 3.281) : null,
        geoAltFt: s[13] != null ? Math.round((s[13] as number) * 3.281) : null,
        speedKt: s[9] != null ? Math.round((s[9] as number) * 1.94384) : null,
        heading: s[10] as number | null,
        country: s[2] as string,
        onGround: s[8] as boolean,
      }));

    const data = { aircraft, fetchedAt: Date.now(), dataTime: json.time };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch aircraft from OpenSky");
    // Return empty rather than error — map handles gracefully
    res.json({ aircraft: [], fetchedAt: Date.now(), source: "fallback" });
  }
});

export default router;
