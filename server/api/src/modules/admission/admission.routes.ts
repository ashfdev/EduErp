import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
import { documentUpload, verifyDocumentMagicBytes, imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer, getSignedDownloadUrl } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { ADMISSION_MANAGE_ROLES, ADMISSION_ENROLL_ROLES, ADMISSION_READ_ROLES } from "../../lib/roles";
import {
  createAdmissionCycleSchema,
  updateAdmissionCycleSchema,
  toggleAdmissionCycleSchema,
  admissionFormConfigSchema,
  submitAdmissionApplicationSchema,
  admissionApplicationStatusSchema,
  admissionBulkActionSchema,
  admissionNotesSchema,
  admissionEnrollSchema,
  admissionPaymentGatewaySchema,
  admissionPaymentManualSchema,
  admissionStatusLookupSchema,
  admissionStageTypeSchema,
  admissionStageDefaultsSchema,
  admissionStageBulkAssignSchema,
  admissionStageOverrideSchema,
  admissionStageOutcomeSchema,
  admissionStageBulkNotifySchema,
} from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { generateInvoiceNo } from "../fees/fee-number.generator";
import { createMonthlyInvoiceIfMissing, applyWaiversToInvoice } from "../fees/invoice-helpers";
import { feeStructureAppliesToStudent } from "../fees/fee-structure-scope";
import { inheritSubjectsForClass, assertGroupSelectedIfRequired } from "../../utils/subject-inheritance";
import { sendNotification } from "../../services/notification.service";
import { notifyRoles } from "../../services/in-app-notification.service";
import { createOrLinkPortalLogin } from "../../lib/portal-login";
import { assertSectionCapacity } from "../../lib/section-capacity";
import { env } from "../../lib/env";
import { getPaymentAdapter } from "../../services/payment";
import { completePayment } from "../fees/payments.routes";
import { computeApplicationPaymentStatus } from "./admission-payment-status";
import { renderDocument, renderDocumentBatch } from "../../services/pdf.service";
import { badRequest, notFound, conflict } from "../../lib/errors";
import type { AdmissionApplication, AdmissionCycle, AdmissionApplicationStage, Class, AcademicYear, AdmissionStatus, AdmissionStageType } from "@education-erp/db";
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
};

// Plan Twenty-Three Phase 5 -- REGISTRATION_CARD is reused, parametrized by
// stage, rather than a new DocumentType per stage.
const STAGE_TITLE: Record<AdmissionStageType, string> = {
  WRITTEN_TEST: "WRITTEN TEST",
  INTERVIEW: "INTERVIEW",
};

// Shared by the single-application, batch, and public stage-card download
// endpoints — builds the REGISTRATION_CARD template's data shape
// (applicant/test), not the academic student.* shape, since no Student row
// exists pre-enrollment. One stage (Written Test OR Interview) per card —
// an applicant scheduled for both downloads two separate cards.
function buildRegistrationCardData(application: ApplicationForCard, stage: AdmissionApplicationStage) {
  const guardianInfo = application.guardian_info as { father_name?: string; mother_name?: string } | null;
  const cycle = application.cycle;

  return {
    applicant: {
      name: application.applicant_name,
      roll: application.admission_roll,
      father_name: guardianInfo?.father_name ?? "",
      mother_name: guardianInfo?.mother_name ?? "",
      class_name: cycle.class.name_en,
      // Own dedicated column now (Plan Twenty-Three, Phase 2) -- was
      // previously read from the untyped documents Json map, which broke
      // once real document tracking moved to StudentDocument rows.
      photo_url: application.photo_url ?? null,
    },
    stage_title: STAGE_TITLE[stage.stage_type],
    test: {
      date: stage.scheduled_date,
      day: stage.scheduled_date ? new Date(stage.scheduled_date).toLocaleDateString("en-US", { weekday: "long" }) : "",
      time: stage.scheduled_date ? new Date(stage.scheduled_date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "",
      duration_minutes: stage.duration_minutes,
      venue: stage.venue ?? "TBA",
      hall: stage.hall_name ?? "TBA",
      seat_no: stage.seat_number ?? "TBA",
      instructions: stage.instructions ?? "Please arrive 30 minutes before the scheduled time with this card and a valid photo ID.",
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
  authorize(ADMISSION_READ_ROLES),
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
  authorize(ADMISSION_READ_ROLES),
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
  authorize(ADMISSION_READ_ROLES),
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
  authorize(ADMISSION_READ_ROLES),
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

// Pre-application photo upload -- no AdmissionApplication row exists yet,
// mirrors students.routes.ts's own pre-creation photo route exactly.
admissionRouter.post(
  "/upload-photo",
  publicEndpointLimiter,
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A photo file is required");
    const { url } = await uploadBuffer("admission-photos", req.file.originalname, req.file.buffer, req.file.mimetype);
    res.status(201).json({ success: true, data: { photo_url: url } });
  }),
);

// Returns blob_key (not a permanent public URL) -- the wizard stages
// {doc_type, slot?, blob_key, ...} client-side and sends the whole array to
// POST /apply, which creates the real StudentDocument rows transactionally
// once an application actually exists (Plan Twenty-Three, Phase 2).
// preview_url is a short-lived signed link for the wizard's own "preview
// file" affordance only -- never persisted anywhere.
admissionRouter.post(
  "/upload-document",
  publicEndpointLimiter,
  documentUpload.single("file"),
  verifyDocumentMagicBytes,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A file is required");
    const { blobKey } = await uploadBuffer("admission-documents", req.file.originalname, req.file.buffer, req.file.mimetype);
    const preview_url = await getSignedDownloadUrl(blobKey, 60);
    res.status(201).json({
      success: true,
      data: { blob_key: blobKey, preview_url, original_filename: req.file.originalname, mime_type: req.file.mimetype },
    });
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
    }

    // Base document requirements, always on for every cycle (Plan
    // Twenty-Three, Phase 2) -- replaces "No documents required" as the
    // default for every new cycle, which was really just an empty
    // form_config.document_uploads[] with nothing filling it in.
    const uploaded = body.uploaded_documents;
    if (!body.photo_url) throw badRequest("A student photo is required");
    if (!body.identity_type) throw badRequest("Select which identity document you're providing: Birth Certificate or NID");
    if (body.identity_type === "BIRTH_CERTIFICATE") {
      const count = uploaded.filter((d) => d.doc_type === "BIRTH_CERTIFICATE").length;
      if (count !== 1) throw badRequest("Upload exactly one Birth Certificate file");
    } else {
      const front = uploaded.some((d) => d.doc_type === "NID" && d.slot === "FRONT");
      const back = uploaded.some((d) => d.doc_type === "NID" && d.slot === "BACK");
      if (!front || !back) throw badRequest("Upload both the front and back of the NID");
    }
    if (uploaded.filter((d) => d.doc_type === "MARKSHEET").length !== 1) {
      throw badRequest("Upload your previous class's pass transcript/result card");
    }

    // Cycle-specific extras (form_config.document_uploads[]) stay separate
    // from the fixed base set above -- kept as the mechanism for a
    // cycle-specific ask beyond Birth Cert/NID/Marksheet/Testimonial/TC,
    // matched by label_key rather than doc_type (they all land as OTHER).
    if (config?.document_uploads?.length) {
      const providedKeys = new Set(uploaded.filter((d) => d.doc_type === "OTHER").map((d) => d.label_key));
      const missingDocs = config.document_uploads.filter((d) => d.required && !providedKeys.has(d.key)).map((d) => d.key);
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
            photo_url: body.photo_url,
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

    // Deliberately outside the roll-number retry loop above, not wrapped
    // together in one $transaction -- retrying a *poisoned* Postgres
    // transaction on a caught error is a real, previously-hit bug in this
    // exact codebase (a statement error poisons every later statement on
    // the same tx client, even if caught in JS). The retry loop above needs
    // a fresh, unpoisoned client on every attempt, so it stays a plain
    // sequential prisma call, not tx.create(). Document rows are created
    // immediately after the application successfully commits instead.
    if (uploaded.length) {
      await prisma.studentDocument.createMany({
        data: uploaded.map((d) => ({
          application_id: application!.id,
          doc_type: d.doc_type,
          slot: d.slot ?? null,
          blob_key: d.blob_key,
          original_filename: d.original_filename,
          mime_type: d.mime_type,
        })),
      });
    }

    // Plan Twenty-Three Phase 3 -- invoices are created here, at apply time,
    // not lazily at enroll time, so "payment due" is knowable the moment an
    // application is submitted and the payment-status gate on shortlist/
    // confirm/merit-list has something real to check from day one.
    // Application-linked (student_id: null) until enroll-time "claims" them
    // by filling in student_id rather than creating fresh ones. Deliberately
    // its own $transaction, separate from the roll-number retry loop above
    // (which must stay a plain sequential call, never a poisoned-tx retry).
    if (cycle.app_fee > 0 || cycle.form_fee > 0) {
      const feeRules = await prisma.feeRules.findFirst();
      const dueDate = new Date(Date.now() + (feeRules?.grace_period_days ?? 7) * 24 * 60 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        if (cycle.app_fee > 0) {
          const admissionInvoice = await tx.invoice.create({
            data: {
              invoice_no: await generateInvoiceNo(tx),
              application_id: application!.id,
              academic_year_id: cycle.academic_year_id,
              category: "ADMISSION",
              description: `Admission Fee — ${cycle.name}`,
              amount_due: cycle.app_fee,
              due_date: dueDate,
              status: "PENDING",
            },
          });
          await applyWaiversToInvoice(tx, admissionInvoice);
        }
        if (cycle.form_fee > 0) {
          const formInvoice = await tx.invoice.create({
            data: {
              invoice_no: await generateInvoiceNo(tx),
              application_id: application!.id,
              academic_year_id: cycle.academic_year_id,
              category: "FORM",
              description: `Form Fee — ${cycle.name}`,
              amount_due: cycle.form_fee,
              due_date: dueDate,
              status: "PENDING",
            },
          });
          await applyWaiversToInvoice(tx, formInvoice);
        }
      });
    }

    await sendNotification({
      trigger: "ADMISSION_APPLICATION_RECEIVED",
      recipients: [{ name: body.applicant_name, phone: body.guardian_info.phone }],
      template_data: { applicant_name: body.applicant_name, admission_roll },
    });
    await notifyRoles(ADMISSION_MANAGE_ROLES, {
      type: "ADMISSION_APPLICATION_SUBMITTED",
      title: "New admission application",
      body: `${body.applicant_name} applied (Roll: ${admission_roll})`,
      link: `/admission/applications/${application.id}`,
    });

    res.status(201).json({ success: true, data: { id: application.id, admission_roll, app_fee: cycle.app_fee } });
  }),
);

