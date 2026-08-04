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
  | "STUDENT_TRANSFER"
  | "STUDENT_EXPEL"
  | "VOUCHER_REVERSE"
  | "PAYMENT_REFUND"
  | "PAYROLL_VOID"
  | "ROLE_CHANGE"
  | "TEMPLATE_ACTIVATE"
  | "COURSE_ENROLL"
  | "COURSE_GRADE_ENTRY"
  | "HEALTH_RECORD_CREATE"
  | "DISCIPLINE_RECORD_CREATE"
  | "COMPLAINT_RESOLVE"
  | "COMPLAINT_REOPENED"
  | "APPRAISAL_SUBMIT"
  | "BULK_SMS_SEND"
  | "ROUTINE_GENERATE"
  | "JOB_APPLICATION_STATUS_CHANGE"
  | "EXAM_REOPENED"
  | "PERMISSION_UPDATE"
  | "DOCUMENT_REQUEST_REVIEWED"
  | "WAIVER_REQUEST_REVIEWED"
  | "ADMIT_CARD_OVERRIDE"
  | "PAYMENT_GATEWAY_CONFIG_UPDATE"
  | "STAFF_RESIGN"
  | "STAFF_REJOIN"
  | "STUDENT_PORTAL_LOGIN_CREATE"
  | "INSTITUTION_TYPE_CHANGE"
  | "STUDENT_ID_SEQUENCE_RESET"
  | "GRADING_SCALE_CREATE"
  | "GRADING_SCALE_DELETE"
  | "GRADING_SCALE_SET_DEFAULT"
  | "SIGNATURE_CREATE"
  | "SIGNATURE_DELETE"
  | "FEE_RECONCILIATION_FINDING_REVIEW";

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
