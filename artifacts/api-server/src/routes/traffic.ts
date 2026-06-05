import { Router } from "express";

const router = Router();

// TomTom Traffic Flow tiles — colour-codes roads by real-time congestion.
// Proxied server-side so the API key stays out of the shipped frontend.
// Requires a free TOMTOM_API_KEY (https://developer.tomtom.com). When the key
// is absent the route returns 204 so the map layer simply renders nothing.
router.get("/traffic/:z/:x/:y", async (req, res) => {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) {
    res.status(204).end();
    return;
  }

  const { z, x, y } = req.params;
  try {
    const url =
      `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${z}/${x}/${y}.png?key=${key}`;
    const r = await fetch(url);
    if (!r.ok) {
      res.status(204).end();
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=120");
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "Traffic tile proxy failed");
    res.status(204).end();
  }
});

export default router;
