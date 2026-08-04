// Shared by every job that queues an immediate "startup-check" run alongside
// its real cron schedule (originally meant to cover "the server was down at
// the scheduled time" -- see each job's own comment). Firing that check
// completely unconditionally on every single process start is fine for a
// job whose own notification is naturally idempotent (exam-reminder.job.ts,
// gated per-exam on reminder_sent_at, so a given exam is only ever notified
// once no matter how many times the check re-runs) -- but for a periodic
// re-check that always re-announces its own result (monthly fee generation,
// fee reconciliation), it means every process restart -- a crash, a
// redeploy, or (during active development) every hot-reload -- re-fires a
// near-identical notification. Confirmed directly against real data: over
// ~5 days of active development this produced 250+ duplicate "Scheduled
// monthly fee generation completed" rows and 25+ "Fee reconciliation..."
// rows, saturating the notification bell with noise. This check makes the
// startup-check a genuine "did we actually miss the scheduled window"
// catch-up, not an unconditional fire-every-boot.
export function isStartupCheckDue(lastRunAt: Date | null, hoursThreshold = 6): boolean {
  if (!lastRunAt) return true;
  return Date.now() - lastRunAt.getTime() > hoursThreshold * 60 * 60 * 1000;
}
