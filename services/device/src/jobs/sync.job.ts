import { logger } from "../lib/logger";
import { reconcileUnprocessedPunches, markDefaultAbsentees } from "../processor/reconciliation";

// setInterval-based recurring jobs rather than real BullMQ — this service
// has no Redis/queue infra of its own yet (that lands with Phase 17's
// notification worker, which this could share once it exists). Fine for a
// single long-running process; not horizontally scalable as-is.
export function startRecurringJobs(): void {
  const RECONCILE_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(() => {
    reconcileUnprocessedPunches().catch((err) => logger.error({ err }, "reconciliation job failed"));
  }, RECONCILE_INTERVAL_MS);

  let lastAbsenteeRunDate: string | null = null;
  const ABSENTEE_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    // Runs once shortly after midnight, guarded by lastAbsenteeRunDate so a
    // 5-minute poll interval doesn't fire it repeatedly through the night.
    if (now.getHours() === 0 && lastAbsenteeRunDate !== todayKey) {
      lastAbsenteeRunDate = todayKey;
      markDefaultAbsentees().catch((err) => logger.error({ err }, "default-absentee job failed"));
    }
  }, ABSENTEE_CHECK_INTERVAL_MS);

  logger.info("recurring reconciliation + default-absentee jobs scheduled");
}
