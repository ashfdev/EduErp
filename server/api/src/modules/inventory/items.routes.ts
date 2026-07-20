import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { INVENTORY_MANAGE_ROLES } from "../../lib/roles";
import { itemCategorySchema, itemSchema, stockIssueSchema, stockAdjustSchema } from "@education-erp/validators";
import { badRequest, conflict, notFound } from "../../lib/errors";

export const itemsRouter = Router();
itemsRouter.use(authenticate, authorize(INVENTORY_MANAGE_ROLES));

itemsRouter.get(
  "/item-categories",
  asyncHandler(async (_req, res) => {
    const categories = await prisma.itemCategory.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: "asc" } });
    res.json({ success: true, data: categories });
  }),
);

itemsRouter.post(
  "/item-categories",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = itemCategorySchema.parse(req.body);
    const category = await prisma.itemCategory.create({ data: body });
    res.status(201).json({ success: true, data: category });
  }),
);

itemsRouter.get(
  "/items",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ category_id: z.string().optional(), low_stock: z.string().optional(), search: z.string().optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(req.query);

    const where = {
      is_active: true,
      ...(query.category_id && { category_id: query.category_id }),
      ...(query.search && { name: { contains: query.search, mode: "insensitive" as const } }),
    };

    let items = await prisma.item.findMany({ where, include: { category: true }, orderBy: { name: "asc" } });
    if (query.low_stock === "true") items = items.filter((i) => i.current_stock <= i.minimum_stock);

    const total = items.length;
    const page = query.page;
    const paged = items.slice((page - 1) * query.limit, page * query.limit);

    res.json({ success: true, data: paged, meta: { total, page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

itemsRouter.get(
  "/items/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const item = await prisma.item.findUnique({ where: { id }, include: { category: true } });
    if (!item) throw notFound("Item not found");
    res.json({ success: true, data: item });
  }),
);

itemsRouter.post(
  "/items",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = itemSchema.parse(req.body);
    const count = await prisma.item.count();
    const item_code = `ITM-${String(count + 1).padStart(4, "0")}`;
    const item = await prisma.item.create({ data: { ...body, item_code } });
    res.status(201).json({ success: true, data: item });
  }),
);

itemsRouter.put(
  "/items/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const body = itemSchema.partial().parse(req.body);
    const item = await prisma.item.update({ where: { id }, data: body });
    res.json({ success: true, data: item });
  }),
);

itemsRouter.delete(
  "/items/:id",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const txnCount = await prisma.stockTransaction.count({ where: { item_id: id } });
    if (txnCount > 0) throw conflict("Cannot delete an item with existing stock transactions");
    await prisma.item.update({ where: { id }, data: { is_active: false } });
    res.status(204).send();
  }),
);

// ── Stock Transactions ────────────────────────────────────────────

itemsRouter.post(
  "/stock/issue",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = stockIssueSchema.parse(req.body);
    const item = await prisma.item.findUnique({ where: { id: body.item_id } });
    if (!item) throw notFound("Item not found");
    // Stock never goes negative — the single rule this whole module exists to enforce.
    if (body.quantity > item.current_stock) {
      throw badRequest(`Insufficient stock. Available: ${item.current_stock}, Requested: ${body.quantity}`);
    }

    const newStock = item.current_stock - body.quantity;
    const [, transaction] = await prisma.$transaction([
      prisma.item.update({ where: { id: item.id }, data: { current_stock: newStock } }),
      prisma.stockTransaction.create({
        data: {
          item_id: item.id,
          transaction_type: "OUT",
          quantity: body.quantity,
          balance_after: newStock,
          reference_type: "ISSUE",
          department_id: body.department_id,
          issued_to_id: body.issued_to_id,
          notes: body.notes,
          created_by_id: req.user!.sub,
        },
      }),
    ]);

    res.status(201).json({ success: true, data: transaction });
  }),
);

itemsRouter.post(
  "/stock/adjust",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = stockAdjustSchema.parse(req.body);
    const item = await prisma.item.findUnique({ where: { id: body.item_id } });
    if (!item) throw notFound("Item not found");

    const [, transaction] = await prisma.$transaction([
      prisma.item.update({ where: { id: item.id }, data: { current_stock: body.new_quantity } }),
      prisma.stockTransaction.create({
        data: {
          item_id: item.id,
          transaction_type: "ADJUSTMENT",
          quantity: body.new_quantity - item.current_stock,
          balance_after: body.new_quantity,
          reference_type: "ADJUSTMENT",
          notes: body.reason,
          created_by_id: req.user!.sub,
        },
      }),
    ]);

    res.status(201).json({ success: true, data: transaction });
  }),
);

itemsRouter.get(
  "/stock/:item_id/transactions",
  asyncHandler(async (req, res) => {
    const itemId = reqParam(req, "item_id");
    const transactions = await prisma.stockTransaction.findMany({ where: { item_id: itemId }, orderBy: { created_at: "asc" } });
    res.json({ success: true, data: transactions });
  }),
);

itemsRouter.get(
  "/stock/low-stock-report",
  asyncHandler(async (_req, res) => {
    const items = await prisma.item.findMany({ where: { is_active: true }, include: { category: true } });
    const lowStock = items
      .filter((i) => i.current_stock <= i.minimum_stock)
      .sort((a, b) => (a.minimum_stock > 0 ? a.current_stock / a.minimum_stock : 0) - (b.minimum_stock > 0 ? b.current_stock / b.minimum_stock : 0));
    res.json({ success: true, data: lowStock });
  }),
);
