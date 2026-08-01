import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { calculatePayrollSchema, updatePayrollSchema, finalizePayrollSchema, markPaidSchema } from "@education-erp/validators";
import { workingDaysInMonth } from "../../utils/working-days";
import { computeOvertime } from "../../utils/overtime";
import { resolveOwnStaffId } from "../../lib/own-staff";
import { STAFF_ONLY_ROLES } from "../../lib/roles";
import type { UserRole } from "@education-erp/types";
import { renderDocument } from "../../services/pdf.service";
import { uploadBuffer } from "../../services/storage.service";
import { createPayrollJournal, reverseVoucher } from "../accounts/auto-journal.service";
import { logAudit } from "../../lib/audit-log";
import { badRequest, notFound } from "../../lib/errors";

export const payrollRouter = Router();
payrollRouter.use(authenticate);

// Shared by /finalize, /:id/payslip, and documents.routes.ts's own payslip
// route -- one definition of "what goes on a payslip" (Plan Fourteen,
// Phase J3's itemized breakdown), so the three call sites can't drift.
// Earnings sub-components (basic/house_rent/medical/transport) are read
// live from the staff's current salary_structure rather than stored on the
// record itself -- gross_salary (the total) was never snapshotted either,
// so this carries the same already-accepted "reflects the structure as it
// is now" behavior the rest of this record already has, not a new
// limitation. Deduction sub-components (pf/tds/absence) ARE stored
// directly on the record (see /calculate below), since those depend on
// that month's own attendance data, not just the structure.
export function buildPayslipData(record: {
  staff: { salary_structure?: { basic: number; house_rent: number; medical: number; transport: number } | null } & Record<string, unknown>;
  month: number;
  year: number;
  gross_salary: number;
  deductions: number;
  advance_deducted: number;
  net_salary: number;
  working_days: number;
  present_days: number;
  overtime_pay: number;
  late_deduction: number;
  substitution_bonus: number;
  pf_amount: number;
  tds_amount: number;
  absent_deduction: number;
}) {
  const structure = record.staff.salary_structure;
  return {
    staff: record.staff,
    month: record.month,
    year: record.year,
    basic: structure?.basic ?? null,
    house_rent: structure?.house_rent ?? null,
    medical: structure?.medical ?? null,
    transport: structure?.transport ?? null,
    gross_salary: record.gross_salary,
    deductions: record.deductions,
    advance_deducted: record.advance_deducted,
    net_salary: record.net_salary,
    working_days: record.working_days,
    present_days: record.present_days,
    overtime_pay: record.overtime_pay,
    late_deduction: record.late_deduction,
    substitution_bonus: record.substitution_bonus,
    pf_amount: record.pf_amount,
    tds_amount: record.tds_amount,
    absent_deduction: record.absent_deduction,
  };
}

