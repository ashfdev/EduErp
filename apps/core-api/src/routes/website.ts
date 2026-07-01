import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { requirePermission } from '../middleware/permission.js';
import { sendOtp } from '../lib/notify.js';

export const websiteRouter = Router();

websiteRouter.use(requireAuth, requireTenant);

// ── Slider / Banner (PRD §4.1) ────────────────────────────────────
const sliderSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  btnText: z.string().optional(),
  btnLink: z.string().optional(),
  order: z.number().int().optional(),
  publishFrom: z.coerce.date().optional(),
  publishUntil: z.coerce.date().optional(),
});

websiteRouter.get('/sliders', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.sliderImage.findMany({ orderBy: { order: 'asc' } }));
});

websiteRouter.post('/sliders', requirePermission('website', 'write'), async (req, res) => {
  const parsed = sliderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const slide = await req.db!.sliderImage.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(slide);
});

websiteRouter.patch('/sliders/:id', requirePermission('website', 'write'), async (req, res) => {
  const parsed = sliderSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const slide = await req.db!.sliderImage.update({ where: { id: req.params.id as string }, data: parsed.data });
  res.json(slide);
});

websiteRouter.delete('/sliders/:id', requirePermission('website', 'write'), async (req, res) => {
  await req.db!.sliderImage.delete({ where: { id: req.params.id as string } });
  res.status(204).send();
});

// ── Pages / Content (PRD §4.2) ─────────────────────────────────────
const pageSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  titleBn: z.string().optional(),
  bodyHtml: z.string(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImageUrl: z.string().url().optional(),
  isPublished: z.boolean().optional(),
});

websiteRouter.get('/pages', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.page.findMany({ orderBy: { updatedAt: 'desc' } }));
});

websiteRouter.post('/pages', requirePermission('website', 'write'), async (req, res) => {
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const page = await req.db!.page.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(page);
});

websiteRouter.patch('/pages/:id', requirePermission('website', 'write'), async (req, res) => {
  const parsed = pageSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const page = await req.db!.page.update({ where: { id: req.params.id as string }, data: parsed.data });
  res.json(page);
});

// ── Authority messages (PRD §4.3) ──────────────────────────────────
const authorityMessageSchema = z.object({
  name: z.string().min(1),
  designation: z.string().min(1),
  photoUrl: z.string().url().optional(),
  messageBody: z.string().min(1),
  order: z.number().int().optional(),
});

websiteRouter.get('/authority-messages', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.authorityMessage.findMany({ orderBy: { order: 'asc' } }));
});

websiteRouter.post('/authority-messages', requirePermission('website', 'write'), async (req, res) => {
  const parsed = authorityMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const msg = await req.db!.authorityMessage.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(msg);
});

// ── Governing body / committee (PRD §4.4) ─────────────────────────
const committeeMemberSchema = z.object({
  groupName: z.string().min(1),
  name: z.string().min(1),
  designation: z.string().min(1),
  photoUrl: z.string().url().optional(),
  bio: z.string().optional(),
  order: z.number().int().optional(),
});

websiteRouter.get('/committee-members', requirePermission('website', 'read'), async (req, res) => {
  const groupName = typeof req.query.groupName === 'string' ? req.query.groupName : undefined;
  res.json(await req.db!.committeeMember.findMany({ where: groupName ? { groupName } : {}, orderBy: { order: 'asc' } }));
});

websiteRouter.post('/committee-members', requirePermission('website', 'write'), async (req, res) => {
  const parsed = committeeMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const member = await req.db!.committeeMember.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(member);
});

// ── Photo gallery (PRD §4.5) ───────────────────────────────────────
const albumSchema = z.object({
  name: z.string().min(1),
  eventDate: z.coerce.date().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
});

websiteRouter.get('/gallery/albums', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.galleryAlbum.findMany({ include: { images: true }, orderBy: { createdAt: 'desc' } }));
});

websiteRouter.post('/gallery/albums', requirePermission('website', 'write'), async (req, res) => {
  const parsed = albumSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const album = await req.db!.galleryAlbum.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(album);
});

const galleryImageSchema = z.object({ imageUrl: z.string().url(), caption: z.string().optional() });

websiteRouter.post('/gallery/albums/:albumId/images', requirePermission('website', 'write'), async (req, res) => {
  const parsed = galleryImageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const image = await req.db!.galleryImage.create({ data: { ...parsed.data, albumId: req.params.albumId as string } });
  res.status(201).json(image);
});

