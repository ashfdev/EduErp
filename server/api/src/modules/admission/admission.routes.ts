import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { documentUpload, verifyDocumentMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { ADMISSION_MANAGE_ROLES, ADMISSION_ENROLL_ROLES } from "../../lib/roles";
import {
  createAdmissionCycleSchema,
  updateAdmissionCycleSchema,
  toggleAdmissionCycleSchema,
  admissionFormConfigSchema,
  submitAdmissionApplicationSchema,
  admissionApplicationStatusSchema,
  admissionBulkActionSchema,
  admissionEnrollSchema,
  admissionPaymentInitiateSchema,
  admissionStatusLookupSchema,
  scheduleAdmissionTestSchema,
  generateTestSeatPlanSchema,
} from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { generateInvoiceNo } from "../fees/fee-number.generator";
import { createMonthlyInvoiceIfMissing } from "../fees/invoice-helpers";
import { inheritSubjectsForClass, assertGroupSelectedIfRequired } from "../../utils/subject-inheritance";
import { sendSms } from "../../services/sms.service";
import { sendNotification } from "../../services/notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { assertSectionCapacity } from "../../lib/section-capacity";
import { env } from "../../lib/env";
import { getPaymentAdapter } from "../../services/payment";
import { renderDocument, renderDocumentBatch } from "../../services/pdf.service";
import { badRequest, notFound, conflict } from "../../lib/errors";
import type { AdmissionApplication, AdmissionCycle, AdmissionTestSeatPlan, Class, AcademicYear, AdmissionStatus } from "@education-erp/db";
import { Prisma } from "@education-erp/db";

export const admissionRouter = Router();

type PreviousResult = {
  gpa?: number;
  gpa_scale?: "5" | "4" | "OTHER";
  marks_obtained?: number;
  marks_total_out_of?: number;
  total_marks?: number; // legacy shape from applications submitted before gpa_scale/marks_total_out_of existed
} | null | undefined;

function meritScoreOf(previousResult: unknown): number {
  const r = (previousResult ?? {}) as PreviousResult;
  const rawGpa = typeof r?.gpa === "number" ? r.gpa : 0;
  // Normalize a 4-scale GPA onto the 5-scale before ranking, so merit order
  // stays fair across applicants reporting different GPA scales.
  const gpa = r?.gpa_scale === "4" ? rawGpa * (5 / 4) : rawGpa;
  const marks = typeof r?.marks_obtained === "number" ? r.marks_obtained : (typeof r?.total_marks === "number" ? r.total_marks : 0);
  const marksOutOf = typeof r?.marks_total_out_of === "number" && r.marks_total_out_of > 0 ? r.marks_total_out_of : 100;
  // Same reasoning applies to marks — normalize onto a common /100 scale so
  // "450/500" and "450/1000" aren't scored as if they were equal.
  const normalizedMarks = (marks / marksOutOf) * 100;
  return gpa * 1000 + normalizedMarks / 1000;
}

type ApplicationForCard = AdmissionApplication & {
  cycle: AdmissionCycle & { class: Class; academic_year: AcademicYear };
  test_seat: AdmissionTestSeatPlan | null;
};

// Shared by the single-application and bulk admit-card endpoints — builds
// the REGISTRATION_CARD template's data shape (applicant/test), not the
// academic student.* shape, since no Student row exists pre-enrollment.
function buildRegistrationCardData(application: ApplicationForCard) {
  const guardianInfo = application.guardian_info as { father_name?: string; mother_name?: string } | null;
  const documents = application.documents as Record<string, string> | null;
  const cycle = application.cycle;
  const seat = application.test_seat;

  return {
    applicant: {
      name: application.applicant_name,
      roll: application.admission_roll,
      father_name: guardianInfo?.father_name ?? "",
      mother_name: guardianInfo?.mother_name ?? "",
      class_name: cycle.class.name_en,
      photo_url: documents?.photo ?? null,
    },
    test: {
      date: cycle.test_date,
      day: cycle.test_date ? new Date(cycle.test_date).toLocaleDateString("en-US", { weekday: "long" }) : "",
      time: cycle.test_date ? new Date(cycle.test_date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
      duration_minutes: cycle.test_duration_minutes,
      venue: cycle.test_venue ?? "TBA",
      hall: seat?.hall_name ?? "TBA",
      seat_no: seat?.seat_number ?? "TBA",
      instructions: cycle.test_instructions ?? "Please arrive 30 minutes before the scheduled time with this card and a valid photo ID.",
    },
    cycle_name: cycle.name,
    academic_year_label: cycle.academic_year.label,
  };
}

async function cycleStats(cycleId: string) {
  const [total, shortlisted, waitlisted, confirmed, enrolled, rejected] = await Promise.all([
    prisma.admissionApplication.count({ where: { cycle_id: cycleId } }),
    prisma.admissionApplication.count({ where: { cycle_id: cycleId, status: "SHORTLISTED" } }),
    prisma.admissionApplication.count({ where: { cycle_id: cycleId, status: "WAITLISTED" } }),
    prisma.admissionApplication.count({ where: { cycle_id: cycleId, status: "CONFIRMED" } }),
    prisma.admissionApplication.count({ where: { cycle_id: cycleId, status: "ENROLLED" } }),
    prisma.admissionApplication.count({ where: { cycle_id: cycleId, status: "REJECTED" } }),
  ]);
  return { total_applications: total, shortlisted, waitlisted, confirmed, enrolled, rejected };
}

// ───────────────────────── Cycle Management ─────────────────────────

admissionRouter.post(
  "/cycles",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = createAdmissionCycleSchema.parse(req.body);
    if (body.close_date <= body.open_date) throw badRequest("close_date must be after open_date");

    const cycle = await prisma.admissionCycle.create({
      data: {
        class_id: body.class_id,
        academic_year_id: body.academic_year_id,
        name: body.name,
        open_date: body.open_date,
        close_date: body.close_date,
        seat_count: body.seat_count,
        app_fee: body.app_fee,
        form_config: body.form_config ?? undefined,
      },
    });
    res.status(201).json({ success: true, data: cycle });
  }),
);

