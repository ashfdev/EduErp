import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { generateChallenge, verifyChallenge } from '../lib/captcha.js';

export const contentRouter = Router();

// Public, no auth — this whole router is the public-site's read surface plus
// the contact-form write. Rate-limited since none of it requires a login
// (gap-fix, plan §1.A "CAPTCHA + rate-limiting on public endpoints").
contentRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));

function tenantIdFrom(req: { query: Record<string, unknown> }): string | undefined {
  return typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined;
}

contentRouter.get('/tenant', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      nameEn: true, nameBn: true, tagline: true, logoUrl: true, faviconUrl: true, eiin: true,
      address: true, contactPhones: true, contactEmails: true, mapEmbedCode: true,
      facebookUrl: true, youtubeUrl: true, twitterUrl: true, linkedinUrl: true,
    },
  });
  if (!tenant) return res.status(404).json({ error: 'Institution not found' });
  return res.json(tenant);
});

contentRouter.get('/sliders', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const now = new Date();
  const slides = await prisma.sliderImage.findMany({
    where: {
      tenantId, isActive: true,
      OR: [{ publishFrom: null }, { publishFrom: { lte: now } }],
    },
    orderBy: { order: 'asc' },
  });
  // publishUntil filtering done in JS — mixing null-or-future in one Prisma OR is awkward alongside the publishFrom OR above.
  return res.json(slides.filter((s) => !s.publishUntil || s.publishUntil >= now));
});

contentRouter.get('/pages/:slug', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const page = await prisma.page.findFirst({ where: { tenantId, slug: req.params.slug as string, isPublished: true } });
  if (!page) return res.status(404).json({ error: 'Page not found' });
  return res.json(page);
});

contentRouter.get('/notices', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const now = new Date();
  const notices = await prisma.notice.findMany({
    where: {
      tenantId, audience: 'PUBLIC', isPublishedWebsite: true,
      publishAt: { lte: now },
      OR: [{ expireAt: null }, { expireAt: { gte: now } }],
    },
    orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
  });
  return res.json(notices);
});

contentRouter.get('/gallery', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const albums = await prisma.galleryAlbum.findMany({ where: { tenantId, isPublic: true }, include: { images: true }, orderBy: { createdAt: 'desc' } });
  return res.json(albums);
});

contentRouter.get('/downloads', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const files = await prisma.downloadFile.findMany({ where: { tenantId, isPublic: true }, orderBy: { createdAt: 'desc' } });
  return res.json(files);
});

contentRouter.get('/faculty', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

  const staff = await prisma.staff.findMany({
    where: { tenantId, showOnWebsite: true },
    include: { user: { select: { name: true, email: true } }, department: true },
  });
  return res.json(staff.map((s) => ({
    name: s.user.name, designation: s.designation, department: s.department?.name ?? null,
    qualification: s.qualification, photoUrl: s.photoUrl, email: s.user.email,
  })));
});

contentRouter.get('/authority-messages', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
  res.json(await prisma.authorityMessage.findMany({ where: { tenantId, isActive: true }, orderBy: { order: 'asc' } }));
});

contentRouter.get('/committee', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
  const groupName = typeof req.query.groupName === 'string' ? req.query.groupName : undefined;
  res.json(await prisma.committeeMember.findMany({ where: { tenantId, ...(groupName ? { groupName } : {}) }, orderBy: { order: 'asc' } }));
});

contentRouter.get('/events', async (req, res) => {
  const tenantId = tenantIdFrom(req);
  if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });
  res.json(await prisma.schoolEvent.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } }));
});

// ── CAPTCHA + contact form (gap-fix) ───────────────────────────────
contentRouter.get('/captcha', (_req, res) => {
  res.json(generateChallenge());
});

const contactSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  message: z.string().min(5),
  challengeId: z.string().min(1),
  captchaAnswer: z.number(),
});

contentRouter.post('/contact', async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  if (!verifyChallenge(parsed.data.challengeId, parsed.data.captchaAnswer)) {
    return res.status(400).json({ error: 'Incorrect or expired CAPTCHA answer' });
  }

  const { tenantId, challengeId: _c, captchaAnswer: _a, ...rest } = parsed.data;
  void _c;
  void _a;
  const message = await prisma.contactMessage.create({ data: { ...rest, tenantId } });
  return res.status(201).json({ id: message.id });
});
