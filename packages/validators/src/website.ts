import { z } from "zod";

export const sliderSchema = z.object({
  image_url: z.string().min(1),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  btn_text: z.string().optional(),
  btn_link: z.string().optional(),
  publish_from: z.coerce.date().optional().nullable(),
  publish_until: z.coerce.date().optional().nullable(),
});

export const sliderReorderSchema = z.array(z.object({ id: z.string().min(1), display_order: z.number().int() }));

export const noticeAudienceSchema = z.enum(["PUBLIC", "STUDENTS", "STAFF", "GUARDIANS", "ALL"]);

export const noticeSchema = z.object({
  title: z.string().min(1),
  // Optional at the schema level — a notice can instead be an uploaded
  // document with just a title, checked at the route level (either body
  // content or an attachment must be present, not both required).
  body: z.string().default(""),
  attachment_url: z.string().optional().nullable(),
  audience: noticeAudienceSchema.default("PUBLIC"),
  include_signature: z.boolean().default(false),
  is_pinned: z.boolean().default(false),
  is_public_website: z.boolean().default(true),
  send_sms: z.boolean().default(false),
  publish_at: z.coerce.date().optional().nullable(),
  expire_at: z.coerce.date().optional().nullable(),
});

export const galleryAlbumSchema = z.object({
  name: z.string().min(1),
  date: z.coerce.date().optional().nullable(),
  description: z.string().optional(),
  is_public: z.boolean().default(true),
});

export const galleryImageReorderSchema = z.array(z.object({ id: z.string().min(1), display_order: z.number().int() }));

export const downloadCategorySchema = z.enum(["SYLLABUS", "EXAM_SCHEDULE", "CLASS_ROUTINE", "ACADEMIC_CALENDAR", "FORMS", "RESULTS", "CIRCULARS", "OTHERS"]);

export const downloadMetaSchema = z.object({
  title: z.string().min(1),
  category: downloadCategorySchema,
  academic_year_id: z.string().optional().nullable(),
  is_public: z.boolean().default(true),
});

export const staticPageSchema = z.object({
  title_en: z.string().optional(),
  title_bn: z.string().optional(),
  content_en: z.string().optional(),
  content_bn: z.string().optional(),
  meta_title: z.string().optional(),
  meta_desc: z.string().optional(),
  is_published: z.boolean().default(true),
});

export const governingBodyMemberSchema = z.object({
  name: z.string().min(1),
  designation: z.string().min(1),
  group: z.string().default("Governing Body"),
  bio: z.string().optional(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const governingBodyReorderSchema = z.array(z.object({ id: z.string().min(1), display_order: z.number().int() }));

export const importantLinkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export const eventSchema = z.object({
  name: z.string().min(1),
  date_from: z.coerce.date(),
  date_to: z.coerce.date().optional().nullable(),
  type: z.string().default("GENERAL"),
  description: z.string().optional(),
  is_public: z.boolean().default(true),
});

export const contactSubmitSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(1),
});
