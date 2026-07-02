import axios from "axios";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import type { RawPunch } from "../connectors/interface";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const DEVICE_SERVICE_SECRET = process.env.DEVICE_SERVICE_SECRET ?? "dev-only-device-secret";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

async function findMatchingShift(sectionId: string | null, punchAt: Date) {
  const punchMinutes = minutesOfDay(punchAt);

  if (sectionId) {
    const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { shift: true } });
    if (section?.shift && Math.abs(punchMinutes - timeToMinutes(section.shift.start_time)) <= 30) {
      return section.shift;
    }
  }

  // No section shift, or punch didn't land near it — the person may have
  // changed shift today, so fall back to checking every active shift.
  const shifts = await prisma.shift.findMany({ where: { is_active: true } });
  return shifts.find((s) => Math.abs(punchMinutes - timeToMinutes(s.start_time)) <= 30) ?? null;
}

export async function processPunch(raw: RawPunch): Promise<{ status: string; skipped?: string }> {
  // 1. Dedup — application-level check rather than a DB unique constraint,
  // consistent with the rest of this codebase's "find-then-write" pattern
  // for compound keys with nullable members.
  const existing = await prisma.devicePunchLog.findFirst({
    where: { device_id: raw.device_id, device_user_id: raw.device_user_id, punch_at: raw.punch_at },
  });
  if (existing?.is_processed) {
    return { status: "skipped", skipped: "duplicate" };
  }

  // 2. Map person
  const student = await prisma.student.findFirst({ where: { biometric_id: raw.device_user_id, deleted_at: null } });
  const staff = student ? null : await prisma.staff.findFirst({ where: { biometric_id: raw.device_user_id, deleted_at: null } });

  const log = existing
    ? existing
    : await prisma.devicePunchLog.create({
        data: { device_id: raw.device_id, device_user_id: raw.device_user_id, punch_at: raw.punch_at },
      });

  if (!student && !staff) {
    logger.warn({ device_user_id: raw.device_user_id, device_id: raw.device_id }, "unmapped biometric ID");
    return { status: "unmapped" };
  }

  const personId = student?.id ?? staff!.id;
  const personType = student ? "STUDENT" : "STAFF";

  // 3. Determine shift (students only — no Staff→Shift assignment model
  // exists yet, so staff attendance doesn't do late-window matching).
  const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
  const lateWindow = rules?.late_arrival_window_minutes ?? 15;

  let shiftId: string | null = null;
  let status: "PRESENT" | "LATE" = "PRESENT";

  if (student) {
    const shift = await findMatchingShift(student.current_section_id, raw.punch_at);
    if (shift) {
      shiftId = shift.id;
      const punchMinutes = minutesOfDay(raw.punch_at);
      status = punchMinutes > timeToMinutes(shift.start_time) + lateWindow ? "LATE" : "PRESENT";
    }
  }

  // 4. Write attendance — find-then-write since shift_id is nullable and
  // Prisma's compound-unique upsert() shorthand rejects null members.
  const dayStart = new Date(raw.punch_at.getFullYear(), raw.punch_at.getMonth(), raw.punch_at.getDate());
  const existingAttendance = await prisma.attendanceRecord.findFirst({
    where: { person_id: personId, person_type: personType, date: dayStart, shift_id: shiftId, period_no: null },
  });

  if (existingAttendance) {
    if (existingAttendance.source === "MANUAL") {
      await prisma.attendanceRecord.update({
        where: { id: existingAttendance.id },
        data: { status, source: "BIOMETRIC", device_id: raw.device_id },
      });
    }
    // A BIOMETRIC-sourced record for the same slot is left as-is — first
    // punch of the day wins for status purposes.
  } else {
    await prisma.attendanceRecord.create({
      data: { person_id: personId, person_type: personType, date: dayStart, shift_id: shiftId, status, source: "BIOMETRIC", device_id: raw.device_id },
    });
  }

  await prisma.devicePunchLog.update({
    where: { id: log.id },
    data: { mapped_person_id: personId, mapped_person_type: personType, is_processed: true },
  });

  // 5. Notify the core API for any live UI (Socket.io) to pick up. Best
  // effort — a missed event just means the live widget doesn't update
  // instantly, the AttendanceRecord itself is already durably written.
  try {
    await axios.post(
      `${API_URL}/internal/attendance/biometric-event`,
      { person_id: personId, person_type: personType, status, time: raw.punch_at, shift_id: shiftId },
      { headers: { "x-device-service-secret": DEVICE_SERVICE_SECRET }, timeout: 3000 },
    );
  } catch (err) {
    logger.warn({ err }, "failed to notify core API of biometric event");
  }

  return { status };
}