// ── Notice board + Daily Notification (PRD §4.6) ──────────────────
const noticeSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(['PUBLIC', 'STUDENTS', 'STAFF', 'GUARDIANS']),
  attachmentUrl: z.string().url().optional(),
  isPinned: z.boolean().optional(),
  isDailyNotification: z.boolean().optional(),
  expireAt: z.coerce.date().optional(),
  isPublishedWebsite: z.boolean().optional(),
  sendSms: z.boolean().optional(),
});

websiteRouter.get('/notices', requirePermission('website', 'read'), async (req, res) => {
  const audience = typeof req.query.audience === 'string' ? req.query.audience : undefined;
  res.json(
    await req.db!.notice.findMany({
      where: audience ? { audience: audience as never } : {},
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
    }),
  );
});

websiteRouter.post('/notices', requirePermission('website', 'write'), async (req, res) => {
  const parsed = noticeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

  const notice = await req.db!.notice.create({ data: { ...parsed.data, tenantId: req.tenantId!, createdBy: req.user!.sub } });

  // SMS blast (PRD §4.6) — reuses the same notify stub as fees/exams; wires to
  // a real SMS provider once one exists (ROADMAP.md "External accounts").
  if (parsed.data.sendSms) {
    const guardians = await req.db!.guardian.findMany({ where: { students: { some: { tenantId: req.tenantId! } } } });
    for (const g of guardians) {
      if (g.phone) await sendOtp(g.phone, `${parsed.data.title}: ${parsed.data.body}`, 'notice blast');
    }
  }

  res.status(201).json(notice);
});

websiteRouter.patch('/notices/:id', requirePermission('website', 'write'), async (req, res) => {
  const parsed = noticeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const notice = await req.db!.notice.update({ where: { id: req.params.id as string }, data: parsed.data });
  res.json(notice);
});

websiteRouter.delete('/notices/:id', requirePermission('website', 'write'), async (req, res) => {
  await req.db!.notice.delete({ where: { id: req.params.id as string } });
  res.status(204).send();
});

// ── Download section (PRD §4.7) ────────────────────────────────────
const downloadSchema = z.object({
  title: z.string().min(1),
  category: z.enum(['SYLLABUS', 'FORMS', 'RESULTS', 'CIRCULARS', 'OTHERS']),
  fileUrl: z.string().url(),
  academicYear: z.string().optional(),
  isPublic: z.boolean().optional(),
});

websiteRouter.get('/downloads', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.downloadFile.findMany({ orderBy: { createdAt: 'desc' } }));
});

websiteRouter.post('/downloads', requirePermission('website', 'write'), async (req, res) => {
  const parsed = downloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const file = await req.db!.downloadFile.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(file);
});

// ── Events / academic calendar (PRD §4.10) ────────────────────────
const eventSchema = z.object({
  name: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  type: z.enum(['HOLIDAY', 'EXAM', 'CULTURAL', 'SPORTS', 'PARENT_MEETING']),
});

websiteRouter.get('/events', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.schoolEvent.findMany({ orderBy: { startDate: 'asc' } }));
});

websiteRouter.post('/events', requirePermission('website', 'write'), async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const event = await req.db!.schoolEvent.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(event);
});

// ── Contact & social settings (PRD §4.14) ─────────────────────────
const contactSettingsSchema = z.object({
  address: z.string().optional(),
  contactPhones: z.array(z.string()).optional(),
  contactEmails: z.array(z.string().email()).optional(),
  mapEmbedCode: z.string().optional(),
  facebookUrl: z.string().url().optional(),
  youtubeUrl: z.string().url().optional(),
  twitterUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
});

websiteRouter.patch('/contact-settings', requirePermission('website', 'manage'), async (req, res) => {
  const parsed = contactSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
  const tenant = await req.db!.tenant.update({ where: { id: req.tenantId! }, data: parsed.data });
  res.json(tenant);
});

websiteRouter.get('/contact-messages', requirePermission('website', 'read'), async (req, res) => {
  res.json(await req.db!.contactMessage.findMany({ orderBy: { createdAt: 'desc' } }));
});

websiteRouter.patch('/contact-messages/:id/read', requirePermission('website', 'write'), async (req, res) => {
  const msg = await req.db!.contactMessage.update({ where: { id: req.params.id as string }, data: { isRead: true } });
  res.json(msg);
});