admissionRouter.get(
  "/cycles",
  authenticate,
  asyncHandler(async (req, res) => {
    const cycles = await prisma.admissionCycle.findMany({
      include: { class: { select: { id: true, name_en: true } }, academic_year: { select: { id: true, label: true } } },
      orderBy: { created_at: "desc" },
    });
    const withStats = await Promise.all(
      cycles.map(async (c) => {
        const stats = await cycleStats(c.id);
        return { ...c, stats, seats_remaining: c.seat_count - stats.confirmed - stats.enrolled };
      }),
    );
    res.json({ success: true, data: withStats });
  }),
);

admissionRouter.get(
  "/cycles/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({
      where: { id },
      include: { class: { select: { id: true, name_en: true } }, academic_year: { select: { id: true, label: true } } },
    });
    if (!cycle) throw notFound("Admission cycle not found");
    const stats = await cycleStats(id);
    res.json({ success: true, data: { ...cycle, stats, seats_remaining: cycle.seat_count - stats.confirmed - stats.enrolled } });
  }),
);

admissionRouter.put(
  "/cycles/:id",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updateAdmissionCycleSchema.parse(req.body);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) throw notFound("Admission cycle not found");

    if ((body.class_id || body.academic_year_id)) {
      const appCount = await prisma.admissionApplication.count({ where: { cycle_id: id } });
      if (appCount > 0 && (body.class_id !== existing.class_id || body.academic_year_id !== existing.academic_year_id)) {
        throw conflict("Cannot change class or academic year once applications have been submitted");
      }
    }

    const updated = await prisma.admissionCycle.update({
      where: { id },
      data: {
        ...(body.class_id && { class_id: body.class_id }),
        ...(body.academic_year_id && { academic_year_id: body.academic_year_id }),
        ...(body.name && { name: body.name }),
        ...(body.open_date && { open_date: body.open_date }),
        ...(body.close_date && { close_date: body.close_date }),
        ...(body.seat_count !== undefined && { seat_count: body.seat_count }),
        ...(body.app_fee !== undefined && { app_fee: body.app_fee }),
        ...(body.form_config && { form_config: body.form_config }),
      },
    });
    res.json({ success: true, data: updated });
  }),
);

admissionRouter.put(
  "/cycles/:id/toggle",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = toggleAdmissionCycleSchema.parse(req.body);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) throw notFound("Admission cycle not found");

    const updated = await prisma.admissionCycle.update({
      where: { id },
      data: {
        ...(body.is_open !== undefined && { is_open: body.is_open }),
        ...(body.is_published !== undefined && { is_published: body.is_published }),
      },
    });
    res.json({ success: true, data: updated });
  }),
);

// ───────────────────────── Form Configuration ─────────────────────────

admissionRouter.get(
  "/cycles/:id/form-config",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id }, select: { form_config: true } });
    if (!cycle) throw notFound("Admission cycle not found");
    res.json({ success: true, data: cycle.form_config ?? null });
  }),
);

admissionRouter.put(
  "/cycles/:id/form-config",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = admissionFormConfigSchema.parse(req.body);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) throw notFound("Admission cycle not found");

    const updated = await prisma.admissionCycle.update({ where: { id }, data: { form_config: body } });
    res.json({ success: true, data: updated.form_config });
  }),
);

admissionRouter.get(
  "/cycles/:id/subjects",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");
    const subjects = await prisma.subject.findMany({ where: { class_id: cycle.class_id, is_active: true } });
    res.json({
      success: true,
      data: {
        compulsory: subjects.filter((s) => s.is_compulsory),
        optional: subjects.filter((s) => s.is_optional),
      },
    });
  }),
);

