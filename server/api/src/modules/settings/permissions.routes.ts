import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { SETTINGS_USERS_ROLES } from "../../lib/roles";
import { refreshPermissions } from "../../lib/permissions";
import { logAudit } from "../../lib/audit-log";
import { badRequest, notFound } from "../../lib/errors";

export const permissionsRouter = Router();
permissionsRouter.use(authenticate, authorize(SETTINGS_USERS_ROLES));

const updatePermissionSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
});

permissionsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const permissions = await prisma.permission.findMany({
      include: { role_permissions: { select: { role: true } } },
      orderBy: [{ category: "asc" }, { label: "asc" }],
    });
    res.json({
      success: true,
      data: permissions.map((p) => ({
        id: p.id,
        key: p.key,
        label: p.label,
        category: p.category,
        roles: p.role_permissions.map((rp) => rp.role),
      })),
    });
  }),
);

// Structural guarantee, not a UI-level convention: ADMIN and SUPER_ADMIN
// can never be removed from any permission through this route, even if the
// frontend somehow allowed the click — this is the load-bearing safety net
// the "every hardcoded array lists both" convention relied on before this
// became editable at runtime by a real admin who could make a mistake.
permissionsRouter.put(
  "/:key",
  asyncHandler(async (req, res) => {
    const key = reqParam(req, "key");
    const body = updatePermissionSchema.parse(req.body);

    if (!body.roles.includes("ADMIN") || !body.roles.includes("SUPER_ADMIN")) {
      throw badRequest("ADMIN and SUPER_ADMIN must always have this permission — they cannot be removed.");
    }

    const permission = await prisma.permission.findUnique({ where: { key } });
    if (!permission) throw notFound("Permission not found");

    const uniqueRoles = [...new Set(body.roles)];
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { permission_id: permission.id } }),
      prisma.rolePermission.createMany({ data: uniqueRoles.map((role) => ({ role: role as never, permission_id: permission.id })) }),
    ]);

    // Applies live to every authorize(SOME_ROLES) call site immediately —
    // no restart needed (see lib/permissions.ts).
    await refreshPermissions();

    await logAudit("PERMISSION_UPDATE", {
      userId: req.user!.sub,
      targetType: "Permission",
      targetId: permission.id,
      metadata: { key, roles: uniqueRoles },
      req,
    });

    res.json({ success: true, data: { key, roles: uniqueRoles } });
  }),
);