// ───────────────────────── Payment (Plan Twenty-Three, Phase 3) ─────────────────────────
// Invoices are now created at /apply time (see above), real Invoice/
// Payment rows linked via Invoice.application_id -- every route below is
// keyed by admission_roll+phone (same identity pair the status-check page
// already uses), never a raw application_id, so a payment action can't be
// taken by anyone who only knows the internal cuid.

admissionRouter.get(
  "/application/payment-info",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = admissionStatusLookupSchema.parse(req.query);
    const application = await prisma.admissionApplication.findUnique({
      where: { admission_roll: query.admission_roll },
      include: { invoices: { orderBy: { created_at: "asc" }, include: { payments: { orderBy: { created_at: "desc" } } } } },
    });
    if (!application) throw notFound("Application not found");
    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) throw notFound("Application not found");

    const gatewayNames = ["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET"] as const;
    const gateways: Record<string, boolean> = {};
    for (const g of gatewayNames) gateways[g] = await getPaymentAdapter(g).isConfigured();

    const instructions = await prisma.admissionPaymentInstructions.findUnique({ where: { id: "singleton" } });

    res.json({
      success: true,
      data: {
        payment_status: computeApplicationPaymentStatus(application.invoices),
        invoices: application.invoices.map((inv) => ({
          id: inv.id,
          category: inv.category,
          description: inv.description,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          fine_amount: inv.fine_amount,
          status: inv.status,
          // Distinguishes "unpaid, no action taken yet" from "already
          // self-reported, awaiting staff verification" on the status page.
          pending_verification: inv.payments.some((p) => p.status === "INITIATED"),
        })),
        gateways,
        payment_instructions: instructions,
      },
    });
  }),
);

admissionRouter.post(
  "/application/payment/gateway",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const body = admissionPaymentGatewaySchema.parse(req.body);
    const application = await prisma.admissionApplication.findUnique({ where: { admission_roll: body.admission_roll } });
    if (!application) throw notFound("Application not found");
    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== body.phone) throw notFound("Application not found");

    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice || invoice.application_id !== application.id) throw notFound("Invoice not found for this application");
    if (invoice.status === "PAID" || invoice.status === "WAIVED") throw badRequest("This invoice is already fully paid");

    const adapter = getPaymentAdapter(body.gateway);
    if (!(await adapter.isConfigured())) {
      // Deliberately a graceful {configured:false}, not a 400 -- every
      // gateway remains a non-functional stub (real merchant credentials
      // are pending), so this is the expected, common response here, not an
      // error state to alarm the applicant with. The frontend falls back to
      // the manual self-report flow below when it sees this.
      res.json({ success: true, data: { configured: false } });
      return;
    }

    const transactionId = randomUUID();
    const outstanding = Math.max(0, invoice.amount_due + invoice.fine_amount - invoice.amount_paid);
    const result = await adapter.initiatePayment({ invoice_id: invoice.id, amount: outstanding, transaction_id: transactionId });
    await prisma.payment.create({
      data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: transactionId, amount: outstanding, status: "INITIATED" },
    });

    res.json({ success: true, data: { configured: true, payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

admissionRouter.post(
  "/application/payment/manual",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const body = admissionPaymentManualSchema.parse(req.body);
    const application = await prisma.admissionApplication.findUnique({ where: { admission_roll: body.admission_roll } });
    if (!application) throw notFound("Application not found");
    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== body.phone) throw notFound("Application not found");

    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice || invoice.application_id !== application.id) throw notFound("Invoice not found for this application");
    if (invoice.status === "PAID" || invoice.status === "WAIVED") throw badRequest("This invoice is already fully paid");

    let payment;
    try {
      payment = await prisma.payment.create({
        data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: body.transaction_id, amount: body.amount, status: "INITIATED" },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw conflict("This transaction ID has already been reported for a payment");
      }
      throw err;
    }

    await notifyRoles(ADMISSION_MANAGE_ROLES, {
      type: "ADMISSION_PAYMENT_PENDING_VERIFICATION",
      title: "Payment awaiting verification",
      body: `${application.applicant_name} (Roll: ${application.admission_roll}) reported a ${body.gateway} payment of ৳${body.amount}`,
      link: `/admission/applications/${application.id}`,
    });

    res.status(201).json({ success: true, data: payment });
  }),
);

