import { Router } from "express";

const router = Router();

// Tide state for Honolulu Harbor (NOAA CO-OPS station 1612340, keyless).
// Pulls the high/low predictions across a window spanning the current moment
// and derives whether the tide is rising or falling plus the next/previous
// hi-lo events. Cached because predictions change slowly.
const STATION = "1612340";

type Prediction = { t: string; v: string; type: "H" | "L" };

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 30 * 60 * 1000;

// "YYYY-MM-DD HH:MM" (local Hawaii clock) → epoch ms, parsed as a naive wall
// clock. We compare against "now" rendered in the same Hawaii wall clock, so
// both sides share the same (server) interpretation and the diff is correct.
function parseNaive(s: string): number {
  return new Date(s.replace(" ", "T") + ":00").getTime();
}
function hawaiiNowNaive(): number {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Honolulu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(f.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return parseNaive(`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`);
}
function fmtTime(s: string): string {
  const d = new Date(s.replace(" ", "T") + ":00");
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

router.get("/tide", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    // Window starting yesterday (Honolulu calendar date) so we always have a
    // "previous" event. Using UTC here can land on the wrong day near HST
    // midnight; anchor to the Hawaii date, then step back one day. (HST has no
    // DST, so plain 24h UTC math on a date-only anchor is safe.)
    const df = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Honolulu",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dp = Object.fromEntries(df.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const hawaiiToday = new Date(`${dp.year}-${dp.month}-${dp.day}T00:00:00Z`);
    const begin = new Date(hawaiiToday.getTime() - 24 * 3600 * 1000);
    const beginStr =
      begin.getUTCFullYear().toString() +
      (begin.getUTCMonth() + 1).toString().padStart(2, "0") +
      begin.getUTCDate().toString().padStart(2, "0");

    const url =
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date=${beginStr}&range=72` +
      `&station=${STATION}&product=predictions&datum=MLLW&interval=hilo&units=english` +
      `&time_zone=lst_ldt&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`NOAA CO-OPS ${r.status}`);
    const j = (await r.json()) as { predictions?: Prediction[] };
    const preds = j.predictions ?? [];
    if (!preds.length) throw new Error("No tide predictions returned");

    const now = hawaiiNowNaive();
    const sorted = preds.slice().sort((a, b) => parseNaive(a.t) - parseNaive(b.t));
    const next = sorted.find((p) => parseNaive(p.t) > now) ?? null;
    const prevList = sorted.filter((p) => parseNaive(p.t) <= now);
    const prev = prevList.length ? prevList[prevList.length - 1] : null;

    const state = next ? (next.type === "H" ? "Rising" : "Falling") : "—";

    const shape = (p: Prediction | null) =>
      p ? { type: p.type === "H" ? "High" : "Low", time: fmtTime(p.t), heightFt: Math.round(parseFloat(p.v) * 100) / 100 } : null;

    const data = {
      station: "Honolulu Harbor",
      state,
      next: shape(next),
      prev: shape(prev),
      source: "NOAA CO-OPS",
      fetchedAt: Date.now(),
    };
    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch tide data");
    res.status(502).json({ error: "Failed to fetch tide data" });
  }
});

export default router;
