import { Request, Response, NextFunction } from "express";
import { clusterService } from "../services/cluster.service";

export const getClusters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const clusters = await clusterService.getClusters();
    res.json(clusters);
  } catch (error) {
    next(error);
  }
};

export const getClusterById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const cluster = await clusterService.getClusterById(id);
    res.json(cluster);
  } catch (error) {
    next(error);
  }
};

export const getTimeline = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const timelineData = await clusterService.getTimeline();
    res.json(timelineData);
  } catch (error) {
    next(error);
  }
};
