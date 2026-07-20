import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { SETTINGS_ACADEMIC_ROLES } from "../../lib/roles";
import { studentIdConfigSchema } from "@education-erp/validators";
import { formatStudentId } from "../../lib/student-id-format";

export const studentIdRouter = Router();
const CONFIG_ID = "singleton";

studentIdRouter.use(authenticate);

// CLASS scope now inserts a class-identifying segment into the real
// generated ID (see generateStudentUID) — without a matching placeholder
// here, this preview would show a shorter format than what actually gets
// generated for a real student, misleading whoever is configuring it.
const SAMPLE_CLASS_SEGMENT = "07";
function sampleClassSegment(sequenceScope: string): string | undefined {
  return sequenceScope === "CLASS" ? SAMPLE_CLASS_SEGMENT : undefined;
}

studentIdRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const config = await prisma.studentIdConfig.findUnique({ where: { id: CONFIG_ID } });
    res.json({ success: true, data: config });
  }),
);

studentIdRouter.put(
  "/",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (req, res) => {
    const body = studentIdConfigSchema.parse(req.body);
    const preview_example = formatStudentId(body, 1, new Date(), sampleClassSegment(body.sequence_scope));
    const config = await prisma.studentIdConfig.update({
      where: { id: CONFIG_ID },
      data: { ...body, preview_example },
    });
    res.json({ success: true, data: config });
  }),
);

studentIdRouter.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const body = studentIdConfigSchema.parse(req.body);
    const classSegment = sampleClassSegment(body.sequence_scope);
    const examples = [1, 2, 3].map((seq) => formatStudentId(body, seq, new Date(), classSegment));
    res.json({ success: true, data: { preview: examples[0], examples } });
  }),
);

studentIdRouter.post(
  "/reset-sequence",
  authorize(SETTINGS_ACADEMIC_ROLES),
  asyncHandler(async (_req, res) => {
    const config = await prisma.studentIdConfig.update({ where: { id: CONFIG_ID }, data: { current_sequence: 0 } });
    res.json({ success: true, data: config, message: "Sequence reset to 0" });
  }),
);
