import { Router } from "express";
import { reqParam } from "../../lib/req-param";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { imageUpload, verifyImageMagicBytes } from "../../middleware/upload";
import { uploadBuffer } from "../../services/storage.service";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { authoritySignatureSchema, authorityConfigSlotSchema } from "@education-erp/validators";
import { hasSignatureSlot } from "../../services/pdf.service";
import type { DocumentType } from "@education-erp/types";

export const signaturesRouter = Router();
export const authorityConfigRouter = Router();

signaturesRouter.use(authenticate);
authorityConfigRouter.use(authenticate);

signaturesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const signatures = await prisma.authoritySignature.findMany({ orderBy: { created_at: "asc" } });
    res.json({ success: true, data: signatures });
  }),
);

signaturesRouter.post(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  imageUpload.fields([{ name: "signature", maxCount: 1 }, { name: "seal", maxCount: 1 }]),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const body = authoritySignatureSchema.parse(req.body);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    let signature_url: string | undefined;
    let seal_url: string | undefined;
    if (files?.signature?.[0]) {
      const f = files.signature[0];
      signature_url = (await uploadBuffer("signatures", f.originalname, f.buffer, f.mimetype)).url;
    }
    if (files?.seal?.[0]) {
      const f = files.seal[0];
      seal_url = (await uploadBuffer("signatures", f.originalname, f.buffer, f.mimetype)).url;
    }

    // Deterministic single-active-signature-per-role: mirrors
    // templates.routes.ts's "/:id/activate" pattern (deactivate every
    // sibling in the same transaction, then create/activate the target)
    // — getSignatureSlots() resolves a signature by role with no orderBy,
    // so two active rows sharing a role render non-deterministically
    // otherwise. Only runs when the new row is actually active (DB
    // defaults is_active to true; an explicit is_active:false create
    // shouldn't touch any existing active signature).
    const willBeActive = body.is_active ?? true;
    const signature = await prisma.$transaction(async (tx) => {
      if (willBeActive) await tx.authoritySignature.updateMany({ where: { role: body.role, is_active: true }, data: { is_active: false } });
      return tx.authoritySignature.create({ data: { ...body, signature_url, seal_url } });
    });
    res.status(201).json({ success: true, data: signature });
  }),
);

signaturesRouter.put(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  imageUpload.fields([{ name: "signature", maxCount: 1 }, { name: "seal", maxCount: 1 }]),
  verifyImageMagicBytes,
  asyncHandler(async (req, res) => {
    const body = authoritySignatureSchema.partial().parse(req.body);
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const data: Record<string, unknown> = { ...body };

    if (files?.signature?.[0]) {
      const f = files.signature[0];
      data.signature_url = (await uploadBuffer("signatures", f.originalname, f.buffer, f.mimetype)).url;
    }
    if (files?.seal?.[0]) {
      const f = files.seal[0];
      data.seal_url = (await uploadBuffer("signatures", f.originalname, f.buffer, f.mimetype)).url;
    }

    const id = reqParam(req, "id");
    const signature = await prisma.$transaction(async (tx) => {
      if (data.is_active === true) {
        const target = await tx.authoritySignature.findUniqueOrThrow({ where: { id } });
        await tx.authoritySignature.updateMany({ where: { role: target.role, is_active: true, id: { not: id } }, data: { is_active: false } });
      }
      return tx.authoritySignature.update({ where: { id }, data });
    });
    res.json({ success: true, data: signature });
  }),
);

signaturesRouter.delete(
  "/:id",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    await prisma.authoritySignature.delete({ where: { id: reqParam(req, "id") } });
    res.status(204).send();
  }),
);

signaturesRouter.put(
  "/:id/activate",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.object({ is_active: z.boolean() }).parse(req.body);
    const id = reqParam(req, "id");
    const signature = await prisma.$transaction(async (tx) => {
      if (body.is_active) {
        const target = await tx.authoritySignature.findUniqueOrThrow({ where: { id } });
        await tx.authoritySignature.updateMany({ where: { role: target.role, is_active: true, id: { not: id } }, data: { is_active: false } });
      }
      return tx.authoritySignature.update({ where: { id }, data: body });
    });
    res.json({ success: true, data: signature });
  }),
);

authorityConfigRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const config = await prisma.authorityConfig.findMany({ orderBy: [{ doc_type: "asc" }, { slot: "asc" }] });
    res.json({ success: true, data: config });
  }),
);

// Which doc types currently have an authority mapped but whose active
// template has no {{signatureBlock}} anywhere — a mapping in that state
// silently never renders on the generated PDF, with no error surfaced
// anywhere else. Surfaced as a warning on the Signature Mapping page.
authorityConfigRouter.get(
  "/coverage",
  asyncHandler(async (_req, res) => {
    const configs = await prisma.authorityConfig.findMany({ select: { doc_type: true }, distinct: ["doc_type"] });
    const coverage = await Promise.all(
      configs.map(async (c) => ({ doc_type: c.doc_type, has_signature_slot: await hasSignatureSlot(c.doc_type as DocumentType) })),
    );
    res.json({ success: true, data: coverage });
  }),
);

authorityConfigRouter.get(
  "/:doc_type",
  asyncHandler(async (req, res) => {
    const config = await prisma.authorityConfig.findMany({
      where: { doc_type: reqParam(req, "doc_type") as DocumentType },
      orderBy: { slot: "asc" },
    });
    res.json({ success: true, data: config });
  }),
);

authorityConfigRouter.put(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = z.array(authorityConfigSlotSchema).parse(req.body);
    await prisma.$transaction(
      body.map((slot) =>
        prisma.authorityConfig.upsert({
          where: { doc_type_slot: { doc_type: slot.doc_type, slot: slot.slot } },
          create: slot,
          update: slot,
        }),
      ),
    );
    res.json({ success: true, message: "Authority mapping saved" });
  }),
);
