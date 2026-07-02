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
import { sendSms } from "../../services/sms.service";
import { conflict } from "../../lib/errors";
import { UserRole } from "@education-erp/types";

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

    const tempPassword = generateTempPassword();
    const password_hash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name_en: body.name_en,
        name_bn: body.name_bn,
        phone: body.phone,
        email: body.email,
        role: body.role,
        password_hash,
        staff: {
          create: {
            staff_uid: generateStaffUid(),
            name_en: body.name_en,
            name_bn: body.name_bn,
            designation: body.designation ?? body.role,
            department_id: body.department_id,
          },
        },
      },
      select: { id: true, name_en: true, phone: true, role: true, staff: { select: { id: true, staff_uid: true } } },
    });

    await sendSms(body.phone, `Your account has been created. Temporary password: ${tempPassword}`);
    res.status(201).json({ success: true, data: user, message: "User created and credentials sent via SMS" });
  }),
);

usersRouter.put(
  "/:id",
  authorize(SETTINGS_USERS_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ role: z.nativeEnum(UserRole).optional(), is_active: z.boolean().optional() }).parse(req.body);
    const user = await prisma.user.update({
      where: { id: reqParam(req, "id") },
      data: { role: body.role, is_active: body.is_active },
    });
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
      select: { phone: true },
    });
    await sendSms(user.phone, `Your password has been reset. Temporary password: ${tempPassword}`);
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