payrollRouter.post(
  "/calculate",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = calculatePayrollSchema.parse(req.body);

    const rules = await prisma.attendanceRules.findUnique({ where: { id: "singleton" } });
    const workingDays = workingDaysInMonth(body.year, body.month, rules?.working_days_per_week ?? 6);

    const staffList = await prisma.staff.findMany({
      where: {
        is_active: true,
        deleted_at: null,
        salary_structure_id: { not: null },
        ...(body.department_id && { department_id: body.department_id }),
      },
      include: { salary_structure: true },
    });

    const monthStart = new Date(body.year, body.month - 1, 1);
    const monthEnd = new Date(body.year, body.month, 1);

    let processed = 0;
    let totalPayable = 0;

    for (const staff of staffList) {
      const structure = staff.salary_structure!;
      const records = await prisma.attendanceRecord.findMany({
        where: { person_id: staff.id, person_type: "STAFF", date: { gte: monthStart, lt: monthEnd } },
        include: { shift: { select: { start_time: true, end_time: true } } },
      });
      const presentDays = records.filter((r) => r.status === "PRESENT" || r.status === "LATE" || r.status === "LEAVE" || r.status === "HALF_DAY").length;
      // Absence deduction only ever comes from an explicit ABSENT record —
      // a day with no attendance row at all contributes zero deduction,
      // never an inferred absence (see attendance_incomplete below for why
      // this matters: most staff simply have no attendance marked for most
      // days, and workingDays-presentDays used to treat all of that as
      // absence, which could deduct the entire basic salary).
      const absentDaysExplicit = records.filter((r) => r.status === "ABSENT").length;
      const lateDaysExplicit = records.filter((r) => r.status === "LATE").length;
      const attendanceIncomplete = records.length < workingDays;

      // Overtime hours summed across the month's own punch-derived
      // check_out_at/shift data — same computeOvertime() definition the
      // staff daily-attendance summary already uses, so the two surfaces
      // can never silently disagree (Plan Fourteen, Phase J2).
      const overtimeHours = records.reduce((sum, r) => sum + computeOvertime(r.check_out_at, r.shift?.start_time, r.shift?.end_time), 0);

      // Periods this staff member covered as a substitute this month
      // (Plan Fourteen, Phase J2) — the exact data Phase C's "Substitutions
      // Covered" profile section already surfaces, now also driving pay.
      const substitutionCount = await prisma.routineSubstitution.count({
        where: { substitute_teacher_id: staff.id, date: { gte: monthStart, lt: monthEnd } },
      });

      const gross = structure.basic + structure.house_rent + structure.medical + structure.transport;
      const perDaySalary = workingDays > 0 ? structure.basic / workingDays : 0;
      const pf = gross * (structure.pf_percentage / 100);
      const tds = gross * (structure.tds_percentage / 100);
      const absentDeduction = absentDaysExplicit * perDaySalary;
      // New payroll-depth terms (Plan Fourteen, Phase J) -- all default 0 on
      // a structure that never sets these rates, so every existing
      // structure produces byte-identical output to before this phase.
      const overtimePay = Math.round(overtimeHours * structure.overtime_rate_per_hour * 100) / 100;
      const lateDeduction = Math.round(lateDaysExplicit * structure.late_deduction_per_day * 100) / 100;
      const substitutionBonus = Math.round(substitutionCount * structure.substitution_bonus_per_period * 100) / 100;

      const deductions = pf + tds + absentDeduction + lateDeduction;
      const net = Math.max(0, gross + overtimePay + substitutionBonus - deductions);

      await prisma.payrollRecord.upsert({
        where: { staff_id_month_year: { staff_id: staff.id, month: body.month, year: body.year } },
        create: {
          staff_id: staff.id,
          month: body.month,
          year: body.year,
          working_days: workingDays,
          present_days: presentDays,
          attendance_incomplete: attendanceIncomplete,
          gross_salary: gross,
          deductions,
          net_salary: net,
          overtime_pay: overtimePay,
          late_deduction: lateDeduction,
          substitution_bonus: substitutionBonus,
          pf_amount: Math.round(pf * 100) / 100,
          tds_amount: Math.round(tds * 100) / 100,
          absent_deduction: Math.round(absentDeduction * 100) / 100,
          status: "DRAFT",
          processed_by_id: req.user!.sub,
        },
        update: {
          working_days: workingDays,
          present_days: presentDays,
          attendance_incomplete: attendanceIncomplete,
          gross_salary: gross,
          deductions,
          net_salary: net,
          overtime_pay: overtimePay,
          late_deduction: lateDeduction,
          substitution_bonus: substitutionBonus,
          pf_amount: Math.round(pf * 100) / 100,
          tds_amount: Math.round(tds * 100) / 100,
          absent_deduction: Math.round(absentDeduction * 100) / 100,
          status: "DRAFT",
          processed_by_id: req.user!.sub,
        },
      });

      processed++;
      totalPayable += net;
    }

    const roundedTotal = Math.round(totalPayable * 100) / 100;
    await prisma.payrollGenerationRun.create({
      data: { run_by_id: req.user!.sub, month: body.month, year: body.year, department_id: body.department_id, processed_count: processed, total_payable: roundedTotal },
    });

    res.json({ success: true, data: { processed, total_payable: roundedTotal } });
  }),
);