async function handleAdmissionCallback(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ" | "ROCKET", payload: unknown) {
  const adapter = getPaymentAdapter(gateway);
  const verified = await adapter.verifyCallback(payload);

  const payment = await prisma.payment.findUnique({ where: { transaction_id: verified.transaction_id } });
  if (!payment) throw notFound("Payment not found for this transaction");

  if (verified.success) {
    await completePayment(payment);
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  }
  // Deliberately does NOT touch AdmissionApplication.status -- payment
  // completion only ever affects invoice/payment/receipt/journal state now
  // (Plan Twenty-Three, Phase 3). Moving an application to CONFIRMED stays a
  // separate, explicit staff action via PUT /applications/:id/status, which
  // is itself gated on payment_status being satisfied. This is a deliberate
  // behavior change from the previous auto-confirm-on-payment shortcut,
  // which bypassed both the shortlist step and the seat-count check that
  // /confirm and /enroll both carefully enforce.
  return { received: true };
}

admissionRouter.post("/payment/callback/:gateway", asyncHandler(async (req, res) => {
  const gateway = reqParam(req, "gateway").toUpperCase();
  if (!["BKASH", "NAGAD", "SSLCOMMERZ", "ROCKET"].includes(gateway)) throw badRequest("Unknown gateway");
  res.json({ success: true, data: await handleAdmissionCallback(gateway as "BKASH" | "NAGAD" | "SSLCOMMERZ" | "ROCKET", req.body) });
}));

admissionRouter.get(
  "/application/status",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = admissionStatusLookupSchema.parse(req.query);
    const application = await prisma.admissionApplication.findUnique({
      where: { admission_roll: query.admission_roll },
      include: {
        cycle: { select: { name: true, merit_list_published_at: true, requires_written_test: true, requires_interview: true } },
        stages: true,
      },
    });
    if (!application) return res.json({ success: true, data: { found: false } });

    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) return res.json({ success: true, data: { found: false } });

    // merit_rank is assigned the moment "Generate Merit List" runs (so the
    // admin can review before committing), but must stay invisible to
    // applicants until they deliberately click "Publish & Notify".
    const meritPublished = application.cycle.merit_list_published_at !== null;

    // Plan Twenty-Three Phase 5 -- only a stage the admin has deliberately
    // notified (notified_at, a per-row gate, not cycle-wide) is visible to
    // the applicant at all. An un-required/un-scheduled stage cleanly
    // doesn't appear here, and notifying a later batch never disturbs an
    // already-notified earlier one.
    const stages = application.stages
      .filter((s) => s.notified_at !== null)
      .map((s) => ({
        stage_type: s.stage_type,
        scheduled_date: s.scheduled_date,
        venue: s.venue,
        duration_minutes: s.duration_minutes,
        instructions: s.instructions,
        hall_name: s.hall_name,
        seat_number: s.seat_number,
        status: s.status,
        card_available: application.status !== "REJECTED",
      }));

    res.json({
      success: true,
      data: {
        found: true,
        admission_roll: application.admission_roll,
        applicant_name: application.applicant_name,
        cycle_name: application.cycle.name,
        status: application.status,
        merit_rank: meritPublished ? application.merit_rank : null,
        // Plan Twenty-Three Phase 6 -- lets the public stepper render an
        // "upcoming" (not-yet-scheduled) step for a stage this cycle
        // actually has, distinct from a stage the cycle never had at all
        // (which correctly never appears in `stages` below either way).
        requires_written_test: application.cycle.requires_written_test,
        requires_interview: application.cycle.requires_interview,
        stages,
      },
    });
  }),
);

admissionRouter.get(
  "/application/stage-card",
  publicEndpointLimiter,
  asyncHandler(async (req, res) => {
    const query = admissionStatusLookupSchema.extend({ stage_type: admissionStageTypeSchema }).parse(req.query);
    const application = await prisma.admissionApplication.findUnique({
      where: { admission_roll: query.admission_roll },
      include: { cycle: { include: { class: true, academic_year: true } }, stages: true },
    });
    if (!application) throw notFound("Application not found");

    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) throw notFound("Application not found");

    const stage = application.stages.find((s) => s.stage_type === query.stage_type);
    const eligible = stage && stage.notified_at !== null && application.status !== "REJECTED";
    if (!eligible || !stage) throw badRequest("This card is not available for this application yet");

    const data = buildRegistrationCardData(application, stage);
    const pdf = await renderDocument("REGISTRATION_CARD", data, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${stage.stage_type}_Card_${application.admission_roll}.pdf"`);
    res.send(pdf);
  }),
);

// ───────────────────────── Admin: Application Processing ─────────────────────────

