import { Router } from "express";
import { accountsRouter } from "./accounts.routes";
import { vouchersRouter, ledgerRouter } from "./vouchers.routes";
import { accountsReportsRouter } from "./reports.routes";
import { budgetsRouter } from "./budgets.routes";
import { banksRouter, chequesRouter, taxRouter } from "./banks.routes";

export const accountsModuleRouter = Router();

accountsModuleRouter.use("/vouchers", vouchersRouter);
accountsModuleRouter.use("/ledger", ledgerRouter);
accountsModuleRouter.use("/reports", accountsReportsRouter);
accountsModuleRouter.use("/budgets", budgetsRouter);
accountsModuleRouter.use("/banks", banksRouter);
accountsModuleRouter.use("/cheques", chequesRouter);
accountsModuleRouter.use("/tax-entries", taxRouter);
// Mounted last — accountsRouter's own routes are all relative to root
// (/, /chart, /search, /:id, /financial-years, /fee-mapping) and must not
// shadow the more specific sub-routers above.
accountsModuleRouter.use("/", accountsRouter);
