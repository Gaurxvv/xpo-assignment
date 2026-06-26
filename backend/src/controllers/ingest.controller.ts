import { Request, Response, NextFunction } from "express";
import { ingestService } from "../services/ingest.service";

export const triggerIngest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestService.triggerIngest();
    res.status(202).json(result); // 202 Accepted
  } catch (error) {
    next(error);
  }
};

export const getJobStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const status = await ingestService.getJobStatus(jobId);
    res.json(status);
  } catch (error) {
    next(error);
  }
};
