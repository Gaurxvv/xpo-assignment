import prisma from "./prisma";
import { AppError } from "../middleware/error.middleware";

export class ClusterService {
  async getClusters() {
    const clusters = await prisma.cluster.findMany({
      orderBy: {
        startTime: "desc",
      },
      include: {
        articles: {
          select: {
            source: true,
          },
        },
      },
    });

    return clusters.map((c) => ({
      id: c.id,
      label: c.label,
      articleCount: c.articleCount,
      startTime: c.startTime,
      endTime: c.endTime,
      createdAt: c.createdAt,
      sources: Array.from(new Set(c.articles.map((a) => a.source))),
    }));
  }

  async getClusterById(id: string) {
    const cluster = await prisma.cluster.findUnique({
      where: { id },
      include: {
        articles: {
          orderBy: {
            publishedAt: "asc",
          },
        },
      },
    });

    if (!cluster) {
      throw new AppError(`Cluster with ID ${id} not found`, 404);
    }

    return cluster;
  }

  async getTimeline() {
    const clusters = await prisma.cluster.findMany({
      orderBy: {
        startTime: "asc",
      },
      select: {
        id: true,
        label: true,
        startTime: true,
        endTime: true,
        articleCount: true,
      },
    });

    return clusters.map((c) => ({
      id: c.id,
      label: c.label,
      start: c.startTime,
      end: c.endTime,
      articleCount: c.articleCount,
    }));
  }
}
export const clusterService = new ClusterService();
