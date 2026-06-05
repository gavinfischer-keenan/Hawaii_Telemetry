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

// ── Flight-route enrichment (adsbdb.com, keyless) ─────────────────────────
// adsb.fi exposes only the callsign, not the origin/destination. adsbdb maps a
// callsign to its scheduled route. Routes are static so we cache resolved (and
// unresolved) callsigns indefinitely and only ever look up a bounded number of
// NEW callsigns per refresh to stay polite to the free service.
type RouteInfo = { origin: string | null; dest: string | null };
const routeCache = new Map<string, RouteInfo>();
const MAX_LOOKUPS_PER_REFRESH = 12;

async function lookupRoute(callsign: string): Promise<RouteInfo> {
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`, {
      headers: { "User-Agent": "HonoluluCommandCenter/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return { origin: null, dest: null };
    const j = (await r.json()) as {
      response?: { flightroute?: { origin?: { iata_code?: string }; destination?: { iata_code?: string } } };
    };
    const fr = j.response?.flightroute;
    return { origin: fr?.origin?.iata_code ?? null, dest: fr?.destination?.iata_code ?? null };
  } catch {
    return { origin: null, dest: null };
  }
}

// Airline-style callsign (3-letter ICAO airline + flight number), e.g. UAL930.
function isAirlineCallsign(cs: string): boolean {
  return /^[A-Z]{3}\d{1,4}[A-Z]?$/.test(cs);
}

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

    // Resolve a bounded number of NOT-yet-cached airline callsigns this refresh.
    const pending = Array.from(
      new Set(aircraft.map((a) => a.callsign).filter((cs) => isAirlineCallsign(cs) && !routeCache.has(cs))),
    ).slice(0, MAX_LOOKUPS_PER_REFRESH);
    if (pending.length) {
      const looked = await Promise.allSettled(pending.map((cs) => lookupRoute(cs)));
      pending.forEach((cs, i) => {
        const v = looked[i];
        routeCache.set(cs, v.status === "fulfilled" ? v.value : { origin: null, dest: null });
      });
    }

    const enriched = aircraft.map((a) => {
      const route = routeCache.get(a.callsign) ?? null;
      return { ...a, origin: route?.origin ?? null, dest: route?.dest ?? null };
    });

    const data = { aircraft: enriched, fetchedAt: Date.now(), dataTime: json.now ?? null };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch aircraft from adsb.fi");
    res.json({ aircraft: [], fetchedAt: Date.now(), source: "fallback" });
  }
});

export default router;