// ───────────────────────── Public: Cycles + Apply ─────────────────────────

admissionRouter.get(
  "/public/cycles",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const cycles = await prisma.admissionCycle.findMany({
      where: { is_published: true },
      include: { class: { select: { id: true, name_en: true, name_bn: true } } },
      orderBy: { open_date: "desc" },
    });
    res.json({
      success: true,
      data: cycles.map((c) => ({
        id: c.id,
        name: c.name,
        class: c.class,
        open_date: c.open_date,
        close_date: c.close_date,
        seat_count: c.seat_count,
        app_fee: c.app_fee,
        // is_open is a staff-toggled flag, not deadline-aware on its own —
        // fold in close_date here so "Apply Now" / the Open badge can never
        // outlive the real deadline just because staff forgot to flip it
        // off. The actual close_date enforcement at submission time is
        // unaffected by this — this only changes what's advertised publicly.
        is_open: c.is_open && c.close_date >= new Date(),
      })),
    });
  }),
);

admissionRouter.get(
  "/public/cycles/:id",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findFirst({
      where: { id, is_published: true },
      include: { class: { select: { id: true, name_en: true, name_bn: true } } },
    });
    if (!cycle) throw notFound("Admission cycle not found");

    const subjects = await prisma.subject.findMany({ where: { class_id: cycle.class_id, is_active: true } });
    res.json({
      success: true,
      data: {
        id: cycle.id,
        name: cycle.name,
        class: cycle.class,
        open_date: cycle.open_date,
        close_date: cycle.close_date,
        seat_count: cycle.seat_count,
        app_fee: cycle.app_fee,
        is_open: cycle.is_open,
        form_config: cycle.form_config,
        subjects: { compulsory: subjects.filter((s) => s.is_compulsory), optional: subjects.filter((s) => s.is_optional) },
      },
    });
  }),
);

admissionRouter.post(
  "/upload-document",
  publicEndpointLimiter,
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const { url } = await uploadBuffer("admission-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    res.status(201).json({ success: true, data: { url } });
  }),
);

admissionRouter.post(
  "/apply",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const body = submitAdmissionApplicationSchema.parse(req.body);
    const cycle = await prisma.admissionCycle.findUnique({ where: { id: body.cycle_id } });
    if (!cycle) throw notFound("Admission cycle not found");
    if (!cycle.is_open) throw badRequest("This admission cycle is not currently open for applications");
    const now = new Date();
    if (now < cycle.open_date || now > cycle.close_date) throw badRequest("This admission cycle is outside its open/close date range");
    if (cycle.seat_count < 1) throw badRequest("This admission cycle has no seats configured");

    const config = cycle.form_config as z.infer<typeof admissionFormConfigSchema> | null;
    if (config?.fields?.length) {
      const missing = config.fields
        .filter((f) => f.required && !f.is_default)
        .filter((f) => body.personal_info[f.key] === undefined || body.personal_info[f.key] === "")
        .map((f) => f.key);
      if (missing.length) throw badRequest(`Missing required fields: ${missing.join(", ")}`, missing);

      const missingDocs = (config.document_uploads ?? [])
        .filter((d) => d.required)
        .filter((d) => !body.documents?.[d.key])
        .map((d) => d.key);
      if (missingDocs.length) throw badRequest(`Missing required documents: ${missingDocs.join(", ")}`, missingDocs);
    }

    // One guardian phone can only apply once per cycle — a second POST /apply
    // for the same cycle+phone is a resubmission, not a new applicant.
    const existingForPhone = await prisma.admissionApplication.findFirst({
      where: { cycle_id: cycle.id, guardian_info: { path: ["phone"], equals: body.guardian_info.phone } },
    });
    if (existingForPhone) throw conflict("An application for this cycle already exists for this guardian phone number");

    const prefix = cycle.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ADM";
    const year = new Date().getFullYear();
    const rollPrefix = `${prefix}-${year}-`;

    // The count-then-format-then-create sequence below is only a starting
    // candidate — two concurrent /apply requests can both pass the "not
    // taken yet" moment before either commits (classic check-then-insert
    // race), so retrying the *insert* itself on a unique-constraint
    // conflict (mirroring createWithUniqueAssetUid()'s pattern) is the real
    // fix, not the count alone. This was very likely the cause of
    // "submission fails or errors out" — a raw 500 on the 2nd of two
    // concurrent submissions, now a clean retry instead.
    //
    // The candidate sequence is deliberately derived from the MAX sequence
    // already used under this exact roll PREFIX (letters+year), scanned
    // across every cycle — not `count of applications in this cycle` alone.
    // `admission_roll` is globally unique, but two differently-named cycles
    // can trivially reduce to the same 3-letter prefix (e.g. "Class 6
    // Admission" and "Class 7 Admission" both → "CLA") — counting only this
    // cycle's own applications let a second, unrelated cycle exhaust the
    // shared prefix's low sequence numbers first, hard-failing every
    // applicant to whichever cycle filled that shared slot second. Scanning
    // the real max in use for the prefix (not just this cycle) fixes that
    // at the root, while keeping admission_roll itself unmodified and still
    // globally unique (no schema change needed).
    let application: Awaited<ReturnType<typeof prisma.admissionApplication.create>> | undefined;
    let admission_roll = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const existingForPrefix = await prisma.admissionApplication.findMany({
        where: { admission_roll: { startsWith: rollPrefix } },
        select: { admission_roll: true },
      });
      let maxSeq = 0;
      for (const a of existingForPrefix) {
        const m = a.admission_roll?.match(/-(\d+)$/);
        if (m?.[1]) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
      }
      admission_roll = `${rollPrefix}${String(maxSeq + 1 + attempt).padStart(4, "0")}`;
      try {
        application = await prisma.admissionApplication.create({
          data: {
            cycle_id: cycle.id,
            admission_roll,
            applicant_name: body.applicant_name,
            guardian_info: body.guardian_info,
            personal_info: body.personal_info,
            previous_result: body.previous_result ?? undefined,
            selected_subjects: body.selected_subjects ?? undefined,
            documents: body.documents ?? undefined,
            status: "PENDING",
          },
        });
        break;
      } catch (err) {
        const isRollCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && (err.meta?.target as string[] | undefined)?.includes("admission_roll") === true;
        if (isRollCollision && attempt < 4) continue;
        throw err;
      }
    }
    if (!application) throw new Error("Could not create application with a unique admission roll after 5 attempts");

    await sendSms(body.guardian_info.phone, `Application received for ${body.applicant_name}. Roll: ${admission_roll}. Track status at our website.`);

    res.status(201).json({ success: true, data: { id: application.id, admission_roll, app_fee: cycle.app_fee } });
  }),
);

