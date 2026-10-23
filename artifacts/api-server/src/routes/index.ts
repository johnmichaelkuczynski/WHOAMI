import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import discoveryRouter from "./discovery";
import voiceRouter from "./voice";
import { requireAuth, requireSameOrigin } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth, requireSameOrigin);
router.use(discoveryRouter);
router.use(voiceRouter);

export default router;
