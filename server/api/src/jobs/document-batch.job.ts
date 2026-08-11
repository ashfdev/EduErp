import { Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma";
import { uploadBuffer } from "../services/storage.service";
import { createInAppNotification } from "../services/in-app-notification.service";
import { logger } from "../lib/logger";
import { getBatchJobBuilder } from "../lib/batch-job-registry";

// Every module below registers its own batch-job kind(s) as a side effect
// of being imported (registerBatchJobKind, called at each module's own
// top level) -- these imports exist ONLY to trigger that side effect so
// getBatchJobBuilder() below can resolve every kind, even though this
// worker process never mounts any of these Express routers. Add a line
// here whenever a new module registers a kind, or its jobs will fail at
// runtime with "No batch job builder registered for kind ...".
import "../modules/documents/documents.routes";
import "../modules/admission/admission.routes";
import "../modules/fees/fees.routes";
import "../modules/attendance/attendance.routes";
import "../modules/results/results.routes";
import "../modules/hr/staff.routes";
import "../modules/library/library.routes";
import "../modules/transport/transport.routes";
import "../modules/hr/payroll.routes";
import "../modules/students/students.routes";
import "../modules/accounts/accounts.routes";
import "../modules/accounts/vouchers.routes";
import "../modules/complaints/complaints.routes";
import "../modules/health/health.routes";
import "../modules/discipline/discipline.routes";
import "../modules/appraisals/appraisals.routes";

// Plan Twenty (built via Plan Twenty-Six, Phase C; generalized beyond PDFs
// in a later pass) -- consumes documentQueue (lib/queues.ts), the async
// half of every large-batch-export threshold routing across the codebase
// (batch PDFs in documents.routes.ts/admission.routes.ts, and Excel/CSV
// bulk exports in the 12 modules above). Purely job-driven, no cron/repeat
// schedule -- unlike monthly-fee-generation.job.ts/exam-reminder.job.ts, a
// job here is only ever enqueued on-demand by a route handler once a batch
// exceeds its own threshold, never on a timer.
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
        const build = getBatchJobBuilder(job.job_kind);
        const { buffer, filename, mimeType } = await build(job.params as Record<string, unknown>);
        const { blobKey } = await uploadBuffer("document-batches", filename, buffer, mimeType ?? "application/pdf");
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