admissionRouter.post(
  "/payment/initiate",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const body = admissionPaymentInitiateSchema.parse(req.body);
    const application = await prisma.admissionApplication.findUnique({ where: { id: body.application_id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");

    const adapter = getPaymentAdapter(body.gateway);
    if (!adapter.isConfigured()) throw badRequest(`${body.gateway} is not configured yet — merchant credentials are pending`);

    const transactionId = randomUUID();
    const result = await adapter.initiatePayment({ invoice_id: application.id, amount: application.cycle.app_fee, transaction_id: transactionId });
    await prisma.admissionApplication.update({ where: { id: application.id }, data: { payment_id: transactionId } });

    res.json({ success: true, data: { payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

// Only PENDING/SHORTLISTED/WAITLISTED may move to CONFIRMED via a payment
// callback — a REJECTED application must not be re-confirmable this way, and
// an already-CONFIRMED/ENROLLED application must not be touched again by a
// replayed or duplicate gateway callback (idempotent no-op instead).
const CONFIRMABLE_STATUSES: AdmissionStatus[] = ["PENDING", "SHORTLISTED", "WAITLISTED"];

async function handleAdmissionCallback(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ", payload: unknown) {
  const adapter = getPaymentAdapter(gateway);
  const verified = await adapter.verifyCallback(payload);

  const application = await prisma.admissionApplication.findFirst({ where: { payment_id: verified.transaction_id } });
  if (!application) throw notFound("Application not found for this transaction");

  if (verified.success && CONFIRMABLE_STATUSES.includes(application.status)) {
    await prisma.admissionApplication.update({ where: { id: application.id }, data: { status: "CONFIRMED" } });
  }
  return { received: true };
}

admissionRouter.post("/payment/callback/:gateway", asyncHandler(async (req, res) => {
  const gateway = reqParam(req, "gateway").toUpperCase();
  if (!["BKASH", "NAGAD", "SSLCOMMERZ"].includes(gateway)) throw badRequest("Unknown gateway");
  res.json({ success: true, data: await handleAdmissionCallback(gateway as "BKASH" | "NAGAD" | "SSLCOMMERZ", req.body) });
}));

admissionRouter.get(
  "/application/status",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = admissionStatusLookupSchema.parse(req.query);
    const application = await prisma.admissionApplication.findUnique({
      where: { admission_roll: query.admission_roll },
      include: { cycle: { select: { name: true, merit_list_published_at: true, requires_test: true, test_date: true, test_venue: true, admit_card_published_at: true } } },
    });
    if (!application) return res.json({ success: true, data: { found: false } });

    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) return res.json({ success: true, data: { found: false } });

    // merit_rank is assigned the moment "Generate Merit List" runs (so the
    // admin can review before committing), but must stay invisible to
    // applicants until they deliberately click "Publish & Notify".
    const meritPublished = application.cycle.merit_list_published_at !== null;

    // Same gating pattern as merit_rank above — the admit card must stay
    // undownloadable until the admin deliberately publishes it, even though
    // seat-plan/admit-card PDFs can already be generated by staff earlier.
    const admitCardAvailable =
      application.cycle.requires_test &&
      application.cycle.admit_card_published_at !== null &&
      (ADMIT_CARD_ELIGIBLE_STATUSES as readonly string[]).includes(application.status);

    res.json({
      success: true,
      data: {
        found: true,
        admission_roll: application.admission_roll,
        applicant_name: application.applicant_name,
        cycle_name: application.cycle.name,
        status: application.status,
        merit_rank: meritPublished ? application.merit_rank : null,
        requires_test: application.cycle.requires_test,
        test_date: application.cycle.requires_test ? application.cycle.test_date : null,
        test_venue: application.cycle.requires_test ? application.cycle.test_venue : null,
        admit_card_available: admitCardAvailable,
      },
    });
  }),
);

admissionRouter.get(
  "/application/admit-card",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = admissionStatusLookupSchema.parse(req.query);
    const application = await prisma.admissionApplication.findUnique({
      where: { admission_roll: query.admission_roll },
      include: { cycle: { include: { class: true, academic_year: true } }, test_seat: true },
    });
    if (!application) throw notFound("Application not found");

    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) throw notFound("Application not found");

    const eligible =
      application.cycle.requires_test &&
      application.cycle.admit_card_published_at !== null &&
      (ADMIT_CARD_ELIGIBLE_STATUSES as readonly string[]).includes(application.status);
    if (!eligible) throw badRequest("Admit card is not available for this application yet");

    const data = buildRegistrationCardData(application);
    const pdf = await renderDocument("REGISTRATION_CARD", data, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Admit_Card_${application.admission_roll}.pdf"`);
    res.send(pdf);
  }),
);

// ───────────────────────── Admin: Application Processing ─────────────────────────

admissionRouter.get(
  "/applications",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        cycle_id: z.string().optional(),
        status: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      ...(query.cycle_id && { cycle_id: query.cycle_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.search && {
        OR: [
          { applicant_name: { contains: query.search, mode: "insensitive" as const } },
          { admission_roll: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.admissionApplication.findMany({
        where,
        include: { cycle: { select: { id: true, name: true } } },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { created_at: "desc" },
      }),
      prisma.admissionApplication.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

admissionRouter.get(
  "/applications/:id",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");
    res.json({ success: true, data: application });
  }),
);

// Forward-only state machine — previously only ENROLLED was locked, so a
// CONFIRMED (possibly already-paid) application could be walked backward to
// SHORTLISTED/WAITLISTED/REJECTED with no guard at all. REJECTED and
// CONFIRMED are terminal via this route: rejecting is a final decision, and
// moving a confirmed applicant forward happens only through the dedicated
// /applications/:id/enroll endpoint, never a generic status edit.
const ALLOWED_STATUS_TRANSITIONS: Record<AdmissionStatus, AdmissionStatus[]> = {
  PENDING: ["SHORTLISTED", "WAITLISTED", "REJECTED"],
  SHORTLISTED: ["WAITLISTED", "REJECTED", "CONFIRMED"],
  WAITLISTED: ["SHORTLISTED", "REJECTED", "CONFIRMED"],
  REJECTED: [],
  CONFIRMED: [],
  ENROLLED: [],
};

admissionRouter.put(
  "/applications/:id/status",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = admissionApplicationStatusSchema.parse(req.body);
    const existing = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!existing) throw notFound("Application not found");
    if (existing.status === "ENROLLED") throw conflict("Cannot change status of an already-enrolled application");
    if (!ALLOWED_STATUS_TRANSITIONS[existing.status].includes(body.status)) {
      throw conflict(`Cannot change status from ${existing.status} to ${body.status}`);
    }

    const updated = await prisma.admissionApplication.update({ where: { id }, data: { status: body.status } });

    const guardianInfo = existing.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone) {
      await sendSms(guardianInfo.phone, `Application ${existing.admission_roll ?? ""} status updated: ${body.status}.`);
    }

    res.json({ success: true, data: updated });
  }),
);

admissionRouter.post(
  "/applications/bulk-action",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = admissionBulkActionSchema.parse(req.body);
    const result = await prisma.admissionApplication.updateMany({
      where: { id: { in: body.application_ids }, status: { notIn: ["ENROLLED"] } },
      data: { status: body.status },
    });
    res.json({ success: true, data: { updated: result.count } });
  }),
);

