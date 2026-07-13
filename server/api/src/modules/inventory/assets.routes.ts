import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { reqParam } from "../../lib/req-param";
import { INVENTORY_MANAGE_ROLES } from "../../lib/roles";
import { assetCategorySchema, assetSchema, assetTransferSchema, assetMaintenanceSchema, assetDisposeSchema } from "@education-erp/validators";
import { createWithUniqueAssetUid } from "../../utils/asset-id.generator";
import { createInventoryPurchaseJournal, createMaintenanceJournal, createAssetDisposalJournal } from "../accounts/auto-journal.service";
import { badRequest, conflict, notFound } from "../../lib/errors";

export const assetsRouter = Router();
assetsRouter.use(authenticate);

// ── Asset Categories ──────────────────────────────────────────────

assetsRouter.get(
  "/asset-categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.assetCategory.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } });
    res.json({ success: true, data: categories });
  }),
);

assetsRouter.post(
  "/asset-categories",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = assetCategorySchema.parse(req.body);
    const category = await prisma.assetCategory.create({ data: body });
    res.status(201).json({ success: true, data: category });
  }),
);

assetsRouter.put(
  "/asset-categories/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = assetCategorySchema.partial().parse(req.body);
    const category = await prisma.assetCategory.update({ where: { id }, data: body });
    res.json({ success: true, data: category });
  }),
);

assetsRouter.delete(
  "/asset-categories/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const assetCount = await prisma.asset.count({ where: { category_id: id } });
    if (assetCount > 0) throw conflict("Cannot delete a category that has assets assigned to it");
    await prisma.assetCategory.delete({ where: { id } });
    res.status(204).send();
  }),
);

// ── Fixed Assets ──────────────────────────────────────────────────

assetsRouter.get(
  "/assets",
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        category_id: z.string().optional(),
        status: z.string().optional(),
        department_id: z.string().optional(),
        condition: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);

    const where = {
      ...(query.category_id && { category_id: query.category_id }),
      ...(query.status && { status: query.status as never }),
      ...(query.department_id && { department_id: query.department_id }),
      ...(query.condition && { condition: query.condition as never }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" as const } },
          { asset_uid: { contains: query.search, mode: "insensitive" as const } },
          { barcode: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      prisma.asset.findMany({ where, include: { category: true, department: true }, orderBy: { created_at: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }),
      prisma.asset.count({ where }),
    ]);

    res.json({ success: true, data: items, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

assetsRouter.get(
  "/assets/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: true,
        department: true,
        assigned_to_staff: true,
        supplier: true,
        depreciation_entries: { orderBy: { created_at: "desc" } },
        maintenance_logs: { orderBy: { maintenance_date: "desc" } },
        transfer_logs: { orderBy: { transferred_at: "desc" } },
      },
    });
    if (!asset) throw notFound("Asset not found");
    res.json({ success: true, data: asset });
  }),
);

assetsRouter.post(
  "/assets",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = assetSchema.parse(req.body);
    const category = await prisma.assetCategory.findUnique({ where: { id: body.category_id } });
    if (!category) throw notFound("Asset category not found");

    const asset = await createWithUniqueAssetUid(async (asset_uid) => {
      const qrPayload = `${process.env.ADMIN_URL ?? "http://localhost:3000"}/inventory/assets/${asset_uid}`;
      const qrBuffer = await QRCode.toBuffer(qrPayload, { margin: 1, width: 300 });
      const { url: qr_code_url } = await uploadBuffer("assets", `${asset_uid}-qr.png`, qrBuffer, "image/png");

      return prisma.asset.create({
        data: {
          asset_uid,
          category_id: body.category_id,
          name: body.name,
          name_bn: body.name_bn,
          description: body.description,
          barcode: body.barcode,
          qr_code_url,
          purchase_date: body.purchase_date,
          purchase_price: body.purchase_price,
          supplier_id: body.supplier_id,
          invoice_no: body.invoice_no,
          warranty_expiry: body.warranty_expiry,
          current_location: body.current_location,
          department_id: body.department_id,
          assigned_to_staff_id: body.assigned_to_staff_id,
          condition: body.condition,
          notes: body.notes,
          book_value: body.purchase_price,
        },
      });
    });

    if (category.asset_account_id) {
      await createInventoryPurchaseJournal({
        grnId: asset.id,
        totalAmount: body.purchase_price,
        debitAccountId: category.asset_account_id,
        narration: `Asset purchase — ${asset.name} (${asset.asset_uid})`,
      });
    }

    res.status(201).json({ success: true, data: asset });
  }),
);

