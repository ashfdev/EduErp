import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { templateUpload } from "../../middleware/upload";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { logAudit } from "../../lib/audit-log";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { DocumentType } from "@education-erp/types";

export const templatesRouter = Router();
templatesRouter.use(authenticate);

const DUMMY_DATA: Record<string, string> = {
  student_name: "Md. Sample Student",
  student_uid: "STU-26-01-0001",
  class_name: "Class 9",
  section_name: "A",
  institution_name: "My Institution",
  date: new Date().toLocaleDateString("en-GB"),
};

templatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.documentTemplate.findMany({ orderBy: { doc_type: "asc" } });
    const grouped: Record<string, typeof templates> = {};
    for (const t of templates) {
      (grouped[t.doc_type] ??= []).push(t);
    }
    res.json({ success: true, data: grouped });
  }),
);

templatesRouter.get(
  "/preview/:doc_type",
  asyncHandler(async (req, res) => {
    const template = await prisma.documentTemplate.findFirst({
      where: { doc_type: reqParam(req, "doc_type") as DocumentType, is_active: true },
    });
    if (!template) throw notFound("No active template for this document type");

    let html = template.html_content;
    for (const [key, value] of Object.entries(DUMMY_DATA)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    res.json({ success: true, data: { html, css: template.css_content } });
  }),
);

templatesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await prisma.documentTemplate.findUnique({ where: { id: reqParam(req, "id") } });
    if (!template) throw notFound("Template not found");
    res.json({ success: true, data: template });
  }),
);

templatesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  templateUpload.fields([{ name: "html", maxCount: 1 }, { name: "css", maxCount: 1 }]),
  asyncHandler(async (req, res) => {
    const body = z.object({ doc_type: z.nativeEnum(DocumentType), name: z.string().min(1) }).parse(req.body);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const htmlFile = files?.html?.[0];
    if (!htmlFile) throw badRequest("An HTML template file is required");

    const template = await prisma.documentTemplate.create({
      data: {
        doc_type: body.doc_type,
        name: body.name,
        html_content: htmlFile.buffer.toString("utf-8"),
        css_content: files?.css?.[0]?.buffer.toString("utf-8"),
      },
    });
    res.status(201).json({ success: true, data: template });
  }),
);

templatesRouter.put(
  "/:id/activate",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const template = await prisma.documentTemplate.findUnique({ where: { id: reqParam(req, "id") } });
    if (!template) throw notFound("Template not found");

    await prisma.$transaction([
      prisma.documentTemplate.updateMany({ where: { doc_type: template.doc_type }, data: { is_active: false } }),
      prisma.documentTemplate.update({ where: { id: reqParam(req, "id") }, data: { is_active: true } }),
    ]);
    await logAudit("TEMPLATE_ACTIVATE", { userId: req.user!.sub, targetType: "DocumentTemplate", targetId: template.id, metadata: { doc_type: template.doc_type }, req });
    res.json({ success: true, message: "Template activated" });
  }),
);

templatesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const template = await prisma.documentTemplate.findUnique({ where: { id: reqParam(req, "id") } });
    if (!template) throw notFound("Template not found");
    if (template.is_active) {
      const siblingCount = await prisma.documentTemplate.count({ where: { doc_type: template.doc_type } });
      if (siblingCount <= 1) throw conflict("Cannot delete the only template for this document type");
    }
    await prisma.documentTemplate.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);
