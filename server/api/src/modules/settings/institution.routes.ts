import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { upload } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { SETTINGS_INSTITUTION_ROLES } from "../../lib/roles";
import { institutionProfileSchema, institutionConfigSchema } from "@education-erp/validators";
import { badRequest } from "../../lib/errors";
import type { InstitutionType } from "@education-erp/types";

export const institutionRouter = Router();
export const institutionConfigRouter = Router();

const PROFILE_ID = "singleton";
const CONFIG_ID = "singleton";

const TYPE_CASCADE: Record<InstitutionType, Record<string, unknown>> = {
  SCHOOL: { term_class: "Class", term_teacher: "Teacher", term_principal: "Headmaster", has_shifts: true, has_departments: false, has_semesters: false, show_hijri_calendar: false, extra_course_enrollment: false },
  COLLEGE: { term_class: "Class", term_teacher: "Teacher", term_principal: "Principal", has_shifts: true, has_departments: false, has_semesters: false, show_hijri_calendar: false, extra_course_enrollment: false },
  UNIVERSITY: { term_class: "Semester", term_section: "Batch", term_teacher: "Professor", term_principal: "Vice Chancellor", has_shifts: false, has_departments: true, has_semesters: true, extra_course_enrollment: true },
  MADRASAH: { term_class: "Class", term_teacher: "Ustaz", term_principal: "Muhtamim", show_hijri_calendar: true, has_shifts: true, has_departments: false, has_semesters: false, extra_course_enrollment: false },
};

// GET is intentionally public (no auth) — the admin login page and public
// website need institution name/logo before a session exists.
institutionRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const profile = await prisma.institutionProfile.findUnique({ where: { id: PROFILE_ID } });
    res.json({ success: true, data: profile });
  }),
);

institutionRouter.put(
  "/",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = institutionProfileSchema.parse(req.body);
    const profile = await prisma.institutionProfile.update({ where: { id: PROFILE_ID }, data: body });
    res.json({ success: true, data: profile });
  }),
);

institutionRouter.post(
  "/logo",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const { url } = await uploadBuffer("branding", req.file.originalname, req.file.buffer, req.file.mimetype);
    const profile = await prisma.institutionProfile.update({ where: { id: PROFILE_ID }, data: { logo_url: url } });
    res.json({ success: true, data: profile });
  }),
);

institutionRouter.post(
  "/favicon",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const { url } = await uploadBuffer("branding", req.file.originalname, req.file.buffer, req.file.mimetype);
    const profile = await prisma.institutionProfile.update({ where: { id: PROFILE_ID }, data: { favicon_url: url } });
    res.json({ success: true, data: profile });
  }),
);

institutionRouter.put(
  "/type",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  asyncHandler(async (req, res) => {
    const type = req.body.type as InstitutionType;
    if (!TYPE_CASCADE[type]) throw badRequest("Invalid institution type");

    const [profile, config] = await prisma.$transaction([
      prisma.institutionProfile.update({ where: { id: PROFILE_ID }, data: { type } }),
      prisma.institutionConfig.update({ where: { id: CONFIG_ID }, data: TYPE_CASCADE[type] }),
    ]);
    res.json({ success: true, data: { profile, config } });
  }),
);

institutionConfigRouter.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const config = await prisma.institutionConfig.findUnique({ where: { id: CONFIG_ID } });
    res.json({ success: true, data: config });
  }),
);

institutionConfigRouter.put(
  "/",
  authenticate,
  authorize(SETTINGS_INSTITUTION_ROLES),
  asyncHandler(async (req, res) => {
    const body = institutionConfigSchema.parse(req.body);
    const config = await prisma.institutionConfig.update({ where: { id: CONFIG_ID }, data: body });
    res.json({ success: true, data: config });
  }),
);