payrollRouter.get(
  "/",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ month: z.coerce.number().int().optional(), year: z.coerce.number().int().optional(), department_id: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const records = await prisma.payrollRecord.findMany({
      where: {
        ...(query.month && { month: query.month }),
        ...(query.year && { year: query.year }),
        ...(query.status && { status: query.status as never }),
        ...(query.department_id && { staff: { department_id: query.department_id } }),
      },
      include: { staff: { select: { name_en: true, staff_uid: true, department: { select: { name_en: true } } } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    res.json({ success: true, data: records });
  }),
);

payrollRouter.get(
  "/export",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ month: z.coerce.number().int().optional(), year: z.coerce.number().int().optional(), department_id: z.string().optional(), status: z.string().optional() }).parse(req.query);
    const records = await prisma.payrollRecord.findMany({
      where: {
        ...(query.month && { month: query.month }),
        ...(query.year && { year: query.year }),
        ...(query.status && { status: query.status as never }),
        ...(query.department_id && { staff: { department_id: query.department_id } }),
      },
      include: { staff: { select: { name_en: true, staff_uid: true, department: { select: { name_en: true } } } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Payroll");
    sheet.columns = [
      { header: "Staff ID", key: "staff_uid", width: 16 },
      { header: "Name", key: "name_en", width: 24 },
      { header: "Department", key: "department", width: 18 },
      { header: "Month", key: "month", width: 8 },
      { header: "Year", key: "year", width: 8 },
      { header: "Working Days", key: "working_days", width: 12 },
      { header: "Present Days", key: "present_days", width: 12 },
      { header: "Gross Salary", key: "gross_salary", width: 14 },
      { header: "Deductions", key: "deductions", width: 12 },
      { header: "Net Salary", key: "net_salary", width: 14 },
      { header: "Status", key: "status", width: 12 },
    ];
    for (const r of records) {
      sheet.addRow({
        staff_uid: r.staff.staff_uid,
        name_en: r.staff.name_en,
        department: r.staff.department?.name_en ?? "",
        month: r.month,
        year: r.year,
        working_days: r.working_days,
        present_days: r.present_days,
        gross_salary: r.gross_salary,
        deductions: r.deductions,
        net_salary: r.net_salary,
        status: r.status,
      });
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Payroll.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
);

payrollRouter.put(
  "/:id",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = updatePayrollSchema.parse(req.body);
    const existing = await prisma.payrollRecord.findUnique({ where: { id } });
    if (!existing) throw notFound("Payroll record not found");
    if (existing.status !== "DRAFT") throw badRequest("Only DRAFT payroll records can be adjusted");

    const grossSalary = body.gross_salary ?? existing.gross_salary;
    const deductions = body.deductions ?? existing.deductions;
    const advanceDeducted = body.advance_deducted ?? existing.advance_deducted;
    const netSalary = Math.max(0, grossSalary - deductions - advanceDeducted);

    const updated = await prisma.payrollRecord.update({
      where: { id },
      data: { gross_salary: grossSalary, deductions, advance_deducted: advanceDeducted, net_salary: netSalary },
    });
    res.json({ success: true, data: updated });
  }),
);

payrollRouter.post(
  "/finalize",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = finalizePayrollSchema.parse(req.body);
    const records = await prisma.payrollRecord.findMany({ where: { month: body.month, year: body.year, status: "DRAFT" }, include: { staff: { include: { salary_structure: true } } } });
    if (!records.length) throw badRequest("No draft payroll records found for this month");

    let generated = 0;
    for (const record of records) {
      try {
        const pdf = await renderDocument("PAYSLIP", buildPayslipData(record) as unknown as Record<string, unknown>);
        const { url } = await uploadBuffer("payslips", `${record.staff.staff_uid}-${record.month}-${record.year}.pdf`, pdf, "application/pdf");
        await prisma.payrollRecord.update({ where: { id: record.id }, data: { status: "FINALIZED", payslip_url: url } });
        generated++;
      } catch {
        // A single payslip render failure shouldn't block finalizing the rest of the batch.
      }
    }

    res.json({ success: true, data: { finalized: generated } });
  }),
);

payrollRouter.post(
  "/mark-paid",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = markPaidSchema.parse(req.body);
    const records = await prisma.payrollRecord.findMany({
      where: { id: { in: body.payroll_ids }, status: "FINALIZED" },
      include: { staff: true },
    });

    // Per-record, not a batch updateMany followed by a separate loop — a
    // batch update marks every record PAID before any journal is even
    // attempted, so a crash partway through the journal loop could leave
    // records PAID with literally no journal attempt made (not even a
    // recorded failure). createPayrollJournal() never throws (it catches
    // its own errors and records a JournalPostingFailure + notifies
    // ADMIN/ACCOUNTANT internally) and posts via the module-level prisma
    // client directly, not a tx — so it can't participate in a
    // $transaction anyway. Doing the status flip and the journal attempt
    // one record at a time means a mid-batch crash leaves every
    // not-yet-reached record still FINALIZED (safely re-runnable by
    // calling this route again with the same ids), narrowing the gap from
    // "the whole batch" to at most one record — already recoverable via
    // POST /payroll/:id/void.
    let updated = 0;
    for (const record of records) {
      await prisma.payrollRecord.update({ where: { id: record.id }, data: { status: "PAID", paid_at: new Date() } });
      await createPayrollJournal(record, record.staff);
      updated++;
    }

    res.json({ success: true, data: { updated } });
  }),
);

// The correction path for a PAID payroll record — previously there was no
// way to unwind a payroll run once marked PAID (and its journal posted)
// short of a raw DB edit. Only meaningful for PAID records: a FINALIZED-
// but-not-yet-PAID record never posted a journal, so it can just be edited
// directly via the existing PUT /:id instead.
payrollRouter.post(
  "/:id/void",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ reason: z.string().optional() }).parse(req.body);
    const record = await prisma.payrollRecord.findUnique({ where: { id } });
    if (!record) throw notFound("Payroll record not found");
    if (record.status !== "PAID") throw badRequest("Only a PAID payroll record can be voided");

    const relatedVouchers = await prisma.voucher.findMany({
      where: { reference_type: "PAYROLL", reference_id: record.id, status: "POSTED", reversed_by_voucher_id: null },
    });
    for (const voucher of relatedVouchers) {
      await reverseVoucher(voucher.id, req.user!.sub, body.reason ?? "Payroll voided");
    }

    const updated = await prisma.payrollRecord.update({ where: { id }, data: { status: "CANCELLED" } });

    await logAudit("PAYROLL_VOID", {
      userId: req.user!.sub,
      targetType: "PayrollRecord",
      targetId: id,
      metadata: { vouchers_reversed: relatedVouchers.length, reason: body.reason },
      req,
    });

    res.json({ success: true, data: { payroll: updated, vouchers_reversed: relatedVouchers.length } });
  }),
);

