import { Router } from "express";
import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { redis } from "../../lib/redis";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { unauthorized, badRequest, notFound } from "../../lib/errors";
import { sendSms } from "../../services/sms.service";
import { loginLimiter, loginBanGuard, forgotPasswordLimiter } from "../../middleware/rate-limit";
import { logAudit } from "../../lib/audit-log";
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from "@education-erp/validators";

export const authRouter = Router();

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
const OTP_TTL_SECONDS = 600;
const RESET_TOKEN_TTL_SECONDS = 300;

function publicUser(user: { id: string; name_en: string; name_bn: string | null; role: string; phone: string; lang_pref: string }) {
  return { id: user.id, name_en: user.name_en, name_bn: user.name_bn, role: user.role, phone: user.phone, lang_pref: user.lang_pref };
}

authRouter.post(
  "/login",
  loginBanGuard,
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);

    // Portal logins additionally accept a Student ID (student_uid) as the
    // identifier — resolve it to the linked User via Student.user_id first.
    let user = await prisma.user.findFirst({
      where: { OR: [{ phone: body.identifier }, { email: body.identifier }] },
    });
    if (!user && body.portal === "portal") {
      const student = await prisma.student.findUnique({ where: { student_uid: body.identifier } });
      if (student?.user_id) {
        user = await prisma.user.findUnique({ where: { id: student.user_id } });
      }
    }
    if (!user) {
      await logAudit("LOGIN_FAILED", { metadata: { identifier: body.identifier }, req });
      throw unauthorized("Invalid credentials");
    }
    if (!user.is_active) throw unauthorized("Account disabled — contact admin");

    const validPassword = await bcrypt.compare(body.password, user.password_hash);
    if (!validPassword) {
      await logAudit("LOGIN_FAILED", { userId: user.id, metadata: { identifier: body.identifier }, req });
      throw unauthorized("Invalid credentials");
    }

    const access_token = signAccessToken({ sub: user.id, role: user.role, portal: body.portal });
    const refresh_token = signRefreshToken({ sub: user.id });
    await redis.set(`refresh:${refresh_token}`, user.id, "EX", REFRESH_TTL_SECONDS);

    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    await logAudit("LOGIN", { userId: user.id, req });

    res.json({ success: true, data: { access_token, refresh_token, user: publicUser(user) } });
  }),
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = z.object({ refresh_token: z.string().min(1) }).parse(req.body);

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(body.refresh_token);
    } catch {
      throw unauthorized("Invalid or expired refresh token");
    }

    const storedUserId = await redis.get(`refresh:${body.refresh_token}`);
    if (!storedUserId || storedUserId !== payload.sub) throw unauthorized("Refresh token not recognized");

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.is_active) throw unauthorized("Account no longer active");

    await redis.del(`refresh:${body.refresh_token}`);
    const access_token = signAccessToken({ sub: user.id, role: user.role, portal: "admin" });
    const refresh_token = signRefreshToken({ sub: user.id });
    await redis.set(`refresh:${refresh_token}`, user.id, "EX", REFRESH_TTL_SECONDS);

    res.json({ success: true, data: { access_token, refresh_token } });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const body = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
    const userId = await redis.get(`refresh:${body.refresh_token}`);
    await redis.del(`refresh:${body.refresh_token}`);
    if (userId) await logAudit("LOGOUT", { userId, req });
    res.status(204).send();
  }),
);

authRouter.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const userId = req.user!.sub;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const validOld = await bcrypt.compare(body.old_password, user.password_hash);
    if (!validOld) throw badRequest("Old password is incorrect");

    const password_hash = await bcrypt.hash(body.new_password, 10);
    await prisma.user.update({ where: { id: userId }, data: { password_hash } });

    res.json({ success: true, message: "Password changed successfully" });
  }),
);

authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter,
  asyncHandler(async (req, res) => {
    const body = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { phone: body.phone } });
    if (!user) throw notFound("No account found with this phone number");

    const otp = randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);
    await redis.set(`otp:${body.phone}`, hashedOtp, "EX", OTP_TTL_SECONDS);

    await sendSms(body.phone, `Your Education ERP OTP is ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, data: { message: "OTP sent", expires_in: OTP_TTL_SECONDS } });
  }),
);

authRouter.post(
  "/verify-otp",
  asyncHandler(async (req, res) => {
    const body = verifyOtpSchema.parse(req.body);
    const hashedOtp = await redis.get(`otp:${body.phone}`);
    if (!hashedOtp) throw badRequest("OTP expired or not requested");

    const valid = await bcrypt.compare(body.otp, hashedOtp);
    if (!valid) throw badRequest("Invalid OTP");

    await redis.del(`otp:${body.phone}`);
    const reset_token = randomUUID();
    await redis.set(`reset:${reset_token}`, body.phone, "EX", RESET_TOKEN_TTL_SECONDS);

    res.json({ success: true, data: { reset_token } });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const body = resetPasswordSchema.parse(req.body);
    const phone = await redis.get(`reset:${body.reset_token}`);
    if (!phone) throw badRequest("Reset token expired or invalid");

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) throw notFound("Account not found");

    const password_hash = await bcrypt.hash(body.new_password, 10);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash } });
    await redis.del(`reset:${body.reset_token}`);

    await sendSms(phone, "Your password has been reset successfully. If this wasn't you, contact admin immediately.");

    res.json({ success: true, message: "Password reset successfully" });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const institution = await prisma.institutionProfile.findUnique({ where: { id: "singleton" } });
    res.json({ success: true, data: { user: publicUser(user), institution } });
  }),
);
