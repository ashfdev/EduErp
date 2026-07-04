import { Router } from "express";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { asyncHandler } from "../middleware/async-handler";
import { SETTINGS_INSTITUTION_ROLES } from "../lib/roles";

export const healthRouter: Router = Router();

async function checkDb(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
    const status = dbOk && redisOk ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({
      success: status === "ok",
      data: { status, uptime: process.uptime(), db: dbOk ? "connected" : "disconnected", redis: redisOk ? "connected" : "disconnected" },
    });
  }),
);

healthRouter.get(
  "/detailed",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  asyncHandler(async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
    const mem = process.memoryUsage();
    res.json({
      success: true,
      data: {
        status: dbOk && redisOk ? "ok" : "degraded",
        uptime: process.uptime(),
        version: process.env.npm_package_version ?? "0.0.0",
        node_version: process.version,
        db: dbOk ? "connected" : "disconnected",
        redis: redisOk ? "connected" : "disconnected",
        memory: { rss_mb: Math.round(mem.rss / 1024 / 1024), heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024), heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024) },
      },
    });
  }),
);
