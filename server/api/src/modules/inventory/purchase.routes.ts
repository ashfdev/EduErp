import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { INVENTORY_MANAGE_ROLES, REQUISITION_APPROVE_ROLES } from "../../lib/roles";
import { requisitionSchema, requisitionRejectSchema, purchaseOrderSchema, grnSchema } from "@education-erp/validators";
import { createWithUniqueAssetUid } from "../../utils/asset-id.generator";
import { uploadBuffer } from "../../services/storage.service";
import { resolveBaseUrl } from "../../lib/env";
import { createInventoryPurchaseJournal } from "../accounts/auto-journal.service";
import { badRequest, notFound } from "../../lib/errors";

export const purchaseRouter = Router();
purchaseRouter.use(authenticate);

// Read routes need to be visible to whoever can approve a requisition too
// (REQUISITION_APPROVE_ROLES also includes PRINCIPAL/HEAD_OF_DEPT, who
// aren't in INVENTORY_MANAGE_ROLES) — an approver has to be able to list
// and open a requisition/PO before they can act on it.
const INVENTORY_READ_ROLES = [...INVENTORY_MANAGE_ROLES, ...REQUISITION_APPROVE_ROLES];

// ── Requisitions ──────────────────────────────────────────────────

purchaseRouter.post(
  "/requisitions",
  asyncHandler(async (req, res) => {
    const body = requisitionSchema.parse(req.body);
    const year = new Date().getFullYear();
    const count = await prisma.purchaseRequisition.count({ where: { created_at: { gte: new Date(year, 0, 1) } } });
    const req_no = `REQ-${year}-${String(count + 1).padStart(4, "0")}`;

    const requisition = await prisma.purchaseRequisition.create({
      data: {
        req_no,
        requested_by_id: req.user!.sub,
        department_id: body.department_id,
        reason: body.reason,
        required_by: body.required_by,
        items: { create: body.items },
      },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: requisition });
  }),
);

purchaseRouter.get(
  "/requisitions",
  authorize(INVENTORY_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ status: z.string().optional() }).parse(req.query);
    const requisitions = await prisma.purchaseRequisition.findMany({
      where: { ...(query.status && { status: query.status as never }) },
      include: { items: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: requisitions });
  }),
);

purchaseRouter.get(
  "/requisitions/:id",
  authorize(INVENTORY_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id }, include: { items: { include: { item: true } }, purchase_order: true } });
    if (!requisition) throw notFound("Requisition not found");
    res.json({ success: true, data: requisition });
  }),
);

purchaseRouter.put(
  "/requisitions/:id/approve",
  authorize(REQUISITION_APPROVE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const requisition = await prisma.purchaseRequisition.update({
      where: { id },
      data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() },
    });
    res.json({ success: true, data: requisition });
  }),
);

purchaseRouter.put(
  "/requisitions/:id/reject",
  authorize(REQUISITION_APPROVE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = requisitionRejectSchema.parse(req.body);
    const requisition = await prisma.purchaseRequisition.update({ where: { id }, data: { status: "REJECTED", rejected_reason: body.reason } });
    res.json({ success: true, data: requisition });
  }),
);

// ── Purchase Orders ───────────────────────────────────────────────

purchaseRouter.post(
  "/purchase-orders",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = purchaseOrderSchema.parse(req.body);
    const year = new Date().getFullYear();
    const count = await prisma.purchaseOrder.count({ where: { created_at: { gte: new Date(year, 0, 1) } } });
    const po_no = `PO-${year}-${String(count + 1).padStart(4, "0")}`;
    const totalAmount = body.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        po_no,
        requisition_id: body.requisition_id ?? undefined,
        supplier_id: body.supplier_id,
        order_date: body.order_date,
        delivery_date: body.delivery_date,
        delivery_address: body.delivery_address,
        terms: body.terms,
        total_amount: totalAmount,
        items: {
          create: body.items.map((i) => ({
            item_id: i.item_id ?? undefined,
            description: i.description,
            purchase_type: i.purchase_type,
            quantity: i.quantity,
            unit: i.unit,
            unit_price: i.unit_price,
            total_price: i.quantity * i.unit_price,
            asset_category_id: i.asset_category_id ?? undefined,
          })),
        },
      },
      include: { items: true },
    });

    if (body.requisition_id) {
      await prisma.purchaseRequisition.update({ where: { id: body.requisition_id }, data: { status: "PO_CREATED" } });
    }

    res.status(201).json({ success: true, data: po });
  }),
);

