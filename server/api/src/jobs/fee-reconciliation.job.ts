import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma";
import { runFeeReconciliationSweep } from "../utils/fee-reconciliation-engine";
import { notifyRoles } from "../services/in-app-notification.service";
import { FEE_COLLECTION_ROLES } from "../lib/roles";
import { logger } from "../lib/logger";
import { isStartupCheckDue } from "../lib/job-freshness";

// Plan Twenty-Four -- mirrors monthly-fee-generation.job.ts's exact shape
// (its own Queue+Worker pair living in this process, not the separate
// notification microservice, since this is a DB-query-driven action).
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const feeReconciliationQueue = new Queue("fee-reconciliation", { connection });

// Exported for a manual re-run / tests / the "Run Now" route -- the single
// place both the scheduled job and any manual trigger call, so they can
// never drift from producing the same run shape for the same data.
export async function runScheduledFeeReconciliation(
  runById: string | null,
  trigger: "SCHEDULED" | "MANUAL" = "SCHEDULED",
): Promise<{ runId: string; totalFindings: number; academicYearId: string | null }> {
  const activeYear = await prisma.academicYear.findFirst({ where: { is_active: true } });
  if (!activeYear) {
    logger.warn("fee reconciliation sweep skipped -- no active academic year configured");
    await notifyRoles(FEE_COLLECTION_ROLES, {
      type: "FEE_RECONCILIATION_DIGEST",
      title: "Fee reconciliation sweep skipped",
      body: "No active academic year is configured -- nothing was checked. Set an active academic year in Settings.",
      link: "/fee-assurance",
    });
    return { runId: "", totalFindings: 0, academicYearId: null };
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // The three checks run read-only against the plain client (see
  // fee-reconciliation-engine.ts's own comment on why) -- only persisting
  // the result needs a transaction.
  const result = await runFeeReconciliationSweep(prisma, activeYear.id, month, year);

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.feeReconciliationRun.create({
      data: {
        run_by_id: runById,
        trigger,
        academic_year_id: activeYear.id,
        coverage_gap_count: result.coverageGapCount,
        unexpected_invoice_count: result.unexpectedInvoiceCount,
        assignment_gap_count: result.assignmentGapCount,
        amount_variance_count: result.amountVarianceCount,
      },
    });
    if (result.findings.length > 0) {
      await tx.feeReconciliationFinding.createMany({
        data: result.findings.map((f) => ({
          run_id: created.id,
          type: f.type,
          student_id: f.student_id ?? null,
          fee_structure_id: f.fee_structure_id ?? null,
          invoice_id: f.invoice_id ?? null,
          class_id: f.class_id ?? null,
          section_id: f.section_id ?? null,
          group_id: f.group_id ?? null,
          expected_amount: f.expected_amount ?? null,
          actual_amount: f.actual_amount ?? null,
          description: f.description,
        })),
      });
    }
    if (result.structureSummaries.length > 0) {
      await tx.feeStructureCoverageSummary.createMany({
        data: result.structureSummaries.map((s) => ({
          run_id: created.id,
          fee_structure_id: s.fee_structure_id,
          structure_name: s.structure_name,
          category: s.category as never,
          frequency: s.frequency as never,
          assignment_summary: s.assignment_summary,
          expected_count: s.expected_count,
          invoiced_count: s.invoiced_count,
        })),
      });
    }
    return created;
  });

  const totalFindings = result.findings.length;

  // Always notify, not just when something's found -- a clean sweep with 0
  // findings is still worth confirming happened, same philosophy as the
  // monthly fee generation job's own digest.
  await notifyRoles(FEE_COLLECTION_ROLES, {
    type: "FEE_RECONCILIATION_DIGEST",
    title: totalFindings > 0 ? `Fee reconciliation found ${totalFindings} item(s) to review` : "Fee reconciliation sweep completed — nothing to review",
    body:
      totalFindings > 0
        ? `${result.coverageGapCount} missing invoice(s), ${result.unexpectedInvoiceCount} unexpected invoice(s), ${result.assignmentGapCount} possible forgotten assignment(s), ${result.amountVarianceCount} amount mismatch(es).`
        : "No coverage gaps, forgotten assignments, or amount mismatches found.",
    link: "/fee-assurance",
  });

  return { runId: run.id, totalFindings, academicYearId: activeYear.id };
}

let workerStarted = false;

export async function registerFeeReconciliationJob(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  new Worker(
    "fee-reconciliation",
    async () => {
      try {
        const result = await runScheduledFeeReconciliation(null, "SCHEDULED");
        logger.info(result, "scheduled fee reconciliation sweep completed");
      } catch (err) {
        logger.error({ err }, "scheduled fee reconciliation sweep failed");
        await notifyRoles(FEE_COLLECTION_ROLES, {
          type: "FEE_RECONCILIATION_DIGEST",
          title: "Fee reconciliation sweep failed",
          body: `The automatic nightly fee reconciliation run failed: ${err instanceof Error ? err.message : "unknown error"}. Run it manually from Fee Assurance to catch up.`,
          link: "/fee-assurance",
        });
      }
    },
    { connection },
  );

  // 2am every night -- after the 6am/1st-of-month invoice generation job has
  // had a full day (or more) to settle, so a same-day generation run isn't
  // flagged as a coverage gap before it's even had a chance to run.
  // BullMQ's repeat option dedupes by (queue, name, pattern) -- safe to call
  // on every server start without stacking duplicate schedules.
  await feeReconciliationQueue.add("nightly-run", {}, { repeat: { pattern: "0 2 * * *" }, removeOnComplete: 50, removeOnFail: 50 });

  // Also run once on startup -- covers the case where the server was down
  // at 2am -- but only if a run hasn't already happened recently. Unlike
  // monthly-fee-generation, every run here is genuinely "independent" (no
  // per-item idempotency gate), which is exactly why firing this
  // unconditionally on every restart is worse, not better: confirmed via
  // real data this produced 25+ duplicate "Fee reconciliation..."
  // notifications within a single afternoon of active development.
  const lastRun = await prisma.feeReconciliationRun.findFirst({ orderBy: { run_at: "desc" }, select: { run_at: true } });
  if (isStartupCheckDue(lastRun?.run_at ?? null)) {
    await feeReconciliationQueue.add("startup-check", {}, { removeOnComplete: 50, removeOnFail: 50 });
  }
}
