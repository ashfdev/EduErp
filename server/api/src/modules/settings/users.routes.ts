import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_USERS_ROLES } from "../../lib/roles";
import { createUserSchema } from "@education-erp/validators";
import { sendNotification } from "../../services/notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { logAudit } from "../../lib/audit-log";
import { conflict } from "../../lib/errors";
import { UserRole } from "@education-erp/types";
import { env } from "../../lib/env";

export const usersRouter = Router();
usersRouter.use(authenticate);

function generateTempPassword(): string {
  return `Temp${randomBytes(4).toString("hex")}!1`;
}

function generateStaffUid(): string {
  return `STF-${Date.now().toString(36).toUpperCase()}`;
}

usersRouter.get(
  "/",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const role = req.query.role as UserRole | undefined;
    const users = await prisma.user.findMany({
      where: role ? { role } : undefined,
      select: {
        id: true,
        name_en: true,
        name_bn: true,
        phone: true,
        email: true,
        role: true,
        is_active: true,
        last_login_at: true,
        staff: { select: { id: true, staff_uid: true, designation: true, department_id: true } },
      },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: users });
  }),
);

usersRouter.post(
  "/",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (existing) throw conflict("A user with this phone number already exists");

    const { user, tempPassword } = await prisma.$transaction(async (tx) => {
      // Pre-check above already rejected an existing phone, so this always
      // takes the "create new" branch in practice — same reasoning as staff
      // creation (hr/staff.routes.ts), reusing the shared helper regardless
      // for consistent password generation + the User row itself.
      const login = await createOrLinkPortalLogin(tx, { role: body.role, phone: body.phone, name: body.name_en });
      await tx.staff.create({
        data: {
          user_id: login.userId,
          staff_uid: generateStaffUid(),
          name_en: body.name_en,
          name_bn: body.name_bn,
          designation: body.designation ?? body.role,
          department_id: body.department_id,
        },
      });
      await tx.user.update({ where: { id: login.userId }, data: { email: body.email, name_bn: body.name_bn } });
      const created = await tx.user.findUniqueOrThrow({
        where: { id: login.userId },
        select: { id: true, name_en: true, phone: true, role: true, staff: { select: { id: true, staff_uid: true } } },
      });
      return { user: created, tempPassword: login.tempPassword };
    });

    if (tempPassword) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: body.name_en, phone: body.phone }],
        template_data: { name: body.name_en, phone: body.phone, password: tempPassword, portal_url: env.ADMIN_URL ?? "" },
      });
    }
    res.status(201).json({ success: true, data: user, message: "User created and credentials sent via SMS" });
  }),
);

usersRouter.put(
  "/:id",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const targetId = reqParam(req, "id");
    const body = z.object({ role: z.nativeEnum(UserRole).optional(), is_active: z.boolean().optional() }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: targetId },
      data: { role: body.role, is_active: body.is_active },
    });
    if (body.role) await logAudit("ROLE_CHANGE", { userId: req.user!.sub, targetType: "User", targetId, metadata: { new_role: body.role }, req });
    res.json({ success: true, data: user });
  }),
);

usersRouter.post(
  "/:id/reset-password",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const tempPassword = generateTempPassword();
    const password_hash = await bcrypt.hash(tempPassword, 10);
    const user = await prisma.user.update({
      where: { id: reqParam(req, "id") },
      data: { password_hash },
      select: { phone: true, name_en: true },
    });
    await sendNotification({
      trigger: "PORTAL_LOGIN_CREATED",
      recipients: [{ name: user.name_en, phone: user.phone }],
      template_data: { name: user.name_en, phone: user.phone, password: tempPassword, portal_url: env.ADMIN_URL ?? "" },
    });
    res.json({ success: true, data: { temp_password: tempPassword }, message: "Password reset and SMS sent" });
  }),
);

usersRouter.put(
  "/:id/toggle",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const target = await prisma.user.findUniqueOrThrow({ where: { id: reqParam(req, "id") }, select: { is_active: true } });
    const user = await prisma.user.update({ where: { id: reqParam(req, "id") }, data: { is_active: !target.is_active } });
    res.json({ success: true, data: user });
  }),
);

usersRouter.delete(
  "/:id",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.user.update({ where: { id: reqParam(req, "id") }, data: { is_active: false } });
    res.status(204).send();
  }),
);
