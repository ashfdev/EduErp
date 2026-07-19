import type { Request } from "express";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { logAudit } from "../../lib/audit-log";
import { createInAppNotification, notifyRoles } from "../../services/in-app-notification.service";
import { COMPLAINT_MANAGE_ROLES } from "../../lib/roles";

// Shared by both the staff-side and portal-side complaint routers — a
// CLOSED complaint is a genuine terminal state (a new complaint should be
// filed instead), but a RESOLVED one reopens the moment the original
// requester pushes back with a new message, giving "raise it again if
// unsatisfied" a real ticket-thread instead of forcing a duplicate
// complaint. Staff replying to their own OPEN/IN_PROGRESS complaint (as
// management) never triggers a reopen — only the requester's own message
// on an already-RESOLVED complaint does.
export async function postComplaintMessage(complaintId: string, senderUserId: string, message: string, req: Request) {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId } });
  if (!complaint) throw notFound("Complaint not found");
  if (complaint.status === "CLOSED") throw badRequest("This complaint is closed — please file a new complaint instead.");

  const shouldReopen = complaint.status === "RESOLVED" && complaint.raised_by_user_id === senderUserId;

  const created = await prisma.$transaction(async (tx) => {
    const msg = await tx.complaintMessage.create({ data: { complaint_id: complaintId, sender_user_id: senderUserId, message } });
    if (shouldReopen) {
      await tx.complaint.update({ where: { id: complaintId }, data: { status: "OPEN", resolved_at: null } });
    }
    return msg;
  });

  if (shouldReopen) {
    await logAudit("COMPLAINT_REOPENED", { userId: senderUserId, targetType: "Complaint", targetId: complaintId, req });
  }

  const isRequester = complaint.raised_by_user_id === senderUserId;
  const link = `/complaints`;
  if (isRequester) {
    await notifyRoles(COMPLAINT_MANAGE_ROLES, {
      type: shouldReopen ? "COMPLAINT_REOPENED" : "COMPLAINT_REPLIED",
      title: shouldReopen ? "Complaint reopened" : "New reply on a complaint",
      body: message.slice(0, 140),
      link,
    });
  } else {
    await createInAppNotification({
      userId: complaint.raised_by_user_id,
      type: "COMPLAINT_REPLIED",
      title: "New reply on your complaint",
      body: message.slice(0, 140),
      link,
    });
  }

  return created;
}
