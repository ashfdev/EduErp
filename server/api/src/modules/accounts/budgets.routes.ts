import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { ACCOUNTS_MANAGE_ROLES } from "../../lib/roles";
import { budgetSchema } from "@education-erp/validators";
import { z } from "zod";
import { badRequest, notFound } from "../../lib/errors";

export const budgetsRouter = Router();
budgetsRouter.use(authenticate);

budgetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z.object({ financial_year_id: z.string().optional() }).parse(req.query);
    const budgets = await prisma.budget.findMany({
      where: { ...(query.financial_year_id && { financial_year_id: query.financial_year_id }) },
      include: { _count: { select: { lines: true } } },
      orderBy: { created_at: "desc" },
    });
    res.json({ success: true, data: budgets });
  }),
);

budgetsRouter.post(
  "/",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const body = budgetSchema.parse(req.body);
    const budget = await prisma.budget.create({
      data: {
        financial_year_id: body.financial_year_id,
        name: body.name,
        lines: body.lines ? { create: body.lines } : undefined,
      },
      include: { lines: true },
    });
    res.status(201).json({ success: true, data: budget });
  }),
);

budgetsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const budget = await prisma.budget.findUnique({ where: { id }, include: { lines: { include: { account: true } } } });
    if (!budget) throw notFound("Budget not found");
    res.json({ success: true, data: budget });
  }),
);

budgetsRouter.put(
  "/:id/approve",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const budget = await prisma.budget.update({ where: { id }, data: { status: "APPROVED", approved_by_id: req.user!.sub, approved_at: new Date() } });
    res.json({ success: true, data: budget });
  }),
);

budgetsRouter.post(
  "/:id/lines",
  authorize(ACCOUNTS_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const budget = await prisma.budget.findUnique({ where: { id } });
    if (!budget) throw notFound("Budget not found");
    if (budget.status === "LOCKED") throw badRequest("Budget is locked and cannot be modified");

    const body = z.array(z.object({ account_id: z.string().min(1), amount: z.number().min(0), notes: z.string().optional() })).parse(req.body);
    await prisma.$transaction(
      body.map((line) =>
        prisma.budgetLine.upsert({
          where: { budget_id_account_id: { budget_id: id, account_id: line.account_id } },
          update: { amount: line.amount, notes: line.notes },
          create: { budget_id: id, account_id: line.account_id, amount: line.amount, notes: line.notes },
        }),
      ),
    );
    const updated = await prisma.budget.findUnique({ where: { id }, include: { lines: { include: { account: true } } } });
    res.json({ success: true, data: updated });
  }),
);
