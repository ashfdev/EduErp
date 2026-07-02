import { Router } from "express";
import { hrStaffRouter } from "./staff.routes";
import { leaveTypesRouter, leavesRouter } from "./leave.routes";
import { salaryStructuresRouter } from "./salary.routes";
import { payrollRouter } from "./payroll.routes";
import { jobsRouter } from "./jobs.routes";

export const hrRouter = Router();

hrRouter.use("/staff", hrStaffRouter);
hrRouter.use("/leave-types", leaveTypesRouter);
hrRouter.use("/leaves", leavesRouter);
hrRouter.use("/salary-structures", salaryStructuresRouter);
hrRouter.use("/payroll", payrollRouter);
hrRouter.use("/jobs", jobsRouter);
