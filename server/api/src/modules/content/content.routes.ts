import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { contentLimiter } from "../../middleware/rate-limit";
import { cached } from "../../lib/cache";
import { reqParam } from "../../lib/req-param";
import { contactSubmitSchema } from "@education-erp/validators";
import { notFound } from "../../lib/errors";
import { sendEmail } from "../../services/email.service";

export const contentRouter = Router();
contentRouter.use(contentLimiter);

// Shared prefix for every cache key this router writes, so
// revalidate.service.ts can wipe the whole namespace in one call whenever
// any content-mutating admin action fires ISR revalidation.
export const CONTENT_CACHE_PREFIX = "content-cache:";
const CONTENT_CACHE_TTL_SECONDS = 300;

function contentCacheKey(suffix: string): string {
  return `${CONTENT_CACHE_PREFIX}${suffix}`;
}

contentRouter.get(
  "/sliders",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("sliders"), CONTENT_CACHE_TTL_SECONDS, async () => {
      const now = new Date();
      return prisma.sliderImage.findMany({
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
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/notices",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 10);
    const data = await cached(contentCacheKey(`notices:${limit}`), CONTENT_CACHE_TTL_SECONDS, async () => {
      const now = new Date();
      return prisma.notice.findMany({
        where: { is_published: true, is_public_website: true, OR: [{ expire_at: null }, { expire_at: { gte: now } }] },
        orderBy: [{ is_pinned: "desc" }, { publish_at: "desc" }],
        take: limit,
      });
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/gallery/albums",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 12);
    const data = await cached(contentCacheKey(`gallery-albums:${limit}`), CONTENT_CACHE_TTL_SECONDS, async () => {
      const albums = await prisma.galleryAlbum.findMany({
        where: { is_public: true },
        include: { images: { take: 1, orderBy: { display_order: "asc" } } },
        orderBy: { created_at: "desc" },
        take: limit,
      });
      return albums.map((a) => ({ ...a, cover_url: a.cover_url ?? a.images[0]?.image_url ?? null }));
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/gallery/albums/:id/images",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const data = await cached(contentCacheKey(`gallery-images:${id}`), CONTENT_CACHE_TTL_SECONDS, async () => {
      const album = await prisma.galleryAlbum.findFirst({ where: { id, is_public: true } });
      if (!album) return null;
      const images = await prisma.galleryImage.findMany({ where: { album_id: album.id }, orderBy: { display_order: "asc" } });
      return { album, images };
    });
    if (!data) throw notFound("Album not found");
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/downloads",
  asyncHandler(async (req, res) => {
    const category = req.query.category as string | undefined;
    const data = await cached(contentCacheKey(`downloads:${category ?? "all"}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.download.findMany({
        where: { is_public: true, ...(category && { category: category as never }) },
        orderBy: { created_at: "desc" },
      }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/pages/:page_key",
  asyncHandler(async (req, res) => {
    const pageKey = reqParam(req, "page_key");
    const data = await cached(contentCacheKey(`page:${pageKey}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.staticPage.findFirst({ where: { page_key: pageKey, is_published: true } }),
    );
    if (!data) throw notFound("Page not found");
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/governing-body",
  asyncHandler(async (req, res) => {
    const group = req.query.group as string | undefined;
    const data = await cached(contentCacheKey(`governing-body:${group ?? "all"}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.governingBodyMember.findMany({
        where: { is_active: true, ...(group && { group }) },
        orderBy: { display_order: "asc" },
      }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const upcoming = req.query.upcoming === "true";
    const limit = Number(req.query.limit ?? 10);
    const type = req.query.type as string | undefined;
    const data = await cached(contentCacheKey(`events:${upcoming}:${limit}:${type ?? "all"}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.event.findMany({
        where: { is_public: true, ...(upcoming && { date_from: { gte: new Date() } }), ...(type && { type }) },
        orderBy: { date_from: "asc" },
        take: limit,
      }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/faculty",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("faculty"), CONTENT_CACHE_TTL_SECONDS, async () => {
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
      return grouped;
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/admission/open",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("admission-open"), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.admissionCycle.findMany({
        where: { is_open: true, is_published: true },
        include: { class: { select: { name_en: true, name_bn: true } } },
      }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/merit-list/:cycle_id",
  asyncHandler(async (req, res) => {
    const cycleId = reqParam(req, "cycle_id");
    const data = await cached(contentCacheKey(`merit-list:${cycleId}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.admissionApplication.findMany({
        where: { cycle_id: cycleId, merit_rank: { not: null }, status: { in: ["SHORTLISTED", "WAITLISTED", "CONFIRMED", "ENROLLED"] } },
        orderBy: { merit_rank: "asc" },
        select: { admission_roll: true, applicant_name: true, merit_rank: true, status: true },
      }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/institution",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("institution"), CONTENT_CACHE_TTL_SECONDS, async () => {
      const [profile, config] = await Promise.all([
        prisma.institutionProfile.findUnique({ where: { id: "singleton" } }),
        prisma.institutionConfig.findUnique({ where: { id: "singleton" } }),
      ]);
      if (!profile) return null;
      return {
        type: profile.type,
        has_semesters: config?.has_semesters ?? false,
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
      };
    });
    if (!data) throw notFound("Institution profile not configured");
    res.json({ success: true, data });
  }),
);

// Public, read-only, id+name only — ExamTypeConfig/AcademicYear are
// otherwise only exposed via authenticated /api/settings/* routes. Needed
// so the public result-lookup page can offer an exam-type + year selector
// for school/college/madrasah institutions without leaking anything beyond
// the reusable template names admins already configured.
contentRouter.get(
  "/exam-types",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("exam-types"), CONTENT_CACHE_TTL_SECONDS, async () =>
      prisma.examTypeConfig.findMany({ where: { is_active: true }, select: { id: true, name: true }, orderBy: { display_order: "asc" } }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/academic-years",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("academic-years"), CONTENT_CACHE_TTL_SECONDS, async () =>
      prisma.academicYear.findMany({ select: { id: true, label: true, is_active: true }, orderBy: { start_date: "desc" } }),
    );
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("stats"), CONTENT_CACHE_TTL_SECONDS, async () => {
      const [students, staff] = await Promise.all([
        prisma.student.count({ where: { deleted_at: null, status: "ACTIVE" } }),
        prisma.staff.count({ where: { is_active: true, deleted_at: null } }),
      ]);
      return { students, staff };
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/jobs",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("jobs"), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.jobPosting.findMany({ where: { is_published: true }, orderBy: { created_at: "desc" } }),
    );
    res.json({ success: true, data });
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
