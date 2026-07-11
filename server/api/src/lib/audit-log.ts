import type { Request } from "express";
import type { Prisma } from "@education-erp/db";
import { prisma } from "./prisma";
import { logger } from "./logger";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "MARK_ENTRY_SUBMIT"
  | "RESULT_APPROVE"
  | "RESULT_PUBLISH"
  | "FEE_WAIVE"
  | "STUDENT_DELETE"
  | "ROLE_CHANGE"
  | "TEMPLATE_ACTIVATE"
  | "COURSE_ENROLL"
  | "COURSE_GRADE_ENTRY";

// Fire-and-forget: an audit-log write must never break the request it's
// recording. Failures are logged, not thrown.
export async function logAudit(
  action: AuditAction,
  params: { userId?: string | null; targetType?: string; targetId?: string; metadata?: Prisma.InputJsonValue; req?: Request },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        user_id: params.userId ?? undefined,
        target_type: params.targetType,
        target_id: params.targetId,
        metadata: params.metadata,
        ip_address: params.req?.ip,
      },
    });
  } catch (err) {
    logger.error({ err, action }, "failed to write audit log");
  }
}
