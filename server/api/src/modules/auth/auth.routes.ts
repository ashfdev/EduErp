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
import { loginLimiter, loginBanGuard, loginAccountLimiter, forgotPasswordLimiter, otpVerifyLimiter } from "../../middleware/rate-limit";
import { logAudit } from "../../lib/audit-log";
import { registerRefreshToken, unregisterRefreshToken, revokeAllRefreshTokensForUser } from "../../lib/refresh-session";
import { PORTAL_ROLES } from "../../lib/roles";
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

function publicUser(user: {
  id: string;
  name_en: string;
  name_bn: string | null;
  role: string;
  phone: string;
  lang_pref: string;
  must_change_password: boolean;
}) {
  return {
    id: user.id,
    name_en: user.name_en,
    name_bn: user.name_bn,
    role: user.role,
    phone: user.phone,
    lang_pref: user.lang_pref,
    must_change_password: user.must_change_password,
  };
}

authRouter.post(
  "/login",
  loginBanGuard,
  loginLimiter,
  // Per-account throttle layered alongside the IP-based one above — closes
  // the gap where an attacker rotating IPs faced zero throttling against
  // one specific victim account (security audit, 2026-08-09).
  loginAccountLimiter,
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

    // The token's own `portal` claim is always derived from the user's real
    // role, never trusted verbatim from the client — `body.portal` still
    // drives the login lookup above (resolving a student_uid), but a
    // STUDENT/GUARDIAN account can't get a portal:"admin" claim just by
    // requesting one. Same derivation /refresh uses below, so the two can
    // never disagree about what portal a given account belongs to.
    const portal = PORTAL_ROLES.includes(user.role) ? "portal" : "admin";
    const access_token = signAccessToken({ sub: user.id, role: user.role, portal });
    const refresh_token = signRefreshToken({ sub: user.id });
    await redis.set(`refresh:${refresh_token}`, user.id, "EX", REFRESH_TTL_SECONDS);
    await registerRefreshToken(user.id, refresh_token);

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
    await unregisterRefreshToken(user.id, body.refresh_token);
    // Same role-derived portal claim as /login — was previously hardcoded
    // to "admin" regardless of which portal the session actually belonged
    // to, so a STUDENT/GUARDIAN session got re-minted with an admin-portal
    // claim on every token refresh.
    const portal = PORTAL_ROLES.includes(user.role) ? "portal" : "admin";
    const access_token = signAccessToken({ sub: user.id, role: user.role, portal });
    const refresh_token = signRefreshToken({ sub: user.id });
    await redis.set(`refresh:${refresh_token}`, user.id, "EX", REFRESH_TTL_SECONDS);
    await registerRefreshToken(user.id, refresh_token);

    res.json({ success: true, data: { access_token, refresh_token } });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const body = z.object({ refresh_token: z.string().min(1) }).parse(req.body);
    const userId = await redis.get(`refresh:${body.refresh_token}`);
    await redis.del(`refresh:${body.refresh_token}`);
    if (userId) {
      await unregisterRefreshToken(userId, body.refresh_token);
      await logAudit("LOGOUT", { userId, req });
    }
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

    const password_hash = await bcrypt.hash(body.new_password, 12);
    await prisma.user.update({ where: { id: userId }, data: { password_hash, must_change_password: false } });
    // Real gap fixed (security audit, 2026-08-09): a refresh token issued
    // before this change previously stayed valid for up to its full 7-day
    // life even after the account owner deliberately changed their
    // password — closing exactly the scenario a password change is meant
    // to protect against (a stolen credential). This account's OTHER
    // active sessions are now force-logged-out too, not just this one.
    await revokeAllRefreshTokensForUser(userId);

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
    const hashedOtp = await bcrypt.hash(otp, 12);
    await redis.set(`otp:${body.phone}`, hashedOtp, "EX", OTP_TTL_SECONDS);

    await sendSms(body.phone, `Your Education ERP OTP is ${otp}. It expires in 10 minutes.`);

    res.json({ success: true, data: { message: "OTP sent", expires_in: OTP_TTL_SECONDS } });
  }),
);

authRouter.post(
  "/verify-otp",
  otpVerifyLimiter,
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

    const password_hash = await bcrypt.hash(body.new_password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash, must_change_password: false } });
    await redis.del(`reset:${body.reset_token}`);
    // Same reasoning as /change-password: a password reset is exactly the
    // scenario where any already-issued refresh token (possibly the very
    // thing that made the reset necessary) must not survive it.
    await revokeAllRefreshTokensForUser(user.id);

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

// Single source of truth for UI language across the 3 non-routed apps
// (admin/portal/teacher) — sendNotification() already keys its bilingual
// templates off this same field, so the toggle reads/writes it directly
// rather than introducing a second, parallel preference.
authRouter.put(
  "/lang",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = z.object({ lang_pref: z.enum(["EN", "BN"]) }).parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.sub }, data: body });
    res.json({ success: true, data: { lang_pref: user.lang_pref } });
  }),
);