admissionRouter.get(
  "/applications",
  authenticate,
  authorize(ADMISSION_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        cycle_id: z.string().optional(),
        // Plan Twenty-Three Phase 4 -- lets the new cross-cycle list narrow
        // to one class regardless of which specific cycle/year it ran under
        // (a class can have several cycles across sessions).
        class_id: z.string().optional(),
        status: z.string().optional(),
        // Plan Twenty-Three Phase 3 -- payment_status is derived (never a
        // stored column), so it can't be pushed into the Prisma `where`
        // clause directly; filtered in application code after computing it
        // per row (fine at this scale -- one admission cycle's applications,
        // not the whole institution's invoice table).
        payment_status: z.enum(["NOT_REQUIRED", "DUE", "PARTIAL", "PENDING_VERIFICATION", "PAID"]).optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      ...(query.cycle_id && { cycle_id: query.cycle_id }),
      ...(query.class_id && { cycle: { class_id: query.class_id } }),
      ...(query.status && { status: query.status as never }),
      ...(query.search && {
        OR: [
          { applicant_name: { contains: query.search, mode: "insensitive" as const } },
          { admission_roll: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const all = await prisma.admissionApplication.findMany({
      where,
      include: {
        cycle: { select: { id: true, name: true, class: { select: { id: true, name_en: true } } } },
        invoices: { include: { payments: true } },
      },
      orderBy: { created_at: "desc" },
    });

    const withPaymentStatus = all.map((a) => ({
      ...a,
      payment_status: computeApplicationPaymentStatus(a.invoices),
      // Summed across every linked invoice (admission + form can both be
      // outstanding) -- the list row shows one combined due figure rather
      // than making staff open each application to see the breakdown.
      amount_due: a.invoices.reduce((sum, inv) => sum + inv.amount_due + inv.fine_amount - inv.amount_paid, 0),
      amount_paid: a.invoices.reduce((sum, inv) => sum + inv.amount_paid, 0),
    }));
    const filtered = query.payment_status ? withPaymentStatus.filter((a) => a.payment_status === query.payment_status) : withPaymentStatus;

    const total = filtered.length;
    const items = filtered.slice((query.page - 1) * query.limit, (query.page - 1) * query.limit + query.limit).map(({ invoices: _invoices, ...rest }) => rest);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

// Dedicated admission-payments reconciliation view -- distinct from both the
// global Fee Receipts screen (accounts/receipts, every completed payment
// across the whole institution) and the global Bank Transfer Verification
// queue (fees/bank-transfers, every pending manual payment regardless of
// source). This one is scoped to *admission applications only*, spans both
// pending and completed in one place, and is where staff should look
// specifically during an open admission window to answer "what's actually
// coming in against applications right now."
admissionRouter.get(
  "/payments",
  authenticate,
  authorize(ADMISSION_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        cycle_id: z.string().optional(),
        status: z.enum(["INITIATED", "COMPLETED", "FAILED"]).optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query);

    const where = {
      invoice: {
        application_id: { not: null },
        ...(query.cycle_id && { application: { cycle_id: query.cycle_id } }),
      },
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { transaction_id: { contains: query.search, mode: "insensitive" as const } },
          { receipt_no: { contains: query.search, mode: "insensitive" as const } },
          { invoice: { application: { applicant_name: { contains: query.search, mode: "insensitive" as const } } } },
          { invoice: { application: { admission_roll: { contains: query.search, mode: "insensitive" as const } } } },
        ],
      }),
    };

    const [items, total, summary] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              category: true,
              description: true,
              amount_due: true,
              application: { select: { id: true, applicant_name: true, admission_roll: true, cycle: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.payment.count({ where }),
      // Summary tiles reflect the *unfiltered* admission-payments universe
      // (or the cycle filter, if one's applied) -- deliberately ignoring the
      // search/status filters, so the tiles stay a stable "big picture" even
      // while someone's typing into the search box.
      prisma.payment.groupBy({
        by: ["status"],
        where: { invoice: { application_id: { not: null }, ...(query.cycle_id && { application: { cycle_id: query.cycle_id } }) } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    // Real gap found in audit (2026-08-08): the raw slip_blob_key was
    // leaking into the response alongside the correct signed URL -- see the
    // identical fix in fees/payments.routes.ts's own /bank-transfers/pending.
    const withSlipUrls = await Promise.all(
      items.map(async (p) => {
        const { slip_blob_key, ...rest } = p;
        return { ...rest, slip_url: slip_blob_key ? await getSignedDownloadUrl(slip_blob_key) : null };
      }),
    );

    res.json({
      success: true,
      data: withSlipUrls,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
      summary: {
        completed_total: summary.find((s) => s.status === "COMPLETED")?._sum.amount ?? 0,
        completed_count: summary.find((s) => s.status === "COMPLETED")?._count ?? 0,
        pending_count: summary.find((s) => s.status === "INITIATED")?._count ?? 0,
        failed_count: summary.find((s) => s.status === "FAILED")?._count ?? 0,
      },
    });
  }),
);

admissionRouter.get(
  "/applications/:id",
  authenticate,
  authorize(ADMISSION_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: {
        cycle: true,
        documents_uploaded: { orderBy: { uploaded_at: "asc" } },
        invoices: { orderBy: { created_at: "asc" }, include: { payments: { orderBy: { created_at: "desc" } } } },
        stages: true,
      },
    });
    if (!application) throw notFound("Application not found");

    // Signed URLs resolved server-side -- the frontend never sees a raw
    // blob_key, matching the same discipline already used for e.g. bank-
    // transfer slips (Plan Twenty-Three, Phase 2).
    const documentsWithUrls = await Promise.all(
      application.documents_uploaded.map(async (d) => ({ ...d, url: await getSignedDownloadUrl(d.blob_key, 15) })),
    );

    res.json({
      success: true,
      data: { ...application, documents_uploaded: documentsWithUrls, payment_status: computeApplicationPaymentStatus(application.invoices) },
    });
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

// Shared by the single-application status route, bulk-action, and confirm --
// previously each had its own independent (and inconsistent) guard, which is
// exactly how bulk-action ended up able to flip a REJECTED/CONFIRMED row
// backward despite this same table already existing. CONFIRMED targets get
// an additional seat-count check (previously only enforced at merit-list
// generation and at the old dedicated /confirm route) since CONFIRMED is now
// reachable through more than one route.
//
// Plan Twenty-Three Phase 3 -- payment-status gate, strict per the owner's
// explicit instruction: an application with anything outstanding (DUE,
// PARTIAL, or a self-report still PENDING_VERIFICATION) cannot be moved to
// SHORTLISTED/WAITLISTED/CONFIRMED at all, no exceptions. REJECTED bypasses
// the gate entirely -- an unpaid application can always still be cleared
// out. NOT_REQUIRED (a free cycle) and PAID both pass through untouched.
async function assertCanTransition(
  application: AdmissionApplication & { invoices: Parameters<typeof computeApplicationPaymentStatus>[0] },
  targetStatus: AdmissionStatus,
  cycle: AdmissionCycle,
): Promise<void> {
  if (application.status === "ENROLLED") throw conflict("Cannot change status of an already-enrolled application");
  if (!ALLOWED_STATUS_TRANSITIONS[application.status].includes(targetStatus)) {
    throw conflict(`Cannot change status from ${application.status} to ${targetStatus}`);
  }
  if (targetStatus !== "REJECTED") {
    const paymentStatus = computeApplicationPaymentStatus(application.invoices);
    if (paymentStatus !== "NOT_REQUIRED" && paymentStatus !== "PAID") {
      throw conflict(`Cannot shortlist/waitlist/confirm this application — payment is not complete (${paymentStatus})`);
    }
  }
  if (targetStatus === "CONFIRMED") {
    const takenSeats = await prisma.admissionApplication.count({
      where: { cycle_id: application.cycle_id, status: { in: ["CONFIRMED", "ENROLLED"] }, id: { not: application.id } },
    });
    if (takenSeats >= cycle.seat_count) throw conflict("No seats remaining for this admission cycle");
  }
}

admissionRouter.put(
  "/applications/:id/status",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = admissionApplicationStatusSchema.parse(req.body);
    const existing = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true, invoices: { include: { payments: true } } } });
    if (!existing) throw notFound("Application not found");
    await assertCanTransition(existing, body.status, existing.cycle);

    const updated = await prisma.admissionApplication.update({
      where: { id },
      data: { status: body.status, ...(body.notes !== undefined && { notes: body.notes }) },
    });

    const guardianInfo = existing.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone) {
      await sendNotification({
        trigger: "ADMISSION_STATUS_UPDATE",
        recipients: [{ name: existing.applicant_name, phone: guardianInfo.phone }],
        template_data: { applicant_name: existing.applicant_name, admission_roll: existing.admission_roll ?? "", status: body.status },
      });
    }

    res.json({ success: true, data: updated });
  }),
);

