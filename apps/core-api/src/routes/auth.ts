import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { sendOtp } from '../lib/notify.js';
import { generateTotpSecret, generateTotpUri, verifyTotpCode } from '../lib/totp.js';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().min(1), // email, phone, or studentUid
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
  }

  const { identifier, password, totpCode } = parsed.data;

  // Students log in with their Student ID, not email/phone (PRD §5.9) — most
  // don't have either on file. Staff/admin still use email or phone.
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { phone: identifier },
        { student: { studentUid: identifier } },
        { staff: { staffUid: identifier } },
      ],
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.totpEnabled) {
    if (!totpCode) {
      return res.status(401).json({ error: '2FA code required', requiresTotp: true });
    }
    if (!user.totpSecret || !(await verifyTotpCode(totpCode, user.totpSecret))) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }
  }

  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });
  const refreshToken = signRefreshToken(user.id);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      userAgent: req.headers['user-agent'] ?? null,
      ipAddress: req.ip,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, tenantId: user.tenantId, action: 'auth.login' },
  });

  return res.json({ accessToken, refreshToken, user: { id: user.id, name: user.name, role: user.role } });
});

authRouter.post('/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken as string | undefined;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  const session = await prisma.session.findUnique({ where: { refreshToken } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Session expired or revoked' });
  }

  try {
    verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const accessToken = signAccessToken({ sub: user.id, tenantId: user.tenantId, role: user.role });

  return res.json({ accessToken });
});

// Session/device management (gap-fix, §1.A): list + revoke *own* active sessions.
// requireAuth here matters — without it, anyone could enumerate/revoke any user's
// sessions by guessing a userId or session id.
authRouter.get('/sessions', requireAuth, async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.user!.sub, revokedAt: null },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(sessions);
});

authRouter.post('/sessions/:id/revoke', requireAuth, async (req, res) => {
  const session = await prisma.session.findUnique({ where: { id: req.params.id as string } });
  if (!session || session.userId !== req.user!.sub) {
    return res.status(404).json({ error: 'Session not found' });
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  return res.status(204).send();
});

// ── Forgot / reset password (gap-fix) ─────────────────────────────
// Always returns 200 with the same generic message regardless of whether the
// identifier matched a user — avoids leaking which emails/phones are registered.
authRouter.post('/forgot-password', async (req, res) => {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier : undefined;
  if (!identifier) return res.status(400).json({ error: 'identifier is required' });

  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone: identifier }] } });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });

    await sendOtp(user.email ?? user.phone ?? user.id, rawToken, 'password reset');
  }

  return res.json({ message: 'If that account exists, a reset link has been sent.' });
});

authRouter.post('/reset-password', async (req, res) => {
  const parsed = z.object({ token: z.string().min(1), newPassword: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId: resetToken.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  return res.status(204).send();
});

// ── Super Admin impersonation (gap-fix: PRD grants it but never logs it) ─────
authRouter.post('/impersonate', requireAuth, async (req, res) => {
  if (req.user!.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Only Super Admin can impersonate' });
  }

  const parsed = z
    .object({ targetUserId: z.string().min(1), reason: z.string().min(10) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'targetUserId and a reason (min 10 chars) are required', details: parsed.error.flatten() });
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data.targetUserId } });
  if (!target) return res.status(404).json({ error: 'Target user not found' });

  const accessToken = signAccessToken({
    sub: target.id,
    tenantId: target.tenantId,
    role: target.role,
    impersonatedBy: req.user!.sub,
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.sub,
      tenantId: target.tenantId,
      action: 'impersonation.start',
      entityType: 'User',
      entityId: target.id,
      metadata: { reason: parsed.data.reason },
    },
  });

  // Short-lived, no refresh token — an impersonation session shouldn't outlive one work session.
  return res.json({ accessToken, impersonating: { id: target.id, name: target.name, role: target.role } });
});

// ── 2FA / TOTP (gap-fix) ───────────────────────────────────────────
authRouter.post('/2fa/setup', requireAuth, async (req, res) => {
  const secret = generateTotpSecret();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

  // Not yet enabled — stored pending confirmation via /2fa/verify, so a user who
  // never completes setup doesn't get silently locked into a broken 2FA state.
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabled: false } });

  const otpauthUrl = generateTotpUri(user.email ?? user.phone ?? user.id, secret);
  return res.json({ secret, otpauthUrl });
});

authRouter.post('/2fa/verify', requireAuth, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : undefined;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

  if (!code || !user.totpSecret || !(await verifyTotpCode(code, user.totpSecret))) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  return res.status(204).send();
});

authRouter.post('/2fa/disable', requireAuth, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Current password required to disable 2FA' });
  }

  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  return res.status(204).send();
});
