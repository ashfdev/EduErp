import IORedis from "ioredis";

// BullMQ Workers require maxRetriesPerRequest: null on their connection.
export const redisConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
