import { Router } from "express";
import healthRouter from "./health";
import resultsRouter from "./results";

const router = Router();

router.use(healthRouter);
router.use(resultsRouter);

export default router;
