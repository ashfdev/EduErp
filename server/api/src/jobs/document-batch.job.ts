import { Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma";
import { uploadBuffer } from "../services/storage.service";
import { createInAppNotification } from "../services/in-app-notification.service";
import { logger } from "../lib/logger";
import { runBatchJobBuilder, type BatchJobKind } from "../modules/documents/documents.routes";

// Plan Twenty (built via Plan Twenty-Six, Phase C) -- consumes documentQueue
// (lib/queues.ts), the async half of the large-batch-PDF threshold routing
// in documents.routes.ts. Purely job-driven, no cron/repeat schedule --
// unlike monthly-fee-generation.job.ts/exam-reminder.job.ts, a job here is
// only ever enqueued on-demand by a route handler once a batch exceeds
// BATCH_JOB_THRESHOLD, never on a timer.
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

let workerStarted = false;

export async function registerDocumentBatchJob(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  new Worker(
    "document-batch",
    async (bullJob) => {
      const jobId = bullJob.data.job_id as string;
      const job = await prisma.documentBatchJob.findUnique({ where: { id: jobId } });
      if (!job) {
        logger.warn({ jobId }, "document batch job row not found -- skipping");
        return;
      }

      await prisma.documentBatchJob.update({ where: { id: jobId }, data: { status: "PROCESSING" } });

      try {
        // Rebuilds from live data at process time via the exact same
        // builder function the synchronous route path calls -- never a
        // stale snapshot of `params` from when the request was made, and
        // guaranteed to never silently drift from the sync path's output.
        const { buffer, filename } = await runBatchJobBuilder(job.job_kind as BatchJobKind, job.params as Record<string, unknown>);
        const { blobKey } = await uploadBuffer("document-batches", filename, buffer, "application/pdf");
        await prisma.documentBatchJob.update({
          where: { id: jobId },
          data: { status: "COMPLETED", file_blob_key: blobKey, filename, completed_at: new Date() },
        });
        await createInAppNotification({
          userId: job.requested_by_id,
          type: "DOCUMENT_BATCH_READY",
          title: "Your document is ready",
          body: `${filename} has finished generating and is ready to download.`,
          link: `/documents/batch-jobs/${jobId}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        logger.error({ err, jobId }, "document batch job failed");
        await prisma.documentBatchJob.update({
          where: { id: jobId },
          data: { status: "FAILED", error_message: message, completed_at: new Date() },
        });
        await createInAppNotification({
          userId: job.requested_by_id,
          type: "DOCUMENT_BATCH_FAILED",
          title: "Document generation failed",
          body: `Something went wrong generating your document: ${message}`,
          link: `/documents/batch-jobs/${jobId}`,
        });
      }
    },
    { connection },
  );
}