admissionRouter.put(
  "/applications/:id/notes",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = admissionNotesSchema.parse(req.body);
    const existing = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!existing) throw notFound("Application not found");
    const updated = await prisma.admissionApplication.update({ where: { id }, data: { notes: body.notes } });
    res.json({ success: true, data: updated });
  }),
);

admissionRouter.post(
  "/applications/bulk-action",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = admissionBulkActionSchema.parse(req.body);
    const applications = await prisma.admissionApplication.findMany({
      where: { id: { in: body.application_ids } },
      include: { cycle: true, invoices: { include: { payments: true } } },
    });
    const byId = new Map(applications.map((a) => [a.id, a]));

    // Sequential, not Promise.all -- CONFIRMED targets re-check the seat
    // count fresh on every iteration, so a batch that includes more
    // applicants than remaining seats correctly fills only what's left
    // instead of a race where every row in the batch reads the same
    // pre-loop count and all pass.
    const succeeded: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const appId of body.application_ids) {
      const application = byId.get(appId);
      if (!application) {
        skipped.push({ id: appId, reason: "Application not found" });
        continue;
      }
      try {
        await assertCanTransition(application, body.status, application.cycle);
        await prisma.admissionApplication.update({ where: { id: appId }, data: { status: body.status } });
        succeeded.push(appId);
      } catch (err) {
        skipped.push({ id: appId, reason: err instanceof Error ? err.message : "Transition not allowed" });
      }
    }

    res.json({ success: true, data: { succeeded, skipped } });
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

    // CONFIRMED/ENROLLED are excluded too, not just REJECTED -- a
    // CONFIRMED application (possibly already paid) was previously eligible
    // to be silently re-ranked back to SHORTLISTED/WAITLISTED by a second
    // merit-list generation run, the same terminal-status bug class already
    // fixed for bulk-action above.
    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { notIn: ["REJECTED", "CONFIRMED", "ENROLLED"] } },
      include: { invoices: { include: { payments: true } } },
    });

    // Payment-status gate (Plan Twenty-Three Phase 3, same strict rule as
    // /status, /bulk-action, /confirm) -- an unpaid applicant is excluded
    // from this run's ranking pool entirely (not just left un-shortlisted),
    // so a paid-but-lower-scoring applicant correctly fills the seat instead
    // of one still owing money. Left completely untouched (no merit_rank,
    // status stays whatever it was) so a later re-run after they pay ranks
    // them fairly against whoever's still in the pool at that point.
    const eligible: typeof applications = [];
    const skippedUnpaid: { id: string; admission_roll: string | null; applicant_name: string }[] = [];
    for (const a of applications) {
      const paymentStatus = computeApplicationPaymentStatus(a.invoices);
      if (paymentStatus === "NOT_REQUIRED" || paymentStatus === "PAID") {
        eligible.push(a);
      } else {
        skippedUnpaid.push({ id: a.id, admission_roll: a.admission_roll, applicant_name: a.applicant_name });
      }
    }

    const ranked = eligible
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
      skipped_unpaid: skippedUnpaid,
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

    // Real gap found in audit (2026-08-08): this was still a raw, hardcoded
    // English-only sendSms() call -- the only remaining admission touchpoint
    // not routed through the templated, bilingual, config-driven
    // sendNotification() system every other admission notification already
    // uses (see ADMISSION_STATUS_UPDATE/ADMISSION_STAGE_SCHEDULED above).
    let notified = 0;
    for (const app of applications) {
      const guardianInfo = app.guardian_info as { phone?: string } | null;
      if (guardianInfo?.phone) {
        await sendNotification({
          trigger: "ADMISSION_MERIT_LIST_PUBLISHED",
          recipients: [{ name: app.applicant_name, phone: guardianInfo.phone }],
          template_data: {
            applicant_name: app.applicant_name,
            admission_roll: app.admission_roll ?? "",
            status: app.status,
            merit_rank: app.merit_rank !== null ? String(app.merit_rank) : "",
          },
        });
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
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true, invoices: { include: { payments: true } } } });
    if (!application) throw notFound("Application not found");
    // WAITLISTED can now confirm directly here too -- previously excluded,
    // which meant a waitlisted applicant needed two separate admin actions
    // (route to SHORTLISTED via /status first, then this route) to ever
    // reach CONFIRMED. assertCanTransition's own transition-table lookup
    // already allows both SHORTLISTED and WAITLISTED -> CONFIRMED.
    await assertCanTransition(application, "CONFIRMED", application.cycle);

    const updated = await prisma.admissionApplication.update({ where: { id }, data: { status: "CONFIRMED" } });
    res.json({ success: true, data: updated });
  }),
);

