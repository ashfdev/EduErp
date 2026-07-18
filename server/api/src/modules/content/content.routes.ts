import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { contentLimiter } from "../../middleware/rate-limit";
import { cached } from "../../lib/cache";
import { reqParam } from "../../lib/req-param";
import { contactSubmitSchema } from "@education-erp/validators";
import { notFound } from "../../lib/errors";
import { sendEmail } from "../../services/email.service";
import { renderDocument } from "../../services/pdf.service";

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

// Institution-branded PDF of a published notice — same public/no-auth
// posture as the /notices list itself (a notice on the public website is
// public content); scoped to is_published+is_public_website exactly like
// that list, so a draft or staff-only notice can never be reached this way
// even by guessing an id.
contentRouter.get(
  "/notices/:id/pdf",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const notice = await prisma.notice.findFirst({ where: { id, is_published: true, is_public_website: true } });
    if (!notice) throw notFound("Notice not found");

    const pdf = await renderDocument("NOTICE", {
      title: notice.title,
      body: notice.body,
      publish_at: notice.publish_at,
      include_signature: notice.include_signature,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="notice-${id}.pdf"`);
    res.send(pdf);
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

// Public-safe field set — deliberately excludes nid/tin/phone/email/
// biometric_id/salary_structure_id and every other sensitive Staff field.
// The route previously had no `select` at all (a real data-exposure gap
// found while extending this route for per-faculty profile pages) — every
// scalar field, including NID/TIN, was being returned to anyone.
const FACULTY_PUBLIC_SELECT = {
  id: true,
  name_en: true,
  name_bn: true,
  designation: true,
  photo_url: true,
  qualifications: true,
  achievements: true,
  publications: true,
  department: { select: { name_en: true } },
} as const;

contentRouter.get(
  "/faculty",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("faculty"), CONTENT_CACHE_TTL_SECONDS, async () => {
      const staff = await prisma.staff.findMany({
        where: { show_on_website: true, is_active: true, deleted_at: null },
        select: FACULTY_PUBLIC_SELECT,
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
  "/faculty/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const data = await cached(contentCacheKey(`faculty:${id}`), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.staff.findFirst({
        where: { id, show_on_website: true, is_active: true, deleted_at: null },
        select: FACULTY_PUBLIC_SELECT,
      }),
    );
    if (!data) throw notFound("Faculty member not found");
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
      const [profile, config, attendanceRules] = await Promise.all([
        prisma.institutionProfile.findUnique({ where: { id: "singleton" } }),
        prisma.institutionConfig.findUnique({ where: { id: "singleton" } }),
        prisma.attendanceRules.findUnique({ where: { id: "singleton" } }),
      ]);
      if (!profile) return null;
      return {
        type: profile.type,
        has_semesters: config?.has_semesters ?? false,
        // Sat-Thu default (Friday off) — matches the same fallback the
        // routine auto-generator uses when this hasn't been explicitly set.
        working_days: (attendanceRules?.working_days as number[] | null) ?? [0, 1, 2, 3, 4, 6],
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

// Public, read-only — Department/Program listing for university-type
// institutions. Confirmed no such route existed anywhere: Program/Course
// data was only ever exposed via authenticated /api/settings/* routes.
// Deliberately minimal (name, code, duration, total credit hours) — no
// student data, no internal ids beyond what's needed to link out.
contentRouter.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("departments"), CONTENT_CACHE_TTL_SECONDS, async () => {
      // Curriculum breakdown (courses per program, grouped by semester on
      // the frontend) is nested directly rather than requiring a second
      // request per program — realistic program/course counts for a single
      // institution are small enough that this is cheap.
      const programSelect = {
        id: true,
        name_en: true,
        name_bn: true,
        code: true,
        duration_semesters: true,
        total_credit_hours: true,
        degree_level: true,
        courses: {
          where: { is_active: true },
          select: { id: true, semester_number: true, code: true, name_en: true, credit_hours: true, course_type: true },
          orderBy: [{ semester_number: "asc" as const }, { code: "asc" as const }],
        },
      };
      const departments = await prisma.department.findMany({
        where: { is_active: true },
        include: {
          programs: { where: { is_active: true }, select: programSelect, orderBy: { name_en: "asc" } },
        },
        orderBy: { name_en: "asc" },
      });
      // Programs with no department (department_id: null) still need to be
      // publicly listed — surfaced as a synthetic "General" group rather
      // than silently dropped.
      const unassigned = await prisma.program.findMany({
        where: { is_active: true, department_id: null },
        select: programSelect,
        orderBy: { name_en: "asc" },
      });
      return { departments, unassigned_programs: unassigned };
    });
    res.json({ success: true, data });
  }),
);

contentRouter.get(
  "/important-links",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("important-links"), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.importantLink.findMany({ where: { is_active: true }, orderBy: { display_order: "asc" }, select: { id: true, title: true, url: true } }),
    );
    res.json({ success: true, data });
  }),
);

// Public, id+name only — the class/section/group picker for the public
// Class Routine viewer below. Deliberately no counts/capacity/teacher data,
// unlike the authenticated /api/settings/classes this otherwise mirrors.
contentRouter.get(
  "/classes",
  asyncHandler(async (_req, res) => {
    const data = await cached(contentCacheKey("classes"), CONTENT_CACHE_TTL_SECONDS, async () => {
      const classes = await prisma.class.findMany({
        include: {
          sections: { where: { is_active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
          groups: { where: { is_active: true }, select: { id: true, name_en: true }, orderBy: { display_order: "asc" } },
        },
        orderBy: { numeric_level: "asc" },
      });
      return classes.map((c) => ({ id: c.id, name_en: c.name_en, sections: c.sections, groups: c.groups }));
    });
    res.json({ success: true, data });
  }),
);

// Public class/section(/group) routine grid — same shape and same
// shared(group:null)+own-group filter the portal's own routine view uses,
// just keyed by explicit query params instead of a logged-in student's
// current_class_id, so any visitor can look up any published class's
// schedule without needing a portal login.
contentRouter.get(
  "/routine",
  asyncHandler(async (req, res) => {
    const query = z.object({ class_id: z.string().min(1), section_id: z.string().optional(), group_id: z.string().optional() }).parse(req.query);
    const cacheKey = `routine:${query.class_id}:${query.section_id ?? ""}:${query.group_id ?? ""}`;
    const data = await cached(contentCacheKey(cacheKey), CONTENT_CACHE_TTL_SECONDS, () =>
      prisma.routineSlot.findMany({
        where: {
          class_id: query.class_id,
          ...(query.section_id && { OR: [{ section_id: query.section_id }, { section_id: null }] }),
          AND: [{ OR: [{ group_id: query.group_id ?? null }, { group_id: null }] }],
        },
        include: { subject: { select: { name_en: true } }, teacher: { select: { name_en: true } } },
        orderBy: [{ day_of_week: "asc" }, { period_no: "asc" }],
      }),
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