// Broadened from PAYROLL_MANAGE_ROLES-only to STAFF_ONLY_ROLES + an inline
// ownership check (Plan Fourteen, Phase J5) -- a PAYROLL_MANAGE_ROLES caller
// (Accountant/Admin) may fetch any record; anyone else may only fetch their
// own. Closes the identical, real gap found in documents.routes.ts's own
// copy of this route, which had no scoping at all beyond the router-level
// STAFF_ONLY_ROLES gate.
payrollRouter.get(
  "/:id/payslip",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { staff: { include: { salary_structure: true } } } });
    if (!record) throw notFound("Payroll record not found");

    if (!PAYROLL_MANAGE_ROLES.includes(req.user!.role as UserRole)) {
      const ownStaffId = await resolveOwnStaffId(req.user!.sub);
      if (ownStaffId !== record.staff_id) throw notFound("Payroll record not found");
    }

    const pdf = await renderDocument("PAYSLIP", buildPayslipData(record) as unknown as Record<string, unknown>);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename="payslip-${record.staff.staff_uid}-${record.month}-${record.year}.pdf"`);
    res.send(pdf);
  }),
);

// Employee-wise Payment History (Plan Fourteen, Phase J4) — every month for
// one staff member, "me" self-service via resolveOwnStaffId matching this
// codebase's own established shorthand convention (own-staff.ts).
payrollRouter.get(
  "/reports/employee/:staff_id",
  authorize(STAFF_ONLY_ROLES),
  asyncHandler(async (req, res) => {
    const rawStaffId = reqParam(req, "staff_id");
    let staffId = rawStaffId;
    if (rawStaffId === "me" || !PAYROLL_MANAGE_ROLES.includes(req.user!.role as UserRole)) {
      const ownStaffId = await resolveOwnStaffId(req.user!.sub);
      if (rawStaffId !== "me" && rawStaffId !== ownStaffId) throw notFound("Staff member not found");
      staffId = ownStaffId;
    }
    const records = await prisma.payrollRecord.findMany({
      where: { staff_id: staffId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
    res.json({ success: true, data: records });
  }),
);

// Period-wise Payment Report with department subtotals (Plan Fourteen,
// Phase J4) — every employee for one month/year.
payrollRouter.get(
  "/reports/period",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int() }).parse(req.query);
    const records = await prisma.payrollRecord.findMany({
      where: { month: query.month, year: query.year },
      include: { staff: { select: { name_en: true, staff_uid: true, department: { select: { id: true, name_en: true } } } } },
      orderBy: { staff: { name_en: "asc" } },
    });

    const byDepartment = new Map<string, { department_id: string | null; department_name: string; count: number; gross_total: number; deductions_total: number; net_total: number }>();
    for (const r of records) {
      const key = r.staff.department?.id ?? "__none__";
      const label = r.staff.department?.name_en ?? "No Department";
      if (!byDepartment.has(key)) byDepartment.set(key, { department_id: r.staff.department?.id ?? null, department_name: label, count: 0, gross_total: 0, deductions_total: 0, net_total: 0 });
      const bucket = byDepartment.get(key)!;
      bucket.count++;
      bucket.gross_total += r.gross_salary;
      bucket.deductions_total += r.deductions;
      bucket.net_total += r.net_salary;
    }

    res.json({
      success: true,
      data: {
        records,
        department_subtotals: [...byDepartment.values()].map((b) => ({
          ...b,
          gross_total: Math.round(b.gross_total * 100) / 100,
          deductions_total: Math.round(b.deductions_total * 100) / 100,
          net_total: Math.round(b.net_total * 100) / 100,
        })),
      },
    });
  }),
);

// Salary Generation Log (Plan Fourteen, Phase J4) — one row per real
// POST /calculate run, mirroring InvoiceGenerationRun's precedent.
payrollRouter.get(
  "/generation-log",
  authorize(PAYROLL_MANAGE_ROLES),
  asyncHandler(async (_req, res) => {
    const runs = await prisma.payrollGenerationRun.findMany({ orderBy: { run_at: "desc" }, take: 100 });
    res.json({ success: true, data: runs });
  }),
);
