import type { InAppNotificationType, UserRole } from "@education-erp/db";
import { prisma } from "../lib/prisma";
import { emitToUser } from "../realtime/socket";

export interface CreateInAppNotificationInput {
  userId: string;
  type: InAppNotificationType;
  title: string;
  body?: string;
  link?: string;
}

// Single integration point for both persistence and live push — every
// trigger site (complaint filed/replied/reopened, document request
// created/approved/rejected, leave applied/approved/rejected, notice
// published, routine updated) calls this instead of writing to
// InAppNotification or the socket directly. Never throws into the caller:
// a notification failing to send must not break the action that triggered
// it (mirrors logAudit()'s own fire-and-forget discipline).
export async function createInAppNotification(input: CreateInAppNotificationInput): Promise<void> {
  try {
    const notification = await prisma.inAppNotification.create({
      data: { user_id: input.userId, type: input.type, title: input.title, body: input.body, link: input.link },
    });
    emitToUser(input.userId, "notification", notification);
  } catch {
    // Fire-and-forget — never let a notification failure break the caller's action.
  }
}

// Fans out to every active user in the given role set — e.g. every
// COMPLAINT_MANAGE_ROLES user when a new complaint is filed. Fine at this
// project's realistic scale (a handful to a few dozen leadership/reviewer
// accounts per institution), matching the same "known limit, not a silent
// gap" reasoning already used elsewhere in this codebase for small
// synchronous fan-outs (e.g. bulk-import's per-row login creation).
export async function notifyRoles(
  roles: UserRole[],
  notification: Omit<CreateInAppNotificationInput, "userId">,
): Promise<void> {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, is_active: true }, select: { id: true } });
  await Promise.all(users.map((u) => createInAppNotification({ ...notification, userId: u.id })));
}
