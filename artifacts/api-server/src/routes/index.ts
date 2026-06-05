import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weatherRouter from "./weather";
import earthquakesRouter from "./earthquakes";
import buoysRouter from "./buoys";
import alertsRouter from "./alerts";
import airqualityRouter from "./airquality";

const router: IRouter = Router();

router.use(healthRouter);
router.use(weatherRouter);
router.use(earthquakesRouter);
router.use(buoysRouter);
router.use(alertsRouter);
router.use(airqualityRouter);

export default router;