// Preview of every class-wise fee an admin can choose to charge at
// enrollment, beyond the Admission/Form fees already collected at apply
// time (those two come from AdmissionCycle.app_fee/form_fee directly, not
// from the FeeStructure catalog, so they're deliberately excluded here --
// including them would either double-charge or just silently do nothing,
// since nothing reads an ADMISSION/FORM-category FeeStructure row for the
// online-admission flow). Everything else configured as a ONE_TIME
// structure for the destination class (Development Fee, ID Card Fee,
// Library Fee, etc.) plus the active MONTHLY tuition structure (first
// month) shows up here, exactly mirroring what /promote's readmission-fee
// lookup already does for one category -- generalized to every fee head an
// admin has actually set up for this class, and left to their explicit
// choice rather than silently auto-charging all of it.
admissionRouter.get(
  "/applications/:id/enrollment-fees",
  authenticate,
  authorize(ADMISSION_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const query = z.object({ group_id: z.string().optional() }).parse(req.query);
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");

    const candidates = await prisma.feeStructure.findMany({
      where: {
        academic_year_id: application.cycle.academic_year_id,
        is_active: true,
        category: { notIn: ["ADMISSION", "FORM"] },
        frequency: { in: ["ONE_TIME", "MONTHLY", "YEARLY"] },
        OR: [{ class_id: application.cycle.class_id }, { classes: { some: { class_id: application.cycle.class_id } } }],
      },
      include: { fee_sub_category: { select: { name: true } }, classes: { select: { class_id: true, group_id: true } } },
      orderBy: [{ frequency: "asc" }, { name: "asc" }],
    });
    // Group-aware narrowing (see fee-structure-scope.ts) -- same refinement
    // as the manual Add Student preview: the DB query above is a coarse
    // class-level filter, refined here against each row's group_id.
    const applicable = candidates.filter((s) =>
      s.classes.length === 0 || s.classes.some((c) => c.class_id === application.cycle.class_id && (c.group_id === null || c.group_id === query.group_id)),
    );

    res.json({
      success: true,
      data: applicable.map((s) => ({
        fee_structure_id: s.id,
        name: s.name,
        category: s.category,
        sub_category: s.fee_sub_category?.name ?? null,
        amount: s.amount,
        frequency: s.frequency,
      })),
    });
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
            // Previously always "FATHER" even when only mother_name was
            // actually supplied — the name would correctly show the
            // mother's, but the relation field would misleadingly say
            // father. Only falls back to FATHER when neither is set.
            relation: guardianInfo.father_name ? "FATHER" : guardianInfo.mother_name ? "MOTHER" : "FATHER",
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
          // Pre-existing gap, fixed here: the applicant's photo (required at
          // apply time since Phase 2) was never carried over to the new
          // Student row -- every enrolled student showed no photo despite
          // having uploaded a real one during application.
          photo_url: application.photo_url,
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

      // Claim every document uploaded during application (Plan Twenty-Three
      // Phase 2's two-owner nullable-FK pattern, same claim-at-enroll shape
      // as the invoices below) -- so the newly-enrolled student's own
      // Documents tab shows the birth certificate/NID/marksheet/photo they
      // already uploaded, instead of those being stranded on the now-closed
      // application with no link to the real student.
      await tx.studentDocument.updateMany({ where: { application_id: application.id }, data: { student_id: created.id } });

      // Previously due_date: new Date() — "due today, right now," so both
      // invoices below showed as OVERDUE within moments of being created.
      // Every other fee-generation path in this codebase (monthly tuition,
      // promotion-triggered readmission fees) gives a real forward due date;
      // this uses the same configured grace period so this one path isn't
      // the odd one out.
      const feeRules = await tx.feeRules.findFirst();
      const admissionInvoiceDueDate = new Date(Date.now() + (feeRules?.grace_period_days ?? 7) * 24 * 60 * 60 * 1000);

      // Plan Twenty-Three Phase 3 -- invoices are now created at /apply
      // time (see POST /apply above), not here. Claim the existing
      // application-linked invoice by filling in student_id
      // (application_id stays set afterward as historical provenance)
      // instead of creating a fresh, duplicate one. Falls back to creating
      // fresh only if no pre-enrollment invoice exists for that category
      // (e.g. the cycle's fee changed from 0 to nonzero between apply and
      // enroll, or this application predates apply-time invoicing) --
      // never silently missing a fee either way. Waiver auto-apply
      // (Plan Twenty-One follow-up) runs after claiming too -- in practice
      // a brand-new student rarely has a StudentWaiver yet, but
      // applyWaiversToInvoice is idempotent per waiver, so this stays
      // consistent with every other invoice-creation path rather than
      // being a silent, undocumented exception.
      const existingAdmissionInvoice = await tx.invoice.findFirst({ where: { application_id: application.id, category: "ADMISSION" } });
      if (existingAdmissionInvoice) {
        const claimed = await tx.invoice.update({ where: { id: existingAdmissionInvoice.id }, data: { student_id: created.id } });
        await applyWaiversToInvoice(tx, claimed);
      } else if (application.cycle.app_fee > 0) {
        const admissionInvoice = await tx.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(tx),
            student_id: created.id,
            academic_year_id: application.cycle.academic_year_id,
            category: "ADMISSION",
            description: `Admission Fee — ${application.cycle.name}`,
            amount_due: application.cycle.app_fee,
            due_date: admissionInvoiceDueDate,
            status: "PENDING",
          },
        });
        await applyWaiversToInvoice(tx, admissionInvoice);
      }

      const existingFormInvoice = await tx.invoice.findFirst({ where: { application_id: application.id, category: "FORM" } });
      if (existingFormInvoice) {
        const claimed = await tx.invoice.update({ where: { id: existingFormInvoice.id }, data: { student_id: created.id } });
        await applyWaiversToInvoice(tx, claimed);
      } else if (application.cycle.form_fee > 0) {
        const formInvoice = await tx.invoice.create({
          data: {
            invoice_no: await generateInvoiceNo(tx),
            student_id: created.id,
            academic_year_id: application.cycle.academic_year_id,
            category: "FORM",
            description: `Form Fee — ${application.cycle.name}`,
            amount_due: application.cycle.form_fee,
            due_date: admissionInvoiceDueDate,
            status: "PENDING",
          },
        });
        await applyWaiversToInvoice(tx, formInvoice);
      }

      // Class-wise fees at enrollment: Development Fee, ID Card Fee, Library
      // Fee, first month's Tuition, or whatever else the admin has actually
      // configured as a ONE_TIME/MONTHLY FeeStructure for this class -- see
      // GET .../enrollment-fees, which the admin UI calls first to build the
      // checklist this array is chosen from. Omitted (no field sent at all)
      // falls back to the old behavior (every applicable MONTHLY structure,
      // first month only) so any pre-existing caller of this route keeps
      // working exactly as before this feature existed.
      const now = new Date();
      if (body.selected_fee_structure_ids) {
        for (const structureId of body.selected_fee_structure_ids) {
          const structure = await tx.feeStructure.findUnique({ where: { id: structureId } });
          if (!structure || !structure.is_active) continue;
          if (!(await feeStructureAppliesToStudent(tx, structure, application.cycle.class_id, body.section_id ?? null, created.id, body.group_id ?? null))) continue;
          if (structure.frequency === "MONTHLY") {
            await createMonthlyInvoiceIfMissing(tx, created.id, structure, now.getMonth() + 1, now.getFullYear());
          } else {
            const existingOneTime = await tx.invoice.findFirst({ where: { student_id: created.id, fee_structure_id: structure.id } });
            if (existingOneTime) continue;
            const oneTimeInvoice = await tx.invoice.create({
              data: {
                invoice_no: await generateInvoiceNo(tx),
                student_id: created.id,
                fee_structure_id: structure.id,
                academic_year_id: application.cycle.academic_year_id,
                category: structure.category,
                fee_sub_category_id: structure.fee_sub_category_id,
                description: structure.name,
                amount_due: structure.amount,
                due_date: structure.target_due_date ?? admissionInvoiceDueDate,
              },
            });
            await applyWaiversToInvoice(tx, oneTimeInvoice);
          }
        }
      } else {
        // Multi-class-aware (Phase N3) -- deliberately NOT filtered by class_id
        // in the DB query itself: a multi-class structure has its legacy
        // class_id scalar enforced null too, so a naive `OR: [{class_id:null},
        // ...]` here would wrongly match every multi-class structure against
        // every class. feeStructureAppliesToStudent resolves each candidate's
        // true scope (join-table rows first, legacy scalar fallback) instead.
        const monthlyStructures = await tx.feeStructure.findMany({
          where: { academic_year_id: application.cycle.academic_year_id, frequency: "MONTHLY", is_active: true },
        });
        for (const structure of monthlyStructures) {
          if (!(await feeStructureAppliesToStudent(tx, structure, application.cycle.class_id, body.section_id ?? null, created.id, body.group_id ?? null))) continue;
          await createMonthlyInvoiceIfMissing(tx, created.id, structure, now.getMonth() + 1, now.getFullYear());
        }
      }

      // Authoritative recheck, immediately before the status flip -- the
      // plain count() at the top of this handler is a cheap fast-path
      // rejection (avoids doing all the work above only to roll it back in
      // the common non-race case), but an unlocked recheck alone would NOT
      // close the race: under Postgres's default READ COMMITTED isolation,
      // a bare count() takes no row lock, so two concurrent enrollments for
      // the last seat could both observe the same pre-commit count and both
      // proceed to update their own (different) AdmissionApplication rows --
      // no write-write conflict between them, nothing blocks either one.
      // Locking the AdmissionCycle row (no dedicated seat-counter column
      // exists to lock directly) is what actually serializes this: a second
      // concurrent transaction blocks here until the first commits, so its
      // own recheck afterward observes true, current state.
      await tx.$queryRaw`SELECT id FROM "AdmissionCycle" WHERE id = ${application.cycle_id} FOR UPDATE`;
      const takenSeatsFinal = await tx.admissionApplication.count({
        where: { cycle_id: application.cycle_id, status: { in: ["CONFIRMED", "ENROLLED"] }, id: { not: application.id } },
      });
      if (takenSeatsFinal >= application.cycle.seat_count) throw conflict("No seats remaining for this admission cycle");

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

    // A role-incompatible phone match (e.g. this guardian's number already
    // belongs to an unrelated staff account) never silently links -- the
    // student still enrolls, just with no working login for that person,
    // surfaced here instead of vanishing with no trace.
    const loginWarnings: string[] = [];
    if (guardianLogin?.conflict) {
      loginWarnings.push(
        `Guardian phone ${guardianInfo.phone} already belongs to a ${guardianLogin.conflict.existingRole} account (${guardianLogin.conflict.existingName}) — no portal login was created for this guardian.`,
      );
    }
    if (studentLogin?.conflict) {
      loginWarnings.push(
        `Student phone ${studentPhoneForNotify} already belongs to a ${studentLogin.conflict.existingRole} account (${studentLogin.conflict.existingName}) — no portal login was created for this student.`,
      );
    }

    res.status(201).json({ success: true, data: student, login_warnings: loginWarnings.length ? loginWarnings : undefined });
  }),
);

