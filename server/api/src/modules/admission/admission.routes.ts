import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { publicEndpointLimiter } from "../../middleware/rate-limit";
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
} from "@education-erp/validators";
import { generateStudentUID } from "../../utils/student-id.generator";
import { inheritSubjectsForClass } from "../../utils/subject-inheritance";
import { sendSms } from "../../services/sms.service";
import { sendNotification } from "../../services/notification.service";
import { getPaymentAdapter } from "../../services/payment";
import { badRequest, notFound, conflict } from "../../lib/errors";

export const admissionRouter = Router();

type PreviousResult = { gpa?: number; total_marks?: number } | null | undefined;

function meritScoreOf(previousResult: unknown): number {
  const r = (previousResult ?? {}) as PreviousResult;
  const gpa = typeof r?.gpa === "number" ? r.gpa : 0;
  const totalMarks = typeof r?.total_marks === "number" ? r.total_marks : 0;
  return gpa * 1000 + totalMarks / 1000;
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
        is_open: c.is_open,
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

    const applicationCount = await prisma.admissionApplication.count({ where: { cycle_id: cycle.id } });
    const prefix = cycle.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "ADM";
    const admission_roll = `${prefix}-${new Date().getFullYear()}-${String(applicationCount + 1).padStart(4, "0")}`;

    const application = await prisma.admissionApplication.create({
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

async function handleAdmissionCallback(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ", payload: unknown) {
  const adapter = getPaymentAdapter(gateway);
  const verified = await adapter.verifyCallback(payload);

  const application = await prisma.admissionApplication.findFirst({ where: { payment_id: verified.transaction_id } });
  if (!application) throw notFound("Application not found for this transaction");

  if (verified.success) {
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
      include: { cycle: { select: { name: true, merit_list_published_at: true } } },
    });
    if (!application) return res.json({ success: true, data: { found: false } });

    const guardianInfo = application.guardian_info as { phone?: string } | null;
    if (guardianInfo?.phone !== query.phone) return res.json({ success: true, data: { found: false } });

    // merit_rank is assigned the moment "Generate Merit List" runs (so the
    // admin can review before committing), but must stay invisible to
    // applicants until they deliberately click "Publish & Notify".
    const meritPublished = application.cycle.merit_list_published_at !== null;

    res.json({
      success: true,
      data: {
        found: true,
        admission_roll: application.admission_roll,
        applicant_name: application.applicant_name,
        cycle_name: application.cycle.name,
        status: application.status,
        merit_rank: meritPublished ? application.merit_rank : null,
      },
    });
  }),
);

// ───────────────────────── Admin: Application Processing ─────────────────────────

admissionRouter.get(
  "/applications",
  authenticate,
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
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: true } });
    if (!application) throw notFound("Application not found");
    res.json({ success: true, data: application });
  }),
);

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
    const application = await prisma.admissionApplication.findUnique({ where: { id } });
    if (!application) throw notFound("Application not found");
    if (application.status !== "SHORTLISTED") throw badRequest("Only shortlisted applications can be confirmed");

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

    const guardianInfo = application.guardian_info as { father_name?: string; mother_name?: string; phone: string; email?: string; address?: string };
    const personalInfo = application.personal_info as Record<string, unknown>;

    const student = await prisma.$transaction(async (tx) => {
      let guardian = await tx.guardian.findFirst({ where: { phone: guardianInfo.phone } });
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
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
      const tempPassword = `Stu${randomBytes(4).toString("hex")}!1`;
      const password_hash = await bcrypt.hash(tempPassword, 10);

      const user = studentPhone
        ? await tx.user.create({ data: { name_en: application.applicant_name, role: "STUDENT", phone: studentPhone, password_hash } })
        : null;

      const created = await tx.student.create({
        data: {
          user_id: user?.id,
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
      );

      if (application.cycle.app_fee > 0) {
        await tx.invoice.create({
          data: {
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

      await tx.admissionApplication.update({ where: { id: application.id }, data: { status: "ENROLLED", enrolled_student_id: created.id } });

      return created;
    });

    const guardian = await prisma.guardian.findFirst({ where: { phone: guardianInfo.phone }, select: { user_id: true, email: true } });
    await sendNotification({
      trigger: "ADMISSION_CONFIRM",
      recipients: [{ name: application.applicant_name, phone: guardianInfo.phone, email: guardian?.email, user_id: guardian?.user_id, person_id: student.id }],
      template_data: { student_name: application.applicant_name, student_uid: student.student_uid },
    });

    res.status(201).json({ success: true, data: student });
  }),
);

// ───────────────────────── Documents (structured JSON — PDF rendering lands in Phase 10) ─────────────────────────

admissionRouter.get(
  "/applications/:id/admit-card",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const application = await prisma.admissionApplication.findUnique({ where: { id }, include: { cycle: { include: { class: true } } } });
    if (!application) throw notFound("Application not found");
    if (application.status === "PENDING" || application.status === "REJECTED") throw badRequest("Admit card is only available for shortlisted/waitlisted/confirmed applications");

    res.json({
      success: true,
      data: {
        admission_roll: application.admission_roll,
        applicant_name: application.applicant_name,
        cycle_name: application.cycle.name,
        class_name: application.cycle.class.name_en,
        status: application.status,
        note: "PDF rendering for admit cards is implemented in Phase 10 (Document Generation) — this is the structured data payload.",
      },
    });
  }),
);

admissionRouter.get(
  "/cycles/:id/merit-list/pdf",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const applications = await prisma.admissionApplication.findMany({
      where: { cycle_id: id, merit_rank: { not: null } },
      orderBy: { merit_rank: "asc" },
    });
    res.json({
      success: true,
      data: {
        rows: applications.map((a) => ({ rank: a.merit_rank, admission_roll: a.admission_roll, applicant_name: a.applicant_name, status: a.status })),
        note: "PDF rendering lands in Phase 10 (Document Generation) — this is the structured data payload.",
      },
    });
  }),
);