admissionRouter.post(
  "/cycles/:id/merit-list",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { notIn: ["REJECTED", "ENROLLED"] } },
    });

    const ranked = applications
      .map((a) => ({ app: a, score: meritScoreOf(a.previous_result) }))
      .sort((a, b) => b.score - a.score);

    const results = await Promise.all(
      ranked.map((r, index) => {
        const rank = index + 1;
        const status = rank <= cycle.seat_count ? "SHORTLISTED" : "WAITLISTED";
        return prisma.admissionApplication.update({ where: { id: r.app.id }, data: { merit_rank: rank, status } });
      }),
    );

    res.json({
      success: true,
      data: results.map((r) => ({ id: r.id, admission_roll: r.admission_roll, applicant_name: r.applicant_name, merit_rank: r.merit_rank, status: r.status })),
    });
  }),
);

admissionRouter.post(
  "/cycles/:id/merit-list/publish",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, merit_rank: { not: null } },
    });

    let notified = 0;
    for (const app of applications) {
      const guardianInfo = app.guardian_info as { phone?: string } | null;
      if (guardianInfo?.phone) {
        await sendSms(guardianInfo.phone, `Merit list published. ${app.applicant_name} (Roll: ${app.admission_roll}) — Status: ${app.status}, Rank: ${app.merit_rank}.`);
        notified++;
      }
    }

    // This is the actual moment merit_rank becomes visible via the public
    // status lookup — see /application/status above.
    await prisma.admissionCycle.update({ where: { id }, data: { merit_list_published_at: new Date() } });

    res.json({ success: true, data: { notified } });
  }),
);

