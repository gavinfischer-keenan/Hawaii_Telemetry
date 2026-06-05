import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weatherRouter from "./weather";
import earthquakesRouter from "./earthquakes";
import buoysRouter from "./buoys";
import alertsRouter from "./alerts";
import airqualityRouter from "./airquality";
import aircraftRouter from "./aircraft";
import windRouter from "./wind";
import trafficRouter from "./traffic";
import shipsRouter from "./ships";
import stationsRouter from "./stations";
import currentsRouter from "./currents";
import tideRouter from "./tide";

const router: IRouter = Router();

router.use(healthRouter);
router.use(weatherRouter);
router.use(earthquakesRouter);
router.use(buoysRouter);
router.use(alertsRouter);
router.use(airqualityRouter);
router.use(aircraftRouter);
router.use(windRouter);
router.use(trafficRouter);
router.use(shipsRouter);
router.use(stationsRouter);
router.use(currentsRouter);
router.use(tideRouter);

export default router;