assetsRouter.put(
  "/assets/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw notFound("Asset not found");

    const body = assetSchema.partial().parse(req.body);
    if ((body.purchase_price !== undefined && body.purchase_price !== existing.purchase_price) || (body.purchase_date && body.purchase_date.getTime() !== existing.purchase_date.getTime()) || (body.category_id && body.category_id !== existing.category_id)) {
      throw badRequest("Cannot change purchase price, purchase date, or category after creation — these affect depreciation history");
    }

    const { paid_immediately: _omit, ...rest } = body;
    void _omit;
    const asset = await prisma.asset.update({ where: { id }, data: rest });
    res.json({ success: true, data: asset });
  }),
);

assetsRouter.post(
  "/assets/:id/photo",
  authorize(INVENTORY_MANAGE_ROLES),
  imageUpload.single("photo"),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    if (!req.file) throw badRequest("A photo file is required");
    const { url } = await uploadBuffer("assets", req.file.originalname, req.file.buffer, req.file.mimetype);
    const asset = await prisma.asset.update({ where: { id }, data: { photo_url: url } });
    res.json({ success: true, data: asset });
  }),
);

assetsRouter.post(
  "/assets/:id/transfer",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) throw notFound("Asset not found");

    const body = assetTransferSchema.parse(req.body);
    await prisma.assetTransfer.create({
      data: {
        asset_id: id,
        from_location: asset.current_location,
        to_location: body.to_location,
        from_department_id: asset.department_id,
        to_department_id: body.to_department_id,
        transferred_by_id: req.user!.sub,
        reason: body.reason,
      },
    });

    const updated = await prisma.asset.update({ where: { id }, data: { current_location: body.to_location ?? asset.current_location, department_id: body.to_department_id ?? asset.department_id } });
    res.json({ success: true, data: updated });
  }),
);

assetsRouter.post(
  "/assets/:id/maintenance",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) throw notFound("Asset not found");

    const body = assetMaintenanceSchema.parse(req.body);
    const voucherId = await createMaintenanceJournal({ assetId: id, cost: body.cost });
    const maintenance = await prisma.assetMaintenance.create({
      data: { asset_id: id, ...body, voucher_id: voucherId ?? undefined },
    });
    res.status(201).json({ success: true, data: maintenance });
  }),
);

assetsRouter.post(
  "/assets/:id/dispose",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const asset = await prisma.asset.findUnique({ where: { id }, include: { category: true } });
    if (!asset) throw notFound("Asset not found");
    if (asset.status === "DISPOSED") throw badRequest("Asset is already disposed");
    if (!asset.category.asset_account_id) throw badRequest("This asset's category has no linked asset account — configure it in Settings first");

    const body = assetDisposeSchema.parse(req.body);
    const voucherId = await createAssetDisposalJournal({
      assetId: id,
      assetAccountId: asset.category.asset_account_id,
      purchasePrice: asset.purchase_price,
      accumulatedDep: asset.accumulated_dep,
      disposedValue: body.disposed_value,
    });

    const updated = await prisma.asset.update({
      where: { id },
      data: { status: "DISPOSED", disposed_at: new Date(), disposed_reason: body.disposed_reason, disposed_value: body.disposed_value },
    });
    res.json({ success: true, data: { asset: updated, voucher_id: voucherId } });
  }),
);
