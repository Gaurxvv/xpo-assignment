import { Router } from "express";
import { getClusters, getClusterById, getTimeline } from "../controllers/cluster.controller";

const router = Router();

router.get("/clusters", getClusters);
router.get("/clusters/:id", getClusterById);
router.get("/timeline", getTimeline);

export default router;
