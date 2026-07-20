import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../lib/prisma";
import { sendNotification } from "../services/notification.service";
import { createInAppNotification } from "../services/in-app-notification.service";
import { logger } from "../lib/logger";

// Previously there was no time-based/scheduled trigger infrastructure
// anywhere in this codebase — nothing notified anyone as an exam's start
// date approached, only after marks were actually published. This is the
// first such job: a small, self-contained daily check, not a generic
// scheduler. Reuses the same BullMQ setup (lib/queues.ts) already used for
// SMS/email/push delivery, but keeps its own Queue+Worker pair living
// directly in this process (unlike those three, which are only ever
// produced here and consumed by the separate services/notification
// service) — this job is a DB-query-driven check, not a delivery channel,
// so it doesn't belong split across a process boundary.
const REMINDER_WINDOW_DAYS = 3;

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
const examReminderQueue = new Queue("exam-reminder-check", { connection });

// Exported for tests / a manual re-run — the daily worker below just calls
// this on schedule. Idempotent by design (gated on reminder_sent_at), so
// calling it more than once in a day is always safe, never double-notifies.
export async function runExamReminderCheck(): Promise<{ examsNotified: number; studentsNotified: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const upcomingExams = await prisma.exam.findMany({
    where: {
      deleted_at: null,
      reminder_sent_at: null,
      status: { in: ["ACTIVE", "MARK_ENTRY"] },
      start_date: { gte: now, lte: windowEnd },
    },
  });

  let examsNotified = 0;
  let studentsNotified = 0;

  for (const exam of upcomingExams) {
    try {
      const subjectConfigs = await prisma.examSubjectConfig.findMany({
        where: { exam_id: exam.id },
        select: { subject: { select: { class_id: true } } },
      });
      const classIds = [...new Set(subjectConfigs.map((c) => c.subject.class_id))];
      if (classIds.length === 0) {
        // Nothing to notify for (no subjects configured yet) — still mark
        // as handled so this exam isn't re-checked every day forever.
        await prisma.exam.update({ where: { id: exam.id }, data: { reminder_sent_at: now } });
        continue;
      }

      const students = await prisma.student.findMany({
        where: { current_class_id: { in: classIds }, deleted_at: null, status: "ACTIVE" },
        select: { id: true, name_en: true, user_id: true, father_phone: true, guardian: { select: { user_id: true, email: true } } },
      });

      const startDateLabel = exam.start_date ? exam.start_date.toLocaleDateString("en-GB") : "";

      for (const student of students) {
        await sendNotification({
          trigger: "EXAM_SCHEDULED",
          recipients: [{ name: student.name_en, phone: student.father_phone, email: student.guardian?.email, user_id: student.guardian?.user_id, person_id: student.id }],
          template_data: { student_name: student.name_en, exam_name: exam.name, start_date: startDateLabel },
        });
        const recipientUserIds = [student.guardian?.user_id, student.user_id].filter((v): v is string => !!v);
        await Promise.all(
          recipientUserIds.map((userId) =>
            createInAppNotification({ userId, type: "EXAM_SCHEDULED", title: `Upcoming exam: ${exam.name}`, body: `Starts ${startDateLabel}`, link: "/routine" }),
          ),
        );
        studentsNotified++;
      }

      await prisma.exam.update({ where: { id: exam.id }, data: { reminder_sent_at: now } });
      examsNotified++;
    } catch (err) {
      // One exam's failure must not block the others — matches this
      // project's established per-unit-isolation discipline (e.g.
      // Publish Whole Campus).
      logger.error({ err, examId: exam.id }, "exam reminder check failed for this exam");
    }
  }

  return { examsNotified, studentsNotified };
}

let workerStarted = false;

export async function registerExamReminderJob(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  new Worker(
    "exam-reminder-check",
    async () => {
      const result = await runExamReminderCheck();
      logger.info(result, "exam reminder check completed");
    },
    { connection },
  );

  // 8am daily. BullMQ's repeat option dedupes by (queue, name, pattern) —
  // safe to call on every server start without stacking duplicate schedules.
  await examReminderQueue.add("daily-check", {}, { repeat: { pattern: "0 8 * * *" }, removeOnComplete: 50, removeOnFail: 50 });

  // Also run once immediately on startup — covers the case where the
  // server was down at 8am, and is safe to call repeatedly (idempotent via
  // reminder_sent_at) even if the process restarts several times in a day.
  await examReminderQueue.add("startup-check", {}, { removeOnComplete: 50, removeOnFail: 50 });
}
