import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";

export const inventoryReportsRouter = Router();
inventoryReportsRouter.use(authenticate);

// Not itself a "report" but the dashboard's stat-card data lives here to
// keep all read-only inventory aggregates in one file — mounted separately
// at /api/inventory/dashboard (not under /reports) by index.ts.
export const inventoryDashboardRouter = Router();
inventoryDashboardRouter.use(authenticate);
inventoryDashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [assetCount, bookValueAgg, items, pendingPOs, poValueAgg, maintenanceDueCount] = await Promise.all([
      prisma.asset.count({ where: { status: "ACTIVE" } }),
      prisma.asset.aggregate({ where: { status: "ACTIVE" }, _sum: { book_value: true } }),
      prisma.item.findMany({ where: { is_active: true }, select: { current_stock: true, minimum_stock: true } }),
      prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"] } } }),
      prisma.purchaseOrder.aggregate({ where: { created_at: { gte: new Date(new Date().getFullYear(), 0, 1) } }, _sum: { total_amount: true } }),
      prisma.asset.count({ where: { status: "ACTIVE", maintenance_logs: { some: { next_due: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } } } } }),
    ]);
    const lowStockCount = items.filter((i) => i.current_stock <= i.minimum_stock).length;

    res.json({
      success: true,
      data: {
        total_assets: assetCount,
        total_book_value: bookValueAgg._sum.book_value ?? 0,
        total_items: items.length,
        low_stock_count: lowStockCount,
        pending_pos: pendingPOs,
        total_po_value_this_year: poValueAgg._sum.total_amount ?? 0,
        maintenance_due_count: maintenanceDueCount,
      },
    });
  }),
);

inventoryReportsRouter.get(
  "/asset-register",
  asyncHandler(async (req, res) => {
    const query = z.object({ category_id: z.string().optional(), status: z.string().optional(), department_id: z.string().optional() }).parse(req.query);
    const assets = await prisma.asset.findMany({
      where: {
        ...(query.category_id && { category_id: query.category_id }),
        ...(query.status && { status: query.status as never }),
        ...(query.department_id && { department_id: query.department_id }),
      },
      include: { category: true, department: true },
      orderBy: { asset_uid: "asc" },
    });
    res.json({
      success: true,
      data: assets.map((a) => ({
        asset_uid: a.asset_uid,
        name: a.name,
        category: a.category.name,
        purchase_date: a.purchase_date,
        purchase_price: a.purchase_price,
        accumulated_dep: a.accumulated_dep,
        book_value: a.book_value,
        status: a.status,
      })),
    });
  }),
);

inventoryReportsRouter.get(
  "/depreciation-schedule",
  asyncHandler(async (_req, res) => {
    const assets = await prisma.asset.findMany({ where: { status: "ACTIVE" }, include: { category: true } });
    const rows = assets.map((a) => {
      const annualDep = a.purchase_price * (a.category.depreciation_rate / 100);
      return {
        asset_uid: a.asset_uid,
        name: a.name,
        category: a.category.name,
        purchase_price: a.purchase_price,
        rate: a.category.depreciation_rate,
        annual_dep: Math.round(annualDep * 100) / 100,
        monthly_dep: Math.round((annualDep / 12) * 100) / 100,
        accumulated_dep: a.accumulated_dep,
        book_value: a.book_value,
      };
    });
    res.json({ success: true, data: rows, total_book_value: Math.round(rows.reduce((s, r) => s + r.book_value, 0) * 100) / 100 });
  }),
);

inventoryReportsRouter.get(
  "/stock-report",
  asyncHandler(async (_req, res) => {
    const items = await prisma.item.findMany({ where: { is_active: true }, include: { category: true }, orderBy: { name: "asc" } });
    res.json({
      success: true,
      data: items.map((i) => ({
        item_code: i.item_code,
        name: i.name,
        category: i.category.name,
        unit: i.unit,
        current_stock: i.current_stock,
        minimum_stock: i.minimum_stock,
        status: i.current_stock === 0 ? "OUT_OF_STOCK" : i.current_stock <= i.minimum_stock ? "LOW" : "NORMAL",
      })),
    });
  }),
);

inventoryReportsRouter.get(
  "/stock-movement",
  asyncHandler(async (req, res) => {
    const query = z.object({ item_id: z.string().min(1), from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional() }).parse(req.query);
    const item = await prisma.item.findUnique({ where: { id: query.item_id } });
    const transactions = await prisma.stockTransaction.findMany({
      where: { item_id: query.item_id, ...((query.from_date || query.to_date) && { created_at: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }) },
      orderBy: { created_at: "asc" },
    });
    const openingStock = transactions.length ? transactions[0]!.balance_after - (transactions[0]!.transaction_type === "IN" ? transactions[0]!.quantity : -transactions[0]!.quantity) : (item?.current_stock ?? 0);
    res.json({ success: true, data: { item, opening_stock: openingStock, transactions, closing_stock: item?.current_stock ?? 0 } });
  }),
);

inventoryReportsRouter.get(
  "/purchase-history",
  asyncHandler(async (req, res) => {
    const query = z.object({ from_date: z.coerce.date().optional(), to_date: z.coerce.date().optional(), supplier_id: z.string().optional() }).parse(req.query);
    const grns = await prisma.goodsReceivedNote.findMany({
      where: {
        ...((query.from_date || query.to_date) && { received_date: { ...(query.from_date && { gte: query.from_date }), ...(query.to_date && { lte: query.to_date }) } }),
        ...(query.supplier_id && { po: { supplier_id: query.supplier_id } }),
      },
      include: { po: { include: { supplier: true } }, items: true },
      orderBy: { received_date: "desc" },
    });
    res.json({ success: true, data: grns });
  }),
);

inventoryReportsRouter.get(
  "/maintenance-due",
  asyncHandler(async (_req, res) => {
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const assets = await prisma.asset.findMany({
      where: { status: "ACTIVE", maintenance_logs: { some: { next_due: { lte: in30Days } } } },
      include: { maintenance_logs: { orderBy: { next_due: "desc" }, take: 1 } },
    });
    res.json({ success: true, data: assets.map((a) => ({ asset_uid: a.asset_uid, name: a.name, next_due: a.maintenance_logs[0]?.next_due })) });
  }),
);
