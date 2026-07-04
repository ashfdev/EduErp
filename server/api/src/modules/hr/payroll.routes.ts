import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { PAYROLL_MANAGE_ROLES } from "../../lib/roles";
import { calculatePayrollSchema, updatePayrollSchema, finalizePayrollSchema, markPaidSchema } from "@education-erp/validators";
import { workingDaysInMonth } from "../../utils/working-days";
import { renderDocument } from "../../services/pdf.service";
import { uploadBuffer } from "../../services/storage.service";
import { createPayrollJournal } from "../accounts/auto-journal.service";
import { badRequest, notFound } from "../../lib/errors";

export const payrollRouter = Router();
payrollRouter.use(authenticate);

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
      });
      const presentDays = records.filter((r) => r.status === "PRESENT" || r.status === "LATE" || r.status === "LEAVE").length;
      const absentDays = Math.max(0, workingDays - presentDays);

      const gross = structure.basic + structure.house_rent + structure.medical + structure.transport;
      const perDaySalary = workingDays > 0 ? structure.basic / workingDays : 0;
      const pf = gross * (structure.pf_percentage / 100);
      const tds = gross * (structure.tds_percentage / 100);
      const absentDeduction = absentDays * perDaySalary;
      const deductions = pf + tds + absentDeduction;
      const net = Math.max(0, gross - deductions);

      await prisma.payrollRecord.upsert({
        where: { staff_id_month_year: { staff_id: staff.id, month: body.month, year: body.year } },
        create: {
          staff_id: staff.id,
          month: body.month,
          year: body.year,
          working_days: workingDays,
          present_days: presentDays,
          gross_salary: gross,
          deductions,
          net_salary: net,
          status: "DRAFT",
          processed_by_id: req.user!.sub,
        },
        update: {
          working_days: workingDays,
          present_days: presentDays,
          gross_salary: gross,
          deductions,
          net_salary: net,
          status: "DRAFT",
          processed_by_id: req.user!.sub,
        },
      });

      processed++;
      totalPayable += net;
    }

    res.json({ success: true, data: { processed, total_payable: Math.round(totalPayable * 100) / 100 } });
  }),
);

payrollRouter.get(
  "/",
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
    const records = await prisma.payrollRecord.findMany({ where: { month: body.month, year: body.year, status: "DRAFT" }, include: { staff: true } });
    if (!records.length) throw badRequest("No draft payroll records found for this month");

    let generated = 0;
    for (const record of records) {
      try {
        const pdf = await renderDocument("PAYSLIP", {
          staff: record.staff,
          month: record.month,
          year: record.year,
          gross_salary: record.gross_salary,
          deductions: record.deductions,
          advance_deducted: record.advance_deducted,
          net_salary: record.net_salary,
          working_days: record.working_days,
          present_days: record.present_days,
        });
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

    const result = await prisma.payrollRecord.updateMany({
      where: { id: { in: records.map((r) => r.id) } },
      data: { status: "PAID" },
    });

    for (const record of records) {
      await createPayrollJournal(record, record.staff);
    }

    res.json({ success: true, data: { updated: result.count } });
  }),
);

payrollRouter.get(
  "/:id/payslip",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const record = await prisma.payrollRecord.findUnique({ where: { id }, include: { staff: true } });
    if (!record) throw notFound("Payroll record not found");

    const pdf = await renderDocument("PAYSLIP", {
      staff: record.staff,
      month: record.month,
      year: record.year,
      gross_salary: record.gross_salary,
      deductions: record.deductions,
      advance_deducted: record.advance_deducted,
      net_salary: record.net_salary,
      working_days: record.working_days,
      present_days: record.present_days,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download === "true" ? "attachment" : "inline"}; filename="payslip-${record.staff.staff_uid}-${record.month}-${record.year}.pdf"`);
    res.send(pdf);
  }),
);