admissionRouter.post(
  "/applications/:id/confirm",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");
    if (application.status !== "SHORTLISTED") throw badRequest("Only shortlisted applications can be confirmed");

    // Previously only enforced at merit-list generation — an admin could
    // still confirm/enroll past the configured seat count with no guard at
    // this actual commit point.
    const takenSeats = await prisma.admissionApplication.count({
      where: { cycle_id: application.cycle_id, status: { in: ["CONFIRMED", "ENROLLED"] } },
    });
    if (takenSeats >= application.cycle.seat_count) throw conflict("No seats remaining for this admission cycle");

    const updated = await prisma.admissionApplication.update({ where: { id }, data: { status: "CONFIRMED" } });
    res.json({ success: true, data: updated });
  }),
);

admissionRouter.post(
  "/applications/:id/enroll",
  authenticate,
  authorize(ADMISSION_ENROLL_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = admissionEnrollSchema.parse(req.body);
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");
    if (application.status !== "CONFIRMED") throw badRequest("Only confirmed applications can be enrolled");
    if (application.enrolled_student_id) throw conflict("This application has already been enrolled");

    const takenSeats = await prisma.admissionApplication.count({
      where: { cycle_id: application.cycle_id, status: { in: ["CONFIRMED", "ENROLLED"] }, id: { not: application.id } },
    });
    if (takenSeats >= application.cycle.seat_count) throw conflict("No seats remaining for this admission cycle");
    if (body.section_id) await assertSectionCapacity(body.section_id, req.body.override === true);
    await assertGroupSelectedIfRequired(prisma, application.cycle.class_id, body.group_id);

    const guardianInfo = application.guardian_info as { father_name?: string; mother_name?: string; phone: string; email?: string; address?: string };
    const personalInfo = application.personal_info as Record<string, unknown>;

    const { student, studentLogin, guardianLogin, guardianEmail, guardianUserId } = await prisma.$transaction(async (tx) => {
      let guardian = await tx.guardian.findFirst({ where: { phone: guardianInfo.phone } });
      let guardianLoginResult: Awaited<ReturnType<typeof createOrLinkPortalLogin>> | null = null;
      if (!guardian) {
        // Guardians previously got no portal login at all through this
        // enrollment path — every other admission/creation path either
        // creates one or (for manual student add) always does. Fixed here
        // to match.
        guardianLoginResult = await createOrLinkPortalLogin(tx, {
          role: "GUARDIAN",
          phone: guardianInfo.phone,
          name: guardianInfo.father_name ?? guardianInfo.mother_name ?? "Guardian",
        });
        guardian = await tx.guardian.create({
          data: {
            user_id: guardianLoginResult.userId,
            name_en: guardianInfo.father_name ?? guardianInfo.mother_name ?? "Guardian",
            relation: "FATHER",
            phone: guardianInfo.phone,
            email: guardianInfo.email,
            address: guardianInfo.address,
          },
        });
      }

      const student_uid = await generateStudentUID(application.cycle.class_id);
      const studentPhone = typeof personalInfo.phone === "string" ? personalInfo.phone : undefined;
      // Previously generated and hashed but never sent or returned anywhere
      // — an unusable, effectively lost credential. Now flows through the
      // same shared helper + notification pipeline as every other login.
      const studentLoginResult = studentPhone
        ? await createOrLinkPortalLogin(tx, { role: "STUDENT", phone: studentPhone, name: application.applicant_name })
        : null;

      const created = await tx.student.create({
        data: {
          user_id: studentLoginResult?.userId,
          student_uid,
          name_en: application.applicant_name,
          gender: (typeof personalInfo.gender === "string" ? personalInfo.gender : "OTHER") as never,
          date_of_birth: typeof personalInfo.date_of_birth === "string" ? new Date(personalInfo.date_of_birth) : undefined,
          phone: studentPhone,
          guardian_id: guardian.id,
          father_name: guardianInfo.father_name,
          father_phone: guardianInfo.phone,
          mother_name: guardianInfo.mother_name,
          address_permanent: guardianInfo.address,
          current_class_id: application.cycle.class_id,
          current_section_id: body.section_id,
          group_id: body.group_id,
          current_roll_no: body.roll_no,
          admission_date: new Date(),
        },
      });

      await inheritSubjectsForClass(
        tx,
        created.id,
        application.cycle.class_id,
        application.cycle.academic_year_id,
        (application.selected_subjects as string[] | null) ?? [],
        body.group_id,
      );

      if (application.cycle.app_fee > 0) {
        await tx.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(tx),
            student_id: created.id,
            academic_year_id: application.cycle.academic_year_id,
            category: "ADMISSION",
            description: `Admission Fee — ${application.cycle.name}`,
            amount_due: application.cycle.app_fee,
            due_date: new Date(),
            status: "PENDING",
          },
        });
      }

      if (application.cycle.form_fee > 0) {
        await tx.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(tx),
            student_id: created.id,
            academic_year_id: application.cycle.academic_year_id,
            category: "FORM",
            description: `Form Fee — ${application.cycle.name}`,
            amount_due: application.cycle.form_fee,
            due_date: new Date(),
            status: "PENDING",
          },
        });
      }

      // First month's tuition, invoiced immediately at enrollment rather than
      // waiting for the next manual/scheduled generate-bulk-monthly run —
      // reuses that same idempotent create-if-missing check, so if bulk
      // generation for this month already ran (or runs again later), this
      // never produces a duplicate invoice for the same student+structure.
      const now = new Date();
      const monthlyStructures = await tx.feeStructure.findMany({
        where: {
          academic_year_id: application.cycle.academic_year_id,
          frequency: "MONTHLY",
          is_active: true,
          OR: [{ class_id: null }, { class_id: application.cycle.class_id }],
        },
      });
      for (const structure of monthlyStructures) {
        if (structure.section_id && structure.section_id !== body.section_id) continue;
        await createMonthlyInvoiceIfMissing(tx, created.id, structure, now.getMonth() + 1, now.getFullYear());
      }

      await tx.admissionApplication.update({ where: { id: application.id }, data: { status: "ENROLLED", enrolled_student_id: created.id } });

      return {
        student: created,
        studentLogin: studentLoginResult,
        guardianLogin: guardianLoginResult,
        guardianEmail: guardian.email,
        guardianUserId: guardian.user_id,
      };
    });

    // Resolved directly from the transaction's own guardian row (whichever
    // branch created/found it) instead of a post-commit re-query by phone —
    // the old re-query could pick a different Guardian row than the one
    // just linked if two guardians ever shared a phone.
    await sendNotification({
      trigger: "ADMISSION_CONFIRM",
      recipients: [{ name: application.applicant_name, phone: guardianInfo.phone, email: guardianEmail, user_id: guardianUserId, person_id: student.id }],
      template_data: { student_name: application.applicant_name, student_uid: student.student_uid },
    });

    const studentPhoneForNotify = typeof personalInfo.phone === "string" ? personalInfo.phone : undefined;
    if (studentLogin?.tempPassword && studentPhoneForNotify) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: application.applicant_name, phone: studentPhoneForNotify }],
        template_data: {
          name: application.applicant_name,
          phone: studentPhoneForNotify,
          password: studentLogin.tempPassword,
          portal_url: env.PORTAL_URL ?? "",
        },
      });
    }
    if (guardianLogin?.tempPassword) {
      await sendNotification({
        trigger: "PORTAL_LOGIN_CREATED",
        recipients: [{ name: guardianInfo.father_name ?? guardianInfo.mother_name ?? "Guardian", phone: guardianInfo.phone, email: guardianEmail }],
        template_data: {
          name: guardianInfo.father_name ?? guardianInfo.mother_name ?? "Guardian",
          phone: guardianInfo.phone,
          password: guardianLogin.tempPassword,
          portal_url: env.PORTAL_URL ?? "",
        },
      });
    }

    res.status(201).json({ success: true, data: student });
  }),
);

