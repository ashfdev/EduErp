import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { FEE_COLLECTION_ROLES } from "../../lib/roles";
import { initiatePaymentSchema } from "@education-erp/validators";
import { getPaymentAdapter } from "../../services/payment";
import { getSignedDownloadUrl } from "../../services/storage.service";
import { sendSms } from "../../services/sms.service";
import { createFeeReceiptJournal, reverseVoucher } from "../accounts/auto-journal.service";
import { generateReceiptNo } from "./fee-number.generator";
import { reqParam } from "../../lib/req-param";
import { logAudit } from "../../lib/audit-log";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors";
import type { Payment } from "@education-erp/db";

export const paymentsRouter = Router();

// Searchable fallback list backing the new Fee Receipts screen
// (accounts/receipts) — the Document Print Center's old raw-payment-id Fee
// Receipt box pointed here once a proper searchable page existed instead.
// COMPLETED only: a receipt implies money was actually received (see
// generateReceiptNo()'s own comment on Payment.receipt_no).
paymentsRouter.get(
  "/",
  authenticate,
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      status: "COMPLETED" as const,
      ...((query.from || query.to) && {
        paid_at: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lte: new Date(query.to) }),
        },
      }),
      ...(query.search && {
        OR: [
          { receipt_no: { contains: query.search, mode: "insensitive" as const } },
          { invoice: { student: { name_en: { contains: query.search, mode: "insensitive" as const } } } },
          { invoice: { student: { student_uid: { contains: query.search, mode: "insensitive" as const } } } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { invoice: { select: { category: true, student: { select: { id: true, name_en: true, student_uid: true } } } } },
        orderBy: { paid_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

paymentsRouter.post(
  "/initiate",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = initiatePaymentSchema.parse(req.body);
    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoice_id } });
    if (!invoice) throw notFound("Invoice not found");

    const adapter = getPaymentAdapter(body.gateway);
    if (!adapter.isConfigured()) {
      throw badRequest(`${body.gateway} is not configured yet — merchant credentials are pending`);
    }

    const transactionId = randomUUID();
    const result = await adapter.initiatePayment({ invoice_id: invoice.id, amount: invoice.amount_due - invoice.amount_paid, transaction_id: transactionId });

    const payment = await prisma.payment.create({
      data: { invoice_id: invoice.id, gateway: body.gateway, transaction_id: transactionId, amount: invoice.amount_due - invoice.amount_paid, status: "INITIATED" },
    });

    res.json({ success: true, data: { payment_id: payment.id, payment_url: result.payment_url, session_id: result.session_id } });
  }),
);

// Shared by the gateway webhook callbacks (below), the manual bank-transfer
// verify endpoint, and fees.routes.ts's manual /collect — one place for
// "what happens when a payment is confirmed," so any staff-confirmed
// payment (counter cash, verified bank transfer, or a manually-recorded
// wallet payment) updates the invoice/journal/SMS exactly the same way an
// automated gateway does.
export async function completePayment(payment: Payment) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "COMPLETED", paid_at: new Date(), receipt_no: await generateReceiptNo(prisma) },
  });

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: payment.invoice_id } });
  const newAmountPaid = invoice.amount_paid + payment.amount;
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { amount_paid: newAmountPaid, status: newAmountPaid >= invoice.amount_due + invoice.fine_amount ? "PAID" : "PARTIAL" },
  });

  await createFeeReceiptJournal(payment, updatedInvoice);

  const student = await prisma.student.findUnique({ where: { id: invoice.student_id } });
  if (student?.father_phone) {
    await sendSms(student.father_phone, `Payment of ৳${payment.amount} received for ${student.name_en}. Thank you.`);
  }
}

async function handleCallback(gateway: "BKASH" | "NAGAD" | "SSLCOMMERZ", payload: unknown) {
  const adapter = getPaymentAdapter(gateway);
  const verified = await adapter.verifyCallback(payload);

  const payment = await prisma.payment.findUnique({ where: { transaction_id: verified.transaction_id } });
  if (!payment) throw notFound("Payment not found for this transaction");

  if (verified.success) {
    await completePayment(payment);
  } else {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  }

  return { received: true };
}

