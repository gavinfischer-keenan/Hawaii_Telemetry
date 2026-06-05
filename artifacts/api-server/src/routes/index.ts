import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weatherRouter from "./weather";
import earthquakesRouter from "./earthquakes";
import buoysRouter from "./buoys";

const router: IRouter = Router();

router.use(healthRouter);
router.use(weatherRouter);
router.use(earthquakesRouter);
router.use(buoysRouter);

export default router;
