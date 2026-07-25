import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { FEE_COLLECTION_ROLES } from "../../lib/roles";
import { syncOverdueInvoices } from "../fees/invoice-helpers";

export const financeRouter = Router();
financeRouter.use(authenticate);

// One document type each row can be — kept as a plain union rather than a
// new enum, since this is a read-only cross-module view, not a new
// persisted concept.
interface UnifiedInvoiceRow {
  id: string;
  type: "FEE" | "PAYROLL" | "PURCHASE";
  reference_no: string;
  party_name: string;
  party_detail: string | null;
  description: string;
  amount: number;
  paid: number;
  status: string;
  date: Date;
}

// A unified "every bill/invoice in the system" view (Fee invoices, HR
// payroll records, Inventory purchase orders) -- three genuinely different
// models, merged into one read-only, paginated-by-type list rather than
// one attempted SQL union, since each has its own filter/status vocabulary
// and its own detail screen to drill into. FEE_COLLECTION_ROLES,
// PAYROLL_MANAGE_ROLES, and INVENTORY_MANAGE_ROLES are all currently the
// identical [SUPER_ADMIN, ADMIN, ACCOUNTANT] array in this codebase, so one
// shared gate for all three types is correct today; if any of the three
// ever diverges, this route would need to filter which types it queries
// per-caller rather than gating the whole route on one array.
financeRouter.get(
  "/all-invoices",
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        type: z.enum(["FEE", "PAYROLL", "PURCHASE"]).optional(),
        status: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        search: z.string().optional(),
      })
      .parse(req.query);

    const rows: UnifiedInvoiceRow[] = [];

    if (!query.type || query.type === "FEE") {
      await syncOverdueInvoices(prisma);
      const invoices = await prisma.invoice.findMany({
        where: {
          ...(query.from && { due_date: { gte: query.from } }),
          ...(query.to && { due_date: { lte: query.to } }),
          ...(query.status && { status: query.status as never }),
          ...(query.search && { student: { name_en: { contains: query.search, mode: "insensitive" } } }),
        },
        include: { student: { select: { name_en: true, student_uid: true } } },
        orderBy: { due_date: "desc" },
        take: 200,
      });
      rows.push(
        ...invoices.map((inv) => ({
          id: inv.id,
          type: "FEE" as const,
          reference_no: inv.invoice_no,
          party_name: inv.student.name_en,
          party_detail: inv.student.student_uid,
          description: inv.description,
          amount: inv.amount_due + inv.fine_amount,
          paid: inv.amount_paid,
          status: inv.status,
          date: inv.due_date,
        })),
      );
    }

    if (!query.type || query.type === "PAYROLL") {
      const payroll = await prisma.payrollRecord.findMany({
        where: {
          ...(query.status && { status: query.status as never }),
          ...(query.search && { staff: { name_en: { contains: query.search, mode: "insensitive" } } }),
        },
        include: { staff: { select: { name_en: true, staff_uid: true } } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 200,
      });
      rows.push(
        ...payroll
          .filter((p) => {
            if (!query.from && !query.to) return true;
            const periodDate = new Date(p.year, p.month - 1, 1);
            if (query.from && periodDate < query.from) return false;
            if (query.to && periodDate > query.to) return false;
            return true;
          })
          .map((p) => ({
            id: p.id,
            type: "PAYROLL" as const,
            reference_no: `${p.month}/${p.year}`,
            party_name: p.staff.name_en,
            party_detail: p.staff.staff_uid,
            description: `Salary — ${p.month}/${p.year}`,
            amount: p.net_salary,
            paid: p.status === "PAID" ? p.net_salary : 0,
            status: p.status,
            date: p.paid_at ?? new Date(p.year, p.month - 1, 1),
          })),
      );
    }

    if (!query.type || query.type === "PURCHASE") {
      const purchaseOrders = await prisma.purchaseOrder.findMany({
        where: {
          ...(query.from && { order_date: { gte: query.from } }),
          ...(query.to && { order_date: { lte: query.to } }),
          ...(query.status && { status: query.status as never }),
          ...(query.search && { supplier: { name: { contains: query.search, mode: "insensitive" } } }),
        },
        include: { supplier: { select: { name: true } } },
        orderBy: { order_date: "desc" },
        take: 200,
      });
      rows.push(
        ...purchaseOrders.map((po) => ({
          id: po.id,
          type: "PURCHASE" as const,
          reference_no: po.po_no,
          party_name: po.supplier.name,
          party_detail: null,
          description: "Purchase Order",
          amount: po.total_amount,
          paid: ["RECEIVED"].includes(po.status) ? po.total_amount : 0,
          status: po.status,
          date: po.order_date,
        })),
      );
    }

    rows.sort((a, b) => b.date.getTime() - a.date.getTime());

    res.json({
      success: true,
      data: rows,
      meta: {
        total: rows.length,
        total_amount: Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100,
        total_paid: Math.round(rows.reduce((sum, r) => sum + r.paid, 0) * 100) / 100,
      },
    });
  }),
);
