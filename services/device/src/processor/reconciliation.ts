import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { processPunch } from "./punch.processor";

// Re-attempts any punch that failed to map to a person earlier (e.g. the
// biometric_id was registered on the person *after* the device pushed the
// punch) — self-healing offline recovery. True device-side "pull since
// last_sync_at" isn't meaningful for a push-only ADMS device (see
// zkteco-adms.ts), so this is the practical equivalent: reconcile what's
// already been pushed but never resolved.
export async function reconcileUnprocessedPunches(): Promise<{ retried: number; resolved: number }> {
  const unprocessed = await prisma.devicePunchLog.findMany({ where: { is_processed: false }, take: 500 });
  let resolved = 0;

  for (const log of unprocessed) {
    // Read the actually-stored punch_type instead of hardcoding 0/check-in —
    // fabricating a value here would misaudit every reconciled punch as a
    // check-in regardless of what it really was, once punch_type is
    // actually captured (Plan Twelve, Phase 5). Falls back to 0 only for
    // rows synced before that column existed (genuinely unrecoverable).
    const result = await processPunch({ device_id: log.device_id, device_user_id: log.device_user_id, punch_at: log.punch_at, punch_type: log.punch_type ?? 0 });
    if (result.status !== "unmapped" && result.status !== "skipped") resolved++;
  }

  if (unprocessed.length) logger.info({ retried: unprocessed.length, resolved }, "reconciliation pass complete");
  return { retried: unprocessed.length, resolved };
}

// Ensures every active student has an AttendanceRecord for today even if no
// punch (biometric or manual) was ever recorded — the spec's end-of-day
// "system-default-absent" job. Idempotent: only creates where none exists.
export async function markDefaultAbsentees(): Promise<{ created: number }> {
  const today = new Date();
  // Date.UTC(), not a local-time constructor — this service (like server/api)
  // runs in Bangladesh time (UTC+6), and a locally-constructed midnight Date
  // serializes to the *previous* UTC calendar day once Prisma sends it to a
  // @db.Date column (confirmed empirically while building subject-wise
  // attendance — see subject-attendance.routes.ts's identical comment).
  const dayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const dayEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1));

  // Fridays are the standard BD weekly holiday — same convention already
  // applied for working-day math elsewhere in this codebase. getUTCDay(),
  // matching how dayStart itself is now UTC-anchored.
  if (dayStart.getUTCDay() === 5) return { created: 0 };

  const students = await prisma.student.findMany({ where: { deleted_at: null, status: "ACTIVE" }, select: { id: true } });
  const existingRecords = await prisma.attendanceRecord.findMany({
    where: { person_type: "STUDENT", person_id: { in: students.map((s) => s.id) }, date: { gte: dayStart, lt: dayEnd } },
    select: { person_id: true },
  });
  const alreadyMarked = new Set(existingRecords.map((r) => r.person_id));
  const missing = students.filter((s) => !alreadyMarked.has(s.id));

  if (missing.length) {
    await prisma.attendanceRecord.createMany({
      data: missing.map((s) => ({ person_id: s.id, person_type: "STUDENT" as const, date: dayStart, status: "ABSENT" as const, source: "MANUAL" as const })),
    });
    logger.info({ created: missing.length }, "marked default absentees for today");
  }

  return { created: missing.length };
}
