import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma";
import { runMonthlyFeeGeneration } from "../modules/fees/invoice-helpers";
import { notifyRoles } from "../services/in-app-notification.service";
import { FEE_COLLECTION_ROLES } from "../lib/roles";
import { logger } from "../lib/logger";

// Plan Twenty-One, Phase A -- previously monthly tuition invoicing had no
// real scheduled trigger anywhere in this codebase; an admin had to
// remember to click "Generate Monthly Invoices" every month. This is the
// first fee-related scheduled job, mirroring exam-reminder.job.ts's exact
// shape (its own Queue+Worker pair living in this process, not split across
// the separate services/notification microservice, since this is a
// DB-query-driven action, not a delivery channel).
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const monthlyFeeGenerationQueue = new Queue("monthly-fee-generation", { connection });

// Exported for a manual re-run / tests. Idempotent by design
// (createMonthlyInvoiceIfMissing's own existence check), so calling this
// more than once for the same month is always safe, never double-invoices.
export async function runScheduledMonthlyFeeGeneration(): Promise<{ created: number; skipped: number; academicYearId: string | null }> {
  const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
  if (!activeYear) {
    logger.warn("scheduled monthly fee generation skipped -- no active academic year configured");
    await notifyRoles(FEE_COLLECTION_ROLES, {
      type: "SCHEDULED_FEE_GENERATION_COMPLETE",
      title: "Scheduled fee generation skipped",
      body: "No active academic year is configured -- nothing was generated. Set an active academic year in Settings, then run generation manually to catch up.",
      link: "/fees/invoices",
    });
    return { created: 0, skipped: 0, academicYearId: null };
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { created, skipped } = await prisma.$transaction(
    (tx) => runMonthlyFeeGeneration(tx, activeYear.id, month, year),
    { timeout: 120_000 },
  );

  await prisma.invoiceGenerationRun.create({
    data: { run_by_id: null, trigger: "SCHEDULED", created_count: created, skipped_count: skipped, academic_year_id: activeYear.id, month, year },
  });

  // Always notify, not just on failure -- a run that quietly created 0
  // invoices is exactly as worth a human's attention as one that errored,
  // and FEE_COLLECTION_ROLES has no other way to notice a scheduled job ran
  // at all otherwise.
  await notifyRoles(FEE_COLLECTION_ROLES, {
    type: "SCHEDULED_FEE_GENERATION_COMPLETE",
    title: "Scheduled monthly fee generation completed",
    body: `${created} invoice(s) created, ${skipped} already existed, for ${month}/${year}.`,
    link: "/fees/invoices",
  });

  return { created, skipped, academicYearId: activeYear.id };
}

let workerStarted = false;

export async function registerMonthlyFeeGenerationJob(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  new Worker(
    "monthly-fee-generation",
    async () => {
      try {
        const result = await runScheduledMonthlyFeeGeneration();
        logger.info(result, "scheduled monthly fee generation completed");
      } catch (err) {
        logger.error({ err }, "scheduled monthly fee generation failed");
        await notifyRoles(FEE_COLLECTION_ROLES, {
          type: "SCHEDULED_FEE_GENERATION_COMPLETE",
          title: "Scheduled fee generation failed",
          body: `The automatic monthly fee generation run failed: ${err instanceof Error ? err.message : "unknown error"}. Run it manually from Fees > Invoices to catch up.`,
          link: "/fees/invoices",
        });
      }
    },
    { connection },
  );

  // 6am on the 1st of every month. BullMQ's repeat option dedupes by
  // (queue, name, pattern) -- safe to call on every server start without
  // stacking duplicate schedules.
  await monthlyFeeGenerationQueue.add("monthly-run", {}, { repeat: { pattern: "0 6 1 * *" }, removeOnComplete: 50, removeOnFail: 50 });

  // Also run once immediately on startup -- covers the case where the
  // server was down at 6am on the 1st, and is safe to call repeatedly
  // (idempotent via createMonthlyInvoiceIfMissing) even across several
  // restarts in the same month; a repeat run just reports 0 created.
  await monthlyFeeGenerationQueue.add("startup-check", {}, { removeOnComplete: 50, removeOnFail: 50 });
}