purchaseRouter.get(
  "/purchase-orders",
  authorize(INVENTORY_READ_ROLES),
  asyncHandler(async (req, res) => {
    const query = z.object({ status: z.string().optional() }).parse(req.query);
    const orders = await prisma.purchaseOrder.findMany({
      where: { ...(query.status && { status: query.status as never }) },
      include: { supplier: true, items: true },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: orders });
  }),
);

purchaseRouter.get(
  "/purchase-orders/:id",
  authorize(INVENTORY_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true, items: true, grns: { include: { items: true } } } });
    if (!po) throw notFound("Purchase order not found");
    res.json({ success: true, data: po });
  }),
);

purchaseRouter.put(
  "/purchase-orders/:id/approve",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const po = await prisma.purchaseOrder.update({ where: { id }, data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() } });
    res.json({ success: true, data: po });
  }),
);

purchaseRouter.get(
  "/purchase-orders/:id/grns",
  authorize(INVENTORY_READ_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const grns = await prisma.goodsReceivedNote.findMany({ where: { po_id: id }, include: { items: true } });
    res.json({ success: true, data: grns });
  }),
);

// ── GRN (Goods Received Note) — the trigger for stock/asset creation
// and the accounts auto-journal. Never add stock or assets without a GRN. ──

purchaseRouter.post(
  "/purchase-orders/:id/grn",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const poId = reqParam(req, "id");
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
    if (!po) throw notFound("Purchase order not found");
    if (po.status === "CANCELLED" || po.status === "RECEIVED") throw badRequest(`Purchase order is already ${po.status}`);

    const body = grnSchema.parse(req.body);
    const year = new Date().getFullYear();
    const grnCount = await prisma.goodsReceivedNote.count({ where: { created_at: { gte: new Date(year, 0, 1) } } });
    const grn_no = `GRN-${year}-${String(grnCount + 1).padStart(4, "0")}`;

    const createdAssets: string[] = [];
    const updatedStock: { item_id: string; new_stock: number }[] = [];
    let totalAmount = 0;
    // A single GRN can span both asset and consumable line items, each
    // potentially hitting a different asset/expense account — one journal
    // line per distinct debit account keeps the voucher both balanced and
    // legible, rather than one opaque lump sum.
    const journalLines = new Map<string, number>();

    const grnItemsData = [];
    for (const receivedItem of body.items) {
      const poItem = po.items.find((i) => i.id === receivedItem.po_item_id);
      if (!poItem) throw badRequest(`PO item ${receivedItem.po_item_id} not found on this purchase order`);
      // Previously unbounded — a staff member could receive an arbitrary
      // multiple of what was actually ordered in one GRN, creating that
      // many extra Asset rows / inflating stock and the accounting entry.
      // A PO can legitimately be received across several partial GRNs, so
      // this checks against what's actually still outstanding, not the
      // item's original ordered quantity.
      const remaining = poItem.quantity - poItem.received_qty;
      if (receivedItem.received_qty > remaining) {
        throw badRequest(`Cannot receive ${receivedItem.received_qty} of "${poItem.description}" — only ${remaining} remain outstanding on this purchase order`);
      }
      const unitPrice = receivedItem.unit_price ?? poItem.unit_price;
      const lineTotal = receivedItem.received_qty * unitPrice;
      totalAmount += lineTotal;

      let createdAssetId: string | undefined;

      if (poItem.purchase_type === "CONSUMABLE" && poItem.item_id) {
        const item = await prisma.item.findUniqueOrThrow({ where: { id: poItem.item_id } });
        const newStock = item.current_stock + receivedItem.received_qty;
        await prisma.item.update({ where: { id: item.id }, data: { current_stock: newStock } });
        await prisma.stockTransaction.create({
          data: {
            item_id: item.id,
            transaction_type: "IN",
            quantity: receivedItem.received_qty,
            unit_price: unitPrice,
            total_value: lineTotal,
            balance_after: newStock,
            reference_type: "PURCHASE",
            reference_id: poId,
            created_by_id: req.user!.sub,
          },
        });
        updatedStock.push({ item_id: item.id, new_stock: newStock });

        const debitAccountId = item.expense_account_id;
        if (debitAccountId) journalLines.set(debitAccountId, (journalLines.get(debitAccountId) ?? 0) + lineTotal);
      } else if (poItem.purchase_type === "ASSET" && poItem.asset_category_id) {
        const category = await prisma.assetCategory.findUniqueOrThrow({ where: { id: poItem.asset_category_id } });
        // One Asset row per unit received (a batch of 5 chairs = 5 Asset rows).
        for (let i = 0; i < receivedItem.received_qty; i++) {
          const asset = await createWithUniqueAssetUid(async (asset_uid) => {
            const qrPayload = `${resolveBaseUrl("ADMIN_URL", process.env.ADMIN_URL, "http://localhost:3000")}/inventory/assets/${asset_uid}`;
            const qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 1, width: 300 });
            const { url: qr_code_url } = await uploadBuffer("assets", `${asset_uid}-qr.png`, qrBuffer, "image/png");
            return prisma.asset.create({
              data: {
                asset_uid,
                category_id: category.id,
                name: poItem.description,
                purchase_date: body.received_date,
                purchase_price: unitPrice,
                book_value: unitPrice,
                qr_code_url,
                purchase_grn_item_id: poItem.id,
              },
            });
          });
          createdAssets.push(asset.id);
          if (i === 0) createdAssetId = asset.id;
        }
        if (category.asset_account_id) journalLines.set(category.asset_account_id, (journalLines.get(category.asset_account_id) ?? 0) + lineTotal);
      }

      await prisma.purchaseItem.update({ where: { id: poItem.id }, data: { received_qty: poItem.received_qty + receivedItem.received_qty } });
      grnItemsData.push({
        po_item_id: poItem.id,
        description: poItem.description,
        ordered_qty: poItem.quantity,
        received_qty: receivedItem.received_qty,
        unit_price: unitPrice,
        total_price: lineTotal,
        asset_id: createdAssetId,
      });
    }

    const grn = await prisma.goodsReceivedNote.create({
      data: {
        grn_no,
        po_id: poId,
        received_date: body.received_date,
        received_by_id: req.user!.sub,
        supplier_invoice_no: body.supplier_invoice_no,
        remarks: body.remarks,
        total_amount: totalAmount,
        items: { create: grnItemsData },
      },
      include: { items: true },
    });

    let voucherId: string | null = null;
    if (journalLines.size === 1) {
      const [debitAccountId, amount] = [...journalLines.entries()][0]!;
      voucherId = await createInventoryPurchaseJournal({ grnId: grn.id, totalAmount: amount, debitAccountId, narration: `Goods received — ${grn_no}` });
    } else if (journalLines.size > 1) {
      // Multiple distinct debit accounts in one GRN — createInventoryPurchaseJournal
      // only handles a single debit line, so fall back to a direct multi-line
      // voucher via the same accounts-payable credit pattern.
      const { createVoucher } = await import("../accounts/voucher-helpers");
      const accountsPayable = await prisma.account.findUniqueOrThrow({ where: { code: "2001" } });
      const voucher = await createVoucher(prisma, {
        voucher_type: "JOURNAL",
        date: new Date(),
        narration: `Goods received — ${grn_no}`,
        reference_type: "INVENTORY_PURCHASE",
        reference_id: grn.id,
        entries: [
          ...[...journalLines.entries()].map(([accountId, amount]) => ({ debit_account_id: accountId, amount })),
          { credit_account_id: accountsPayable.id, amount: totalAmount },
        ],
        is_auto: true,
        auto_post: true,
      });
      voucherId = voucher.id;
    }
    // `grn` was captured before voucher_id was known — merge it in locally
    // rather than re-querying, so the response actually reflects what was
    // just persisted instead of a stale pre-update snapshot.
    if (voucherId) {
      await prisma.goodsReceivedNote.update({ where: { id: grn.id }, data: { voucher_id: voucherId } });
      grn.voucher_id = voucherId;
    }

    const allItems = await prisma.purchaseItem.findMany({ where: { po_id: poId } });
    const fullyReceived = allItems.every((i) => i.received_qty >= i.quantity);
    const partiallyReceived = allItems.some((i) => i.received_qty > 0);
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: fullyReceived ? "RECEIVED" : partiallyReceived ? "PARTIALLY_RECEIVED" : po.status },
    });

    res.status(201).json({ success: true, data: { grn, created_assets: createdAssets, updated_stock: updatedStock } });
  }),
);
