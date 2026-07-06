import { prisma } from "./prisma";
import { forbidden } from "./errors";

// Shared by every "this is a self-service action, but HR/Admin may act on
// someone else's behalf" endpoint (leave, staff documents, etc.) — resolves
// the calling User to their own Staff row.
export async function resolveOwnStaffId(userId: string): Promise<string> {
  const staff = await prisma.staff.findFirst({ where: { user_id: userId } });
  if (!staff) throw forbidden("No staff record linked to this account");
  return staff.id;
}