paymentsRouter.post("/callback/bkash", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("BKASH", req.body) })));
paymentsRouter.post("/callback/nagad", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("NAGAD", req.body) })));
paymentsRouter.post("/callback/sslcommerz", asyncHandler(async (req, res) => res.json({ success: true, data: await handleCallback("SSLCOMMERZ", req.body) })));

// ── Bank transfer manual verification ─────────────────────────────
// Bank transfers have no webhook — a student uploads a slip (sets
// Payment.slip_blob_key via the portal), then staff cross-checks it against
// the actual bank statement and verifies here. The slip is a financial
// document with account numbers/names, so it's served as a short-lived
// signed URL to FEE_COLLECTION_ROLES only, never a permanent public link.

paymentsRouter.get(
  "/bank-transfers/pending",
  authenticate,
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const payments = await prisma.payment.findMany({
      where: { gateway: "BANK_TRANSFER", status: "INITIATED" },
      include: { invoice: { include: { student: { select: { name_en: true, student_uid: true } } } } },
      orderBy: { created_at: "desc" },
    });
    const withSlipUrls = await Promise.all(
      payments.map(async (p) => ({ ...p, slip_url: p.slip_blob_key ? await getSignedDownloadUrl(p.slip_blob_key) : null })),
    );
    res.json({ success: true, data: withSlipUrls });
  }),
);

paymentsRouter.post(
  "/bank-transfers/:id/verify",
  authenticate,
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw notFound("Payment not found");
    if (payment.gateway !== "BANK_TRANSFER") throw badRequest("This is not a bank-transfer payment");
    if (payment.status !== "INITIATED") throw badRequest("Only a pending bank-transfer payment can be verified");

    await completePayment(payment);
    const updated = await prisma.payment.findUnique({ where: { id } });
    res.json({ success: true, data: updated });
  }),
);

paymentsRouter.post(
  "/bank-transfers/:id/reject",
  authenticate,
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw notFound("Payment not found");
    if (payment.gateway !== "BANK_TRANSFER") throw badRequest("This is not a bank-transfer payment");
    if (payment.status !== "INITIATED") throw badRequest("Only a pending bank-transfer payment can be rejected");

    const updated = await prisma.payment.update({ where: { id }, data: { status: "FAILED" } });
    res.json({ success: true, data: updated });
  }),
);

// The actual correction path for a COMPLETED payment — previously
// PaymentStatus.REFUNDED was a defined-but-dead enum value with no route
// anywhere that could ever set it, and no way to unwind the invoice/journal
// side-effects completePayment() created. Reverses every voucher that was
// posted referencing this payment (there can legitimately be more than one
// — e.g. an overpayment that also credited an advance-fees liability),
// then walks the invoice back to what it would have shown before this
// payment, recomputing status the same way completePayment() computes it
// forward.
paymentsRouter.post(
  "/:id/refund",
  authenticate,
  authorize(FEE_COLLECTION_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = z.object({ reason: z.string().optional() }).parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw notFound("Payment not found");
    if (payment.status !== "COMPLETED") throw badRequest("Only a completed payment can be refunded");

    const relatedVouchers = await prisma.voucher.findMany({
      where: { reference_type: "FEE_PAYMENT", reference_id: payment.id, status: "POSTED", reversed_by_voucher_id: null },
    });
    for (const voucher of relatedVouchers) {
      await reverseVoucher(voucher.id, req.user!.sub, body.reason ?? "Payment refunded");
    }

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: payment.invoice_id } });
    const newAmountPaid = Math.max(0, invoice.amount_paid - payment.amount);
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        amount_paid: newAmountPaid,
        status:
          newAmountPaid >= invoice.amount_due + invoice.fine_amount
            ? "PAID"
            : newAmountPaid > 0
              ? "PARTIAL"
              : invoice.due_date < new Date()
                ? "OVERDUE"
                : "PENDING",
      },
    });

    const updatedPayment = await prisma.payment.update({ where: { id }, data: { status: "REFUNDED" } });

    await logAudit("PAYMENT_REFUND", {
      userId: req.user!.sub,
      targetType: "Payment",
      targetId: id,
      metadata: { invoice_id: invoice.id, amount: payment.amount, vouchers_reversed: relatedVouchers.length, reason: body.reason },
      req,
    });

    res.json({ success: true, data: { payment: updatedPayment, invoice: updatedInvoice, vouchers_reversed: relatedVouchers.length } });
  }),
);
