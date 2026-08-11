import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { STAFF_ONLY_ROLES, COMPLAINT_MANAGE_ROLES } from "../../lib/roles";
import { createComplaintSchema, updateComplaintSchema, createComplaintMessageSchema } from "@education-erp/validators";
import { logAudit } from "../../lib/audit-log";
import { registerBatchJobKind, enqueueBatchJob, EXCEL_EXPORT_BATCH_THRESHOLD, type BatchJobResult } from "../../lib/batch-job-registry";
import { badRequest, notFound } from "../../lib/errors";
import { postComplaintMessage } from "./complaint-message.helper";
import { notifyRoles } from "../../services/in-app-notification.service";

// Staff-side surface. Portal callers use the separate routes in
// portal.routes.ts — STAFF_ONLY_ROLES and PORTAL_ROLES are disjoint role
// sets gated by different auth conventions in this codebase, so this can't
// be one router serving both.
export const complaintsRouter = Router();
complaintsRouter.use(authenticate, authorize(STAFF_ONLY_ROLES));

const manageAll = (role: string) => COMPLAINT_MANAGE_ROLES.includes(role as never);

complaintsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(req.query);
    const where = manageAll(req.user!.role) ? {} : { raised_by_user_id: req.user!.sub };

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.complaint.count({ where }),
    ]);
    res.json({ success: true, data: complaints, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } });
  }),
);

interface ComplaintsExportParams {
  scope: "all" | "own";
  user_id: string;
}

function buildComplaintsExportWhere(params: ComplaintsExportParams) {
  return params.scope === "all" ? {} : { raised_by_user_id: params.user_id };
}

// Plan Twenty (large-batch background jobs), extended to this Excel export.
// scope/user_id capture the caller's manageAll()-derived permission at
// request time (the worker has no req to re-check against later) -- the
// same "snapshot the authorization decision, not just the query filter"
// discipline already used by the admit-card override system.
async function buildComplaintsExportJob(params: ComplaintsExportParams): Promise<BatchJobResult> {
  const complaints = await prisma.complaint.findMany({ where: buildComplaintsExportWhere(params), orderBy: { created_at: "desc" } });

  const userIds = [...new Set(complaints.map((c) => c.raised_by_user_id))];
  const staffIds = [...new Set(complaints.map((c) => c.assigned_to_id).filter((id): id is string => !!id))];
  const [users, staff] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name_en: true } }),
    prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name_en: true } }),
  ]);
  const userNameById = new Map(users.map((u) => [u.id, u.name_en]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.name_en]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Complaints");
  sheet.columns = [
    { header: "Raised By", key: "raised_by", width: 22 },
    { header: "Category", key: "category", width: 16 },
    { header: "Description", key: "description", width: 40 },
    { header: "Status", key: "status", width: 14 },
    { header: "Assigned To", key: "assigned_to", width: 20 },
    { header: "Raised At", key: "created_at", width: 14 },
    { header: "Resolved At", key: "resolved_at", width: 14 },
  ];
  for (const c of complaints) {
    sheet.addRow({
      raised_by: userNameById.get(c.raised_by_user_id) ?? "",
      category: c.category,
      description: c.description,
      status: c.status,
      assigned_to: c.assigned_to_id ? (staffNameById.get(c.assigned_to_id) ?? "") : "",
      created_at: c.created_at.toISOString().slice(0, 10),
      resolved_at: c.resolved_at ? c.resolved_at.toISOString().slice(0, 10) : "",
    });
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: "Complaints.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}
registerBatchJobKind("COMPLAINTS_EXPORT", "COMPLAINTS_EXPORT", (params) => buildComplaintsExportJob(params as unknown as ComplaintsExportParams));

complaintsRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const params: ComplaintsExportParams = { scope: manageAll(req.user!.role) ? "all" : "own", user_id: req.user!.sub };
    const count = await prisma.complaint.count({ where: buildComplaintsExportWhere(params) });
    if (count <= EXCEL_EXPORT_BATCH_THRESHOLD) {
      const { buffer, filename, mimeType } = await buildComplaintsExportJob(params);
      res.setHeader("Content-Type", mimeType!);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }
    const job = await enqueueBatchJob("COMPLAINTS_EXPORT", params, req.user!.sub);
    res.status(202).json({ success: true, data: { job_id: job.id, status: job.status } });
  }),
);

complaintsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createComplaintSchema.parse(req.body);
    const complaint = await prisma.complaint.create({ data: { ...body, raised_by_user_id: req.user!.sub } });
    await notifyRoles(COMPLAINT_MANAGE_ROLES, {
      type: "COMPLAINT_FILED",
      title: "New complaint filed",
      body: complaint.description.slice(0, 140),
      link: "/complaints",
    });
    res.status(201).json({ success: true, data: complaint });
  }),
);

complaintsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: { messages: { orderBy: { created_at: "asc" } } },
    });
    if (!complaint) throw notFound("Complaint not found");
    if (!manageAll(req.user!.role) && complaint.raised_by_user_id !== req.user!.sub) throw notFound("Complaint not found");

    const senderIds = [...new Set([complaint.raised_by_user_id, ...complaint.messages.map((m) => m.sender_user_id)])];
    const senders = await prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, name_en: true } });
    const nameById = new Map(senders.map((s) => [s.id, s.name_en]));
    res.json({
      success: true,
      data: {
        ...complaint,
        raised_by_name: nameById.get(complaint.raised_by_user_id) ?? null,
        messages: complaint.messages.map((m) => ({ ...m, sender_name: nameById.get(m.sender_user_id) ?? null })),
      },
    });
  }),
);

complaintsRouter.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) throw notFound("Complaint not found");
    if (!manageAll(req.user!.role) && existing.raised_by_user_id !== req.user!.sub) throw notFound("Complaint not found");

    const body = createComplaintMessageSchema.parse(req.body);
    const message = await postComplaintMessage(id, req.user!.sub, body.message, req);
    res.status(201).json({ success: true, data: message });
  }),
);

complaintsRouter.put(
  "/:id",
  authorize(COMPLAINT_MANAGE_ROLES),
  asyncHandler(async (req, res) => {
    const id = reqParam(req, "id");
    const existing = await prisma.complaint.findUnique({ where: { id } });
    if (!existing) throw notFound("Complaint not found");

    const body = updateComplaintSchema.parse(req.body);
    if (body.assigned_to_id) {
      const staff = await prisma.staff.findUnique({ where: { id: body.assigned_to_id } });
      if (!staff) throw badRequest("assigned_to_id does not refer to a real staff member");
    }
    const resolving = body.status === "RESOLVED" || body.status === "CLOSED";
    const complaint = await prisma.complaint.update({
      where: { id },
      data: { ...body, ...(resolving && { resolved_at: new Date() }) },
    });

    if (resolving) {
      await logAudit("COMPLAINT_RESOLVE", { userId: req.user!.sub, targetType: "Complaint", targetId: id, metadata: { status: body.status }, req });
    }
    res.json({ success: true, data: complaint });
  }),
);
