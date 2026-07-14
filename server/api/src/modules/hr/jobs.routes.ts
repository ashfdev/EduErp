import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { HR_MANAGE_ROLES } from "../../lib/roles";
import { jobPostingSchema, jobApplicationSchema, jobApplicationStatusSchema } from "@education-erp/validators";
import { badRequest, notFound } from "../../lib/errors";
import { triggerRevalidation } from "../../services/revalidate.service";
import { logAudit } from "../../lib/audit-log";

export const jobsRouter = Router();

jobsRouter.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const jobs = await prisma.jobPosting.findMany({ orderBy: { created_at: "desc" } });
    res.json({ success: true, data: jobs });
  }),
);

jobsRouter.post(
  "/",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = jobPostingSchema.parse(req.body);
    const job = await prisma.jobPosting.create({ data: body });
    if (job.is_published) await triggerRevalidation(["/careers"]);
    res.status(201).json({ success: true, data: job });
  }),
);

jobsRouter.put(
  "/:id",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = jobPostingSchema.partial().parse(req.body);
    const job = await prisma.jobPosting.update({ where: { id: reqParam(req, "id") }, data: body });
    if (job.is_published) await triggerRevalidation(["/careers"]);
    res.json({ success: true, data: job });
  }),
);

jobsRouter.put(
  "/:id/toggle",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ is_published: z.boolean() }).parse(req.body);
    const job = await prisma.jobPosting.update({ where: { id: reqParam(req, "id") }, data: body });
    await triggerRevalidation(["/careers"]);
    res.json({ success: true, data: job });
  }),
);

// ── Public application flow — mirrors admission's public-apply shape:
// no auth, rate-limited, CV goes through the same magic-byte-verified
// upload pipeline as admission documents. ─────────────────────────────

jobsRouter.post(
  "/upload-cv",
  publicEndpointLimiter,
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const { blobKey } = await uploadBuffer("job-applications", req.file.originalname, req.file.buffer, req.file.mimetype);
    res.status(201).json({ success: true, data: { blob_key: blobKey } });
  }),
);

jobsRouter.post(
  "/:id/apply",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const jobId = reqParam(req, "id");
    const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
    if (!job || !job.is_published) throw notFound("Job posting not found");
    if (job.deadline && new Date() > job.deadline) throw badRequest("The application deadline for this posting has passed");

    const body = jobApplicationSchema.parse(req.body);
    const application = await prisma.jobApplication.create({
      data: { job_posting_id: jobId, ...body },
    });
    res.status(201).json({ success: true, data: { id: application.id } });
  }),
);

// ── Admin review — CV is never a public URL; a signed link is generated
// only on an already-authorized staff request (same discipline as the
// Resource Library, Phase 28). ─────────────────────────────────────────

jobsRouter.get(
  "/:id/applications",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const applications = await prisma.jobApplication.findMany({
      where: { job_posting_id: reqParam(req, "id") },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: applications });
  }),
);

jobsRouter.get(
  "/applications/:application_id/cv-url",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const application = await prisma.jobApplication.findUnique({ where: { id: reqParam(req, "application_id") } });
    if (!application) throw notFound("Application not found");
    const url = await getSignedDownloadUrl(application.cv_blob_key);
    res.json({ success: true, data: { url } });
  }),
);

jobsRouter.put(
  "/applications/:application_id/status",
  authenticate,
  authorize(HR_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = jobApplicationStatusSchema.parse(req.body);
    const application = await prisma.jobApplication.update({
      where: { id: reqParam(req, "application_id") },
      data: body,
    });

    await logAudit("JOB_APPLICATION_STATUS_CHANGE", {
      userId: req.user!.sub,
      targetType: "JobApplication",
      targetId: application.id,
      metadata: { status: application.status },
      req,
    });

    res.json({ success: true, data: application });
  }),
);