// ───────────────────────── Admission Test + Admit Card Workflow ─────────────────────────

const ADMIT_CARD_ELIGIBLE_STATUSES = ["SHORTLISTED", "WAITLISTED", "CONFIRMED"] as const;

admissionRouter.put(
  "/cycles/:id/test",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = scheduleAdmissionTestSchema.parse(req.body);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) throw notFound("Admission cycle not found");

    const updated = await prisma.admissionCycle.update({
      where: { id },
      data: {
        requires_test: body.requires_test,
        test_date: body.test_date,
        test_venue: body.test_venue,
        test_duration_minutes: body.test_duration_minutes,
        test_instructions: body.test_instructions,
      },
    });
    res.json({ success: true, data: updated });
  }),
);

admissionRouter.post(
  "/cycles/:id/test/seat-plan",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = generateTestSeatPlanSchema.parse(req.body);
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { in: body.statuses } },
      orderBy: [{ merit_rank: "asc" }, { admission_roll: "asc" }],
    });

    const totalCapacity = body.halls.reduce((sum, h) => sum + h.capacity, 0);
    const overflow = Math.max(0, applications.length - totalCapacity);

    const assignments: { application_id: string; cycle_id: string; hall_name: string; seat_number: string }[] = [];
    let index = 0;
    for (const hall of body.halls) {
      for (let seat = body.start_seat; seat < body.start_seat + hall.capacity && index < applications.length; seat++, index++) {
        assignments.push({ application_id: applications[index]!.id, cycle_id: id, hall_name: hall.name, seat_number: String(seat) });
      }
    }

    await prisma.$transaction([
      prisma.admissionTestSeatPlan.deleteMany({ where: { cycle_id: id } }),
      prisma.admissionTestSeatPlan.createMany({ data: assignments }),
    ]);

    res.json({ success: true, data: { assigned: assignments.length, total_applications: applications.length, overflow } });
  }),
);

