import { Router } from "express";

const router = Router();

// National Weather Service API — free, no key required
// Using Honolulu HNL coordinates
const LAT = "21.3069";
const LNG = "-157.8583";

let cache: { data: unknown; expiresAt: number } | null = null;
const CACHE_MS = 10 * 60 * 1000; // 10 minutes

router.get("/weather", async (req, res) => {
  try {
    if (cache && Date.now() < cache.expiresAt) {
      res.json(cache.data);
      return;
    }

    // Step 1: get the forecast office + grid for this location
    const pointRes = await fetch(
      `https://api.weather.gov/points/${LAT},${LNG}`,
      { headers: { "User-Agent": "HonoluluCommandCenter/1.0 (contact@example.com)" } },
    );

    if (!pointRes.ok) throw new Error(`NWS points ${pointRes.status}`);

    const pointJson = (await pointRes.json()) as {
      properties: {
        forecast: string;
        forecastHourly: string;
        relativeLocation: { properties: { city: string; state: string } };
      };
    };

    // Step 2: get the actual forecast
    const forecastRes = await fetch(pointJson.properties.forecastHourly, {
      headers: { "User-Agent": "HonoluluCommandCenter/1.0 (contact@example.com)" },
    });

    if (!forecastRes.ok) throw new Error(`NWS forecast ${forecastRes.status}`);

    const forecastJson = (await forecastRes.json()) as {
      properties: {
        periods: Array<{
          number: number;
          startTime: string;
          temperature: number;
          temperatureUnit: string;
          windSpeed: string;
          windDirection: string;
          shortForecast: string;
          relativeHumidity?: { value: number };
          probabilityOfPrecipitation?: { value: number };
        }>;
      };
    };

    const now = forecastJson.properties.periods[0];
    const next6 = forecastJson.properties.periods.slice(0, 6);

    const data = {
      location: pointJson.properties.relativeLocation.properties.city,
      tempF: now.temperature,
      tempUnit: now.temperatureUnit,
      windSpeed: now.windSpeed,
      windDirection: now.windDirection,
      shortForecast: now.shortForecast,
      humidity: now.relativeHumidity?.value ?? null,
      precipChance: now.probabilityOfPrecipitation?.value ?? null,
      hourly: next6.map((p) => ({
        time: p.startTime,
        tempF: p.temperature,
        wind: `${p.windDirection} ${p.windSpeed}`,
        forecast: p.shortForecast,
      })),
      fetchedAt: Date.now(),
    };

    cache = { data, expiresAt: Date.now() + CACHE_MS };
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch weather");
    res.status(502).json({ error: "Failed to fetch weather data" });
  }
});

export default router;