// ───────────────────────── Assessment/Scheduling: Written Test + Interview (Plan Twenty-Three, Phase 5) ─────────────────────────
// Written Test and Interview are two independent, separately-schedulable
// stages -- each with its own per-applicant date/venue/room and its own
// pass/fail-equivalent outcome (AdmissionApplicationStage). Every route
// below mirrors AdmitCardOverride's already-proven "preview -> batch action
// -> narrower-role-audited" shape from this same codebase.

admissionRouter.put(
  "/cycles/:id/stages/:stage_type/defaults",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const body = admissionStageDefaultsSchema.parse(req.body);
    const existing = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!existing) throw notFound("Admission cycle not found");

    // These cycle-level fields are only ever used as the bulk-assign form's
    // default pre-fill -- the authoritative schedule lives per-applicant on
    // AdmissionApplicationStage, since staff can always individually
    // override one candidate's slot.
    const data =
      stageType === "WRITTEN_TEST"
        ? {
            requires_written_test: body.requires,
            written_test_date: body.scheduled_date,
            written_test_venue: body.venue,
            written_test_duration_minutes: body.duration_minutes,
            written_test_instructions: body.instructions,
          }
        : {
            requires_interview: body.requires,
            interview_date: body.scheduled_date,
            interview_venue: body.venue,
            interview_duration_minutes: body.duration_minutes,
            interview_instructions: body.instructions,
          };

    const updated = await prisma.admissionCycle.update({ where: { id }, data });
    res.json({ success: true, data: updated });
  }),
);

// Preview -- who will be included/excluded and why, before any batch action
// actually runs (mirrors AdmitCardOverride's own preview-then-act shape).
admissionRouter.get(
  "/cycles/:id/stages/:stage_type/status",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { in: ["SHORTLISTED", "WAITLISTED"] } },
      include: { stages: { where: { stage_type: stageType } } },
      orderBy: [{ merit_rank: "asc" }, { admission_roll: "asc" }],
    });

    res.json({
      success: true,
      data: applications.map((a) => ({
        id: a.id,
        admission_roll: a.admission_roll,
        applicant_name: a.applicant_name,
        status: a.status,
        merit_rank: a.merit_rank,
        stage: a.stages[0]
          ? {
              scheduled_date: a.stages[0].scheduled_date,
              venue: a.stages[0].venue,
              hall_name: a.stages[0].hall_name,
              seat_number: a.stages[0].seat_number,
              status: a.stages[0].status,
              notified_at: a.stages[0].notified_at,
            }
          : null,
      })),
    });
  }),
);

admissionRouter.post(
  "/cycles/:id/stages/:stage_type/bulk-assign",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const body = admissionStageBulkAssignSchema.parse(req.body);
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const requiresThisStage = stageType === "WRITTEN_TEST" ? cycle.requires_written_test : cycle.requires_interview;
    if (!requiresThisStage) {
      throw badRequest(`This cycle does not require ${stageType === "WRITTEN_TEST" ? "a written test" : "an interview"} -- set it up in Stage Defaults first`);
    }

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, status: { in: body.statuses } },
      orderBy: [{ merit_rank: "asc" }, { admission_roll: "asc" }],
    });

    const scheduledDate = body.scheduled_date ?? (stageType === "WRITTEN_TEST" ? cycle.written_test_date : cycle.interview_date) ?? undefined;
    const venue = body.venue ?? (stageType === "WRITTEN_TEST" ? cycle.written_test_venue : cycle.interview_venue) ?? undefined;
    const durationMinutes = body.duration_minutes ?? (stageType === "WRITTEN_TEST" ? cycle.written_test_duration_minutes : cycle.interview_duration_minutes) ?? undefined;
    const instructions = body.instructions ?? (stageType === "WRITTEN_TEST" ? cycle.written_test_instructions : cycle.interview_instructions) ?? undefined;

    type StageRow = {
      application_id: string;
      cycle_id: string;
      stage_type: AdmissionStageType;
      scheduled_date?: Date;
      venue?: string;
      duration_minutes?: number;
      instructions?: string;
      hall_name: string | null;
      seat_number: string | null;
    };
    const rows: StageRow[] = [];
    let overflow = 0;

    if (stageType === "WRITTEN_TEST") {
      // Preserves the existing multi-hall auto-sequencing by merit_rank/
      // admission_roll (already-proven logic, carried over unchanged from
      // the old cycle-wide seat-plan generator).
      const halls = body.halls ?? [];
      if (!halls.length) throw badRequest("At least one hall is required to assign the written test");
      const totalCapacity = halls.reduce((sum, h) => sum + h.capacity, 0);
      overflow = Math.max(0, applications.length - totalCapacity);

      let index = 0;
      for (const hall of halls) {
        for (let seat = body.start_seat; seat < body.start_seat + hall.capacity && index < applications.length; seat++, index++) {
          rows.push({ application_id: applications[index]!.id, cycle_id: id, stage_type: stageType, scheduled_date: scheduledDate, venue, duration_minutes: durationMinutes, instructions, hall_name: hall.name, seat_number: String(seat) });
        }
      }
    } else {
      // Interview has no hall/seat to walk -- every selected applicant
      // simply gets the same date/venue/duration/instructions.
      for (const app of applications) {
        rows.push({ application_id: app.id, cycle_id: id, stage_type: stageType, scheduled_date: scheduledDate, venue, duration_minutes: durationMinutes, instructions, hall_name: null, seat_number: null });
      }
    }

    // Upsert per row (not delete-then-recreate) -- a second bulk-assign run
    // naturally re-targets whoever's still SHORTLISTED/WAITLISTED at that
    // point without needing to wipe every existing row first.
    for (const row of rows) {
      await prisma.admissionApplicationStage.upsert({
        where: { application_id_stage_type: { application_id: row.application_id, stage_type: row.stage_type } },
        create: row,
        update: { scheduled_date: row.scheduled_date, venue: row.venue, duration_minutes: row.duration_minutes, instructions: row.instructions, hall_name: row.hall_name, seat_number: row.seat_number },
      });
    }

    res.json({ success: true, data: { assigned: rows.length, total_applications: applications.length, overflow } });
  }),
);

