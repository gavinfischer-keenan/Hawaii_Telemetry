import { Router } from "express";

const router = Router();

// adsb.fi — free community ADS-B aggregator, no API key, global coverage
// (includes Hawaii). Replaces OpenSky, whose anonymous API times out from
// Replit's outbound IPs. Query is a radius around Oahu wide enough to cover
// the main Hawaiian islands.
const CENTER = { lat: 21.3, lon: -157.8 };
const RADIUS_NM = 250;

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 60 * 1000; // 1 min — adsb.fi is generous, keep it fresh

type AdsbAircraft = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
};

router.get("/aircraft", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    const url = `https://opendata.adsb.fi/api/v2/lat/${CENTER.lat}/lon/${CENTER.lon}/dist/${RADIUS_NM}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "HonoluluCommandCenter/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) throw new Error(`adsb.fi ${r.status}`);

    const json = (await r.json()) as { aircraft?: AdsbAircraft[]; now?: number };

    const aircraft = (json.aircraft ?? [])
      .filter((a) => a.lat != null && a.lon != null)
      .map((a) => {
        const onGround = a.alt_baro === "ground";
        const altFt = typeof a.alt_baro === "number" ? a.alt_baro : null;
        return {
          icao24: a.hex ?? "",
          callsign: (a.flight ?? "").trim() || "UNKNWN",
          registration: a.r ?? null,
          acType: a.t ?? null,
          lat: a.lat as number,
          lng: a.lon as number,
          altFt,
          geoAltFt: a.alt_geom ?? null,
          speedKt: a.gs != null ? Math.round(a.gs) : null,
          heading: a.track ?? null,
          onGround,
        };
      })
      .filter((a) => !a.onGround);

    const data = { aircraft, fetchedAt: Date.now(), dataTime: json.now ?? null };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch aircraft from adsb.fi");
    res.json({ aircraft: [], fetchedAt: Date.now(), source: "fallback" });
  }
});

export default router;
