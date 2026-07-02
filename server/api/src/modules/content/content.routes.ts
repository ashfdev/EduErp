import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { reqParam } from "../../lib/req-param";
import { contactSubmitSchema } from "@education-erp/validators";
import { notFound } from "../../lib/errors";
import { sendEmail } from "../../services/email.service";

export const contentRouter = Router();
contentRouter.use(publicEndpointLimiter);

contentRouter.get(
  "/sliders",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const sliders = await prisma.sliderImage.findMany({
      where: {
        is_active: true,
        OR: [
          { publish_from: null, publish_until: null },
          { publish_from: { lte: now }, publish_until: null },
          { publish_from: null, publish_until: { gte: now } },
          { publish_from: { lte: now }, publish_until: { gte: now } },
        ],
      },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: sliders });
  }),
);

contentRouter.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 10);
    const now = new Date();
    const notices = await prisma.notice.findMany({
      where: { is_published: true, is_public_website: true, OR: [{ expire_at: null }, { expire_at: { gte: now } }] },
      orderBy: [{ is_pinned: "desc" }, { publish_at: "desc" }],
      take: limit,
    });
    res.json({ success: true, data: notices });
  }),
);

contentRouter.get(
  "/gallery/albums",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 12);
    const albums = await prisma.galleryAlbum.findMany({
      where: { is_public: true },
      include: { images: { take: 1, orderBy: { display_order: "asc" } } },
      orderBy: { created_at: "desc" },
      take: limit,
    });
    res.json({ success: true, data: albums.map((a) => ({ ...a, cover_url: a.cover_url ?? a.images[0]?.image_url ?? null })) });
  }),
);

contentRouter.get(
  "/gallery/albums/:id/images",
  asyncHandler(async (req, res) => {
    const album = await prisma.galleryAlbum.findFirst({ where: { id: reqParam(req, "id"), is_public: true } });
    if (!album) throw notFound("Album not found");
    const images = await prisma.galleryImage.findMany({ where: { album_id: album.id }, orderBy: { display_order: "asc" } });
    res.json({ success: true, data: { album, images } });
  }),
);

contentRouter.get(
  "/downloads",
  asyncHandler(async (req, res) => {
    const category = req.query.category as string | undefined;
    const downloads = await prisma.download.findMany({
      where: { is_public: true, ...(category && { category: category as never }) },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: downloads });
  }),
);

contentRouter.get(
  "/pages/:page_key",
  asyncHandler(async (req, res) => {
    const page = await prisma.staticPage.findFirst({ where: { page_key: reqParam(req, "page_key"), is_published: true } });
    if (!page) throw notFound("Page not found");
    res.json({ success: true, data: page });
  }),
);

contentRouter.get(
  "/governing-body",
  asyncHandler(async (req, res) => {
    const group = req.query.group as string | undefined;
    const members = await prisma.governingBodyMember.findMany({
      where: { is_active: true, ...(group && { group }) },
      orderBy: { display_order: "asc" },
    });
    res.json({ success: true, data: members });
  }),
);

contentRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const upcoming = req.query.upcoming === "true";
    const limit = Number(req.query.limit ?? 10);
    const events = await prisma.event.findMany({
      where: { is_public: true, ...(upcoming && { date_from: { gte: new Date() } }) },
      orderBy: { date_from: "asc" },
      take: limit,
    });
    res.json({ success: true, data: events });
  }),
);

contentRouter.get(
  "/faculty",
  asyncHandler(async (_req, res) => {
    const staff = await prisma.staff.findMany({
      where: { show_on_website: true, is_active: true, deleted_at: null },
      include: { department: { select: { name_en: true } } },
      orderBy: { name_en: "asc" },
    });
    const grouped: Record<string, typeof staff> = {};
    for (const s of staff) {
      const key = s.department?.name_en ?? "General";
      (grouped[key] ??= []).push(s);
    }
    res.json({ success: true, data: grouped });
  }),
);

contentRouter.get(
  "/admission/open",
  asyncHandler(async (_req, res) => {
    const cycles = await prisma.admissionCycle.findMany({
      where: { is_open: true, is_published: true },
      include: { class: { select: { name_en: true, name_bn: true } } },
    });
    res.json({ success: true, data: cycles });
  }),
);

contentRouter.get(
  "/merit-list/:cycle_id",
  asyncHandler(async (req, res) => {
    const cycleId = reqParam(req, "cycle_id");
    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: cycleId, merit_rank: { not: null }, status: { in: ["SHORTLISTED", "WAITLISTED", "CONFIRMED", "ENROLLED"] } },
      orderBy: { merit_rank: "asc" },
      select: { admission_roll: true, applicant_name: true, merit_rank: true, status: true },
    });
    res.json({ success: true, data: applications });
  }),
);

contentRouter.get(
  "/institution",
  asyncHandler(async (_req, res) => {
    const profile = await prisma.institutionProfile.findUnique({ where: { id: "singleton" } });
    if (!profile) throw notFound("Institution profile not configured");
    res.json({
      success: true,
      data: {
        name_en: profile.name_en,
        name_bn: profile.name_bn,
        tagline_en: profile.tagline_en,
        logo_url: profile.logo_url,
        favicon_url: profile.favicon_url,
        primary_color: profile.primary_color,
        secondary_color: profile.secondary_color,
        address: profile.address,
        phone_primary: profile.phone_primary,
        email_primary: profile.email_primary,
        facebook_url: profile.facebook_url,
        youtube_url: profile.youtube_url,
        map_embed_code: profile.map_embed_code,
        eiin: profile.eiin,
        founded_year: profile.founded_year,
        established_text: profile.established_text,
        mission_text: profile.mission_text,
        vision_text: profile.vision_text,
        principal_name: profile.principal_name,
        principal_designation: profile.principal_designation,
      },
    });
  }),
);

contentRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [students, staff] = await Promise.all([
      prisma.student.count({ where: { deleted_at: null, status: "ACTIVE" } }),
      prisma.staff.count({ where: { is_active: true, deleted_at: null } }),
    ]);
    res.json({ success: true, data: { students, staff } });
  }),
);

contentRouter.get(
  "/jobs",
  asyncHandler(async (_req, res) => {
    const jobs = await prisma.jobPosting.findMany({ where: { is_published: true }, orderBy: { created_at: "desc" } });
    res.json({ success: true, data: jobs });
  }),
);

contentRouter.post(
  "/contact",
  asyncHandler(async (req, res) => {
    const body = contactSubmitSchema.parse(req.body);
    const submission = await prisma.contactSubmission.create({ data: body });

    const institution = await prisma.institutionProfile.findUnique({ where: { id: "singleton" } });
    if (institution?.email_primary) {
      await sendEmail(institution.email_primary, `New contact form submission: ${body.subject ?? "No subject"}`, body.message);
    }

    res.status(201).json({ success: true, data: { id: submission.id } });
  }),
);
