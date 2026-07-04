import { Router } from "express";
import { assetsRouter } from "./assets.routes";
import { depreciationRouter } from "./depreciation.routes";
import { itemsRouter } from "./items.routes";
import { suppliersRouter } from "./suppliers.routes";
import { purchaseRouter } from "./purchase.routes";
import { inventoryReportsRouter, inventoryDashboardRouter } from "./inventory-reports.routes";

export const inventoryModuleRouter = Router();

inventoryModuleRouter.use("/depreciation", depreciationRouter);
inventoryModuleRouter.use("/suppliers", suppliersRouter);
inventoryModuleRouter.use("/reports", inventoryReportsRouter);
inventoryModuleRouter.use("/dashboard", inventoryDashboardRouter);
// assetsRouter and itemsRouter define their own full paths (/assets/...,
// /asset-categories/..., /items/..., /stock/...) relative to root, so both
// mount at "/" — Express tries each in registration order and only one will
// ever match a given path since their route prefixes don't overlap.
inventoryModuleRouter.use("/", assetsRouter);
inventoryModuleRouter.use("/", itemsRouter);
inventoryModuleRouter.use("/", purchaseRouter);