// Individual per-applicant override -- lets staff hand-adjust one
// candidate's slot without disturbing anyone else's (e.g. a room conflict
// or a genuine scheduling clash for that one family).
admissionRouter.put(
  "/applications/:id/stages/:stage_type",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const body = admissionStageOverrideSchema.parse(req.body);
    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw notFound("Application not found");

    const stage = await prisma.admissionApplicationStage.upsert({
      where: { application_id_stage_type: { application_id: id, stage_type: stageType } },
      create: {
        application_id: id,
        cycle_id: application.cycle_id,
        stage_type: stageType,
        scheduled_date: body.scheduled_date ?? undefined,
        venue: body.venue ?? undefined,
        duration_minutes: body.duration_minutes ?? undefined,
        instructions: body.instructions ?? undefined,
        hall_name: body.hall_name ?? undefined,
        seat_number: body.seat_number ?? undefined,
      },
      update: {
        scheduled_date: body.scheduled_date,
        venue: body.venue,
        duration_minutes: body.duration_minutes,
        instructions: body.instructions,
        hall_name: body.hall_name,
        seat_number: body.seat_number,
      },
    });
    res.json({ success: true, data: stage });
  }),
);

// Staff observes the outcome and separately decides whether/how to move the
// application forward -- this never automatically cascades into
// AdmissionStatus.
admissionRouter.put(
  "/applications/:id/stages/:stage_type/outcome",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const body = admissionStageOutcomeSchema.parse(req.body);

    const existing = await prisma.admissionApplicationStage.findUnique({
      where: { application_id_stage_type: { application_id: id, stage_type: stageType } },
    });
    if (!existing) throw notFound("This applicant has no scheduled stage of this type yet");

    const updated = await prisma.admissionApplicationStage.update({ where: { id: existing.id }, data: { status: body.status } });
    res.json({ success: true, data: updated });
  }),
);

// Deliberately a separate step from bulk-assign (mirrors the existing
// Generate Merit List -> Publish & Notify two-step pattern) -- staff can
// review/adjust a batch's schedule before it becomes visible to applicants.
// notified_at is per-row, not cycle-wide, so notifying one batch today and
// a different batch next week never disturbs the first.
admissionRouter.post(
  "/cycles/:id/stages/:stage_type/bulk-notify",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const body = admissionStageBulkNotifySchema.parse(req.body);
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const stages = await prisma.admissionApplicationStage.findMany({
      where: { cycle_id: id, stage_type: stageType, application_id: { in: body.application_ids } },
      include: { application: true },
    });

    let notified = 0;
    for (const stage of stages) {
      await prisma.admissionApplicationStage.update({
        where: { id: stage.id },
        data: { notified_at: new Date(), notice_message: body.notice_message ?? undefined },
      });

      const guardianInfo = stage.application.guardian_info as { phone?: string } | null;
      if (guardianInfo?.phone) {
        await sendNotification({
          trigger: "ADMISSION_STAGE_SCHEDULED",
          recipients: [{ name: stage.application.applicant_name, phone: guardianInfo.phone }],
          template_data: {
            applicant_name: stage.application.applicant_name,
            admission_roll: stage.application.admission_roll ?? "",
            stage_name: stageType === "WRITTEN_TEST" ? "Written Test" : "Interview",
            date: stage.scheduled_date ? stage.scheduled_date.toLocaleDateString() : "TBA",
            venue: stage.venue ?? "the institution",
          },
        });
        notified++;
      }
    }

    res.json({ success: true, data: { notified } });
  }),
);

// ───────────────────────── Documents ─────────────────────────

// Admin single-applicant card -- staff can always preview/download
// regardless of notified_at (unlike the public self-download route, which
// requires notified_at set), since staff routinely need to check a card
// before deciding to notify.
admissionRouter.get(
  "/applications/:id/stages/:stage_type/card",
  authenticate,
  authorize(ADMISSION_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const application = await prisma.admissionApplication.findUnique({
      where: { id },
      include: { cycle: { include: { class: true, academic_year: true } }, stages: { where: { stage_type: stageType } } },
    });
    if (!application) throw notFound("Application not found");
    const stage = application.stages[0];
    if (!stage) throw notFound("No scheduled stage of this type for this applicant");

    const data = buildRegistrationCardData(application, stage);
    const pdf = await renderDocument("REGISTRATION_CARD", data, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${stageType}_Card_${application.admission_roll}.pdf"`);
    res.send(pdf);
  }),
);

// Admin batch card -- every applicant currently scheduled for this stage in
// this cycle, regardless of notified_at.
admissionRouter.get(
  "/cycles/:id/stages/:stage_type/cards",
  authenticate,
  authorize(ADMISSION_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const stageType = admissionStageTypeSchema.parse(reqParam(req, "stage_type"));
    const cycle = await prisma.admissionCycle.findUnique({ where: { id } });
    if (!cycle) throw notFound("Admission cycle not found");

    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, stages: { some: { stage_type: stageType } } },
      include: { cycle: { include: { class: true, academic_year: true } }, stages: { where: { stage_type: stageType } } },
      orderBy: { admission_roll: "asc" },
    });
    if (!applications.length) throw badRequest("No applicants scheduled for this stage yet");

    const dataList = applications.map((a) => buildRegistrationCardData(a, a.stages[0]!));
    const pdf = await renderDocumentBatch("REGISTRATION_CARD", dataList, { pageSize: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${stageType}_Cards_${cycle.name.replace(/\s+/g, "_")}.pdf"`);
    res.send(pdf);
  }),
);

admissionRouter.get(
  "/cycles/:id/merit-list/pdf",
  authenticate,
  // Real gap found in audit (2026-08-08): this route had no authorize() at
  // all, so any authenticated account -- including STUDENT/GUARDIAN portal
  // logins -- could download the full ranked applicant list (names + GPA +
  // rank) via direct API, published or not. Gated to ADMISSION_MANAGE_ROLES,
  // matching the sibling /stages/:stage_type/cards route right above and
  // the /merit-list generate/publish routes below. Deliberately NOT also
  // gated on merit_list_published_at: admission staff already see this
  // exact ranked data in the generate response before publishing (that's
  // the whole point of generating it), so a publish gate here would only
  // block their normal internal-review workflow without closing any real
  // exposure -- the role gate alone is what was actually missing.
  authorize(ADMISSION_MANAGE_ROLES),
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
