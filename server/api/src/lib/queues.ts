import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

// BullMQ requires maxRetriesPerRequest: null on its own connection — kept
// separate from lib/redis.ts's general-purpose client (used for auth) so
// that setting doesn't leak into unrelated Redis usage.
const bullmqConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const DEFAULT_JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 500,
  removeOnFail: 500,
};

// BullMQ rejects ":" in queue names (used internally for Redis key
// namespacing), so these are hyphenated rather than the spec's "notification:sms".
export const smsQueue = new Queue("notification-sms", { connection: bullmqConnection });
export const emailQueue = new Queue("notification-email", { connection: bullmqConnection });
export const pushQueue = new Queue("notification-push", { connection: bullmqConnection });

// Plan Twenty (via Plan Twenty-Six, Phase C) -- large batch-PDF generation
// jobs (e.g. all ID cards for a class), consumed by an in-process Worker
// registered from jobs/document-batch.job.ts. Its own queue rather than
// reusing one of the notification queues above, since this is CPU/Puppeteer-
// bound document rendering work, not a delivery-channel fan-out.
export const documentQueue = new Queue("document-batch", { connection: bullmqConnection });