admissionRouter.get(
  "/cycles/:id/test/seat-plan",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const seatPlans = await prisma.admissionTestSeatPlan.findMany({
      where: { cycle_id: id },
      include: { application: { select: { admission_roll: true, applicant_name: true, status: true } } },
      orderBy: [{ hall_name: "asc" }, { seat_number: "asc" }],
    });
    res.json({
      success: true,
      data: seatPlans.map((s) => ({
        hall_name: s.hall_name,
        seat_number: s.seat_number,
        admission_roll: s.application.admission_roll,
        applicant_name: s.application.applicant_name,
        status: s.application.status,
      })),
    });
  }),
);

// ───────────────────────── Documents ─────────────────────────

admissionRouter.get(
  "/applications/:id/admit-card",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: { cycle: { include: { class: true, academic_year: true } }, test_seat: true },
    });
    if (!application) throw notFound("Application not found");
    if (application.status === "PENDING" || application.status === "REJECTED") throw badRequest("Admit card is only available for shortlisted/waitlisted/confirmed applications");

    const data = buildRegistrationCardData(application);
    const pdf = await renderDocument("REGISTRATION_CARD", data, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="Admit_Card_${application.admission_roll}.pdf"`);
    res.send(pdf);
  }),
);

admissionRouter.get(
  "/cycles/:id/admit-cards",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { in: [...ADMIT_CARD_ELIGIBLE_STATUSES] } },
      include: { cycle: { include: { class: true, academic_year: true } }, test_seat: true },
      orderBy: { admission_roll: "asc" },
    });
    if (!applications.length) throw badRequest("No eligible applications to generate admit cards for");

    const dataList = applications.map(buildRegistrationCardData);
    const pdf = await renderDocumentBatch("REGISTRATION_CARD", dataList, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Admit_Cards_${cycle.name.replace(/\s+/g, "_")}.pdf"`);
    res.send(pdf);
  }),
);

admissionRouter.post(
  "/cycles/:id/admit-card/publish",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");
    if (!cycle.requires_test) throw badRequest("This cycle does not require an admission test");
    if (!cycle.test_date) throw badRequest("Schedule the test date and venue before publishing admit cards");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { in: [...ADMIT_CARD_ELIGIBLE_STATUSES] } },
    });

    let notified = 0;
    for (const app of applications) {
      const guardianInfo = app.guardian_info as { phone?: string } | null;
      if (guardianInfo?.phone) {
        await sendSms(
          guardianInfo.phone,
          `Admission test for ${app.applicant_name} (Roll: ${app.admission_roll}) is scheduled on ${cycle.test_date?.toLocaleDateString()} at ${cycle.test_venue ?? "the institution"}. Download the admit card from our website status page.`,
        );
        notified++;
      }
    }

    await prisma.admissionCycle.update({ where: { id }, data: { admit_card_published_at: new Date() } });
    res.json({ success: true, data: { notified } });
  }),
);

admissionRouter.get(
  "/cycles/:id/merit-list/pdf",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const cycle = await prisma.admissionCycle.findUnique({ where: { id }, include: { class: true, academic_year: true } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, merit_rank: { not: null } },
      orderBy: { merit_rank: "asc" },
    });

    const rows = applications.map((a) => ({
      rank: a.merit_rank,
      roll_no: a.admission_roll,
      student_uid: a.admission_roll,
      name_en: a.applicant_name,
      total_gpa: (a.previous_result as { gpa?: number } | null)?.gpa ?? "-",
    }));
    const pdf = await renderDocument(
      "MERIT_LIST",
      { exam_name: `${cycle.name} — Merit List`, class_name: cycle.class.name_en, academic_year_label: cycle.academic_year.label, rows },
      { pageSize: "A4" },
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Merit_List_${cycle.name.replace(/\s+/g, "_")}.pdf"`);
    res.send(pdf);
  }),
);
