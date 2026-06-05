import { Router } from "express";

const router = Router();

// NOAA NDBC buoy station IDs around Hawaii
const BUOYS = [
  { id: "51201", name: "Waimea (North Shore)" },
  { id: "51211", name: "Koko Head (South Shore)" },
  { id: "51212", name: "Barbers Point" },
  { id: "51202", name: "Mokapu" },
];

async function fetchBuoy(id: string): Promise<Record<string, string | number | null>> {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`;
  const res = await fetch(url, {
    headers: { "User-Agent": "HonoluluCommandCenter/1.0" },
  });

  if (!res.ok) throw new Error(`NDBC ${id} responded ${res.status}`);

  const text = await res.text();
  const lines = text.trim().split("\n");

  // Row 0: header names, Row 1: units, Row 2+: data (newest first)
  const headers = lines[0].replace(/^#/, "").trim().split(/\s+/);
  const dataLine = lines[2]?.trim().split(/\s+/) ?? [];

  const row: Record<string, string> = {};
  headers.forEach((h, i) => {
    row[h] = dataLine[i] ?? "MM";
  });

  const num = (key: string): number | null => {
    const v = row[key];
    return v && v !== "MM" ? parseFloat(v) : null;
  };

  return {
    id,
    waveHeight: num("WVHT"),      // meters
    dominantPeriod: num("DPD"),   // seconds
    windSpeed: num("WSPD"),       // m/s → convert below
    windSpeedKt: num("WSPD") != null ? Math.round((num("WSPD") as number) * 1.94384) : null,
    windDir: num("WDIR"),         // degrees
    waterTemp: num("WTMP"),       // Celsius
    airTemp: num("ATMP"),         // Celsius
    pressure: num("PRES"),        // hPa
    time: `${row["YY"] ?? row["#YY"]}-${row["MM"]}-${row["DD"]} ${row["hh"]}:${row["mm"]} UTC`,
  };
}

router.get("/buoys", async (req, res) => {
  try {
    const results = await Promise.allSettled(
      BUOYS.map(async (b) => {
        const data = await fetchBuoy(b.id);
        return { ...data, name: b.name };
      }),
    );

    const buoys = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { id: BUOYS[i].id, name: BUOYS[i].name, error: "unavailable" };
    });

    res.json({ buoys, fetchedAt: Date.now() });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch buoys");
    res.status(502).json({ error: "Failed to fetch buoy data" });
  }
});

export default router;
