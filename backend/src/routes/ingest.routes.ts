import { Router } from "express";
import { triggerIngest, getJobStatus } from "../controllers/ingest.controller";

const router = Router();

router.post("/ingest/trigger", triggerIngest);
router.get("/ingest/status/:jobId", getJobStatus);

export default router;
