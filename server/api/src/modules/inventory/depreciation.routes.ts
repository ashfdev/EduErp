import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { INVENTORY_MANAGE_ROLES } from "../../lib/roles";
import { depreciationRunSchema } from "@education-erp/validators";
import { createDepreciationJournal } from "../accounts/auto-journal.service";

export const depreciationRouter = Router();
depreciationRouter.use(authenticate);

// Straight Line Method: annual_dep = purchase_price * (rate / 100), stop
// once book_value reaches 0 (never depreciate below zero, per CLAUDE.md's
// inventory rules). `months` controls whether this is a single-month run
// (monthly cadence) or a full 12-month run (annual cadence).
async function runDepreciation(period: string, financialYear: string, months: number) {
  const assets = await prisma.asset.findMany({ where: { status: "ACTIVE" }, include: { category: true } });
  const assetAmounts: { assetId: string; amount: number }[] = [];
  const updates: { id: string; newAccumulated: number; newBookValue: number; entry: { assetId: string; period: string; financialYear: string; opening: number; rate: number; amount: number; closing: number } }[] = [];

  for (const asset of assets) {
    const alreadyRun = await prisma.depreciationEntry.findUnique({ where: { asset_id_period: { asset_id: asset.id, period } } });
    if (alreadyRun) continue;

    const openingValue = computeBookValue(asset.purchase_price, asset.accumulated_dep);
    if (openingValue <= 0) continue;

    const annualDep = asset.purchase_price * (asset.category.depreciation_rate / 100);
    const periodDep = Math.min(openingValue, (annualDep / 12) * months);
    if (periodDep <= 0) continue;

    const newAccumulated = asset.accumulated_dep + periodDep;
    const newBookValue = computeBookValue(asset.purchase_price, newAccumulated);

    assetAmounts.push({ assetId: asset.id, amount: periodDep });
    updates.push({
      id: asset.id,
      newAccumulated,
      newBookValue,
      entry: { assetId: asset.id, period, financialYear, opening: openingValue, rate: asset.category.depreciation_rate, amount: periodDep, closing: newBookValue },
    });
  }

  if (assetAmounts.length === 0) return { processed: 0, total_dep_amount: 0, voucher_id: null };

  const voucherId = await createDepreciationJournal(period, assetAmounts);

  await prisma.$transaction([
    ...updates.map((u) => prisma.asset.update({ where: { id: u.id }, data: { accumulated_dep: u.newAccumulated, book_value: u.newBookValue } })),
    ...updates.map((u) =>
      prisma.depreciationEntry.create({
        data: {
          asset_id: u.entry.assetId,
          financial_year: u.entry.financialYear,
          period: u.entry.period,
          opening_value: u.entry.opening,
          dep_rate: u.entry.rate,
          dep_amount: u.entry.amount,
          closing_value: u.entry.closing,
          voucher_id: voucherId ?? undefined,
        },
      }),
    ),
  ]);

  return { processed: assetAmounts.length, total_dep_amount: assetAmounts.reduce((s, a) => s + a.amount, 0), voucher_id: voucherId };
}

function computeBookValue(purchasePrice: number, accumulatedDep: number): number {
  return Math.max(0, purchasePrice - accumulatedDep);
}

depreciationRouter.post(
  "/calculate",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = depreciationRunSchema.parse(req.body);
    const result = await runDepreciation(body.period, body.financial_year, 1);
    res.json({ success: true, data: result });
  }),
);

depreciationRouter.post(
  "/calculate-annual",
  authorize(INVENTORY_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ financial_year: z.string().min(1) }).parse(req.body);
    const result = await runDepreciation(`Annual ${body.financial_year}`, body.financial_year, 12);
    res.json({ success: true, data: result });
  }),
);

depreciationRouter.get(
  "/schedule",
  asyncHandler(async (_req, res) => {
    const assets = await prisma.asset.findMany({ where: { status: "ACTIVE" }, include: { category: true } });
    const schedule = assets.map((asset) => {
      const annualDep = asset.purchase_price * (asset.category.depreciation_rate / 100);
      const bookValue = computeBookValue(asset.purchase_price, asset.accumulated_dep);
      const remainingLife = annualDep > 0 ? Math.round((bookValue / annualDep) * 10) / 10 : 0;
      return {
        asset_uid: asset.asset_uid,
        name: asset.name,
        purchase_price: asset.purchase_price,
        rate: asset.category.depreciation_rate,
        annual_dep: Math.round(annualDep * 100) / 100,
        monthly_dep: Math.round((annualDep / 12) * 100) / 100,
        remaining_life_years: remainingLife,
        book_value: bookValue,
      };
    });
    res.json({ success: true, data: schedule });
  }),
);
