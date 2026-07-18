import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../middleware/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { reqParam } from "../../lib/req-param";
import { WEBSITE_CONTENT_ROLES } from "../../lib/roles";
import { staticPageSchema } from "@education-erp/validators";
import { triggerRevalidation } from "../../services/revalidate.service";
import { sanitizeHtml } from "../../lib/sanitize";
import { notFound } from "../../lib/errors";

export const pagesRouter = Router();
pagesRouter.use(authenticate);

export const PAGE_KEYS = [
  "about", "history", "mission_vision", "principal_message", "vice_principal_message",
  "chairman_message", "facilities", "achievements", "contact", "admission_info",
  "course_curriculum", "grading_system", "academic_regulations", "policies",
] as const;

// The public route these page keys are served from differs by cluster —
// Academic's 4 keys live under /academic/[slug], everything else under
// /about/[slug] (see apps/website/src/app/[locale]/{about,academic}).
const ACADEMIC_PAGE_KEYS = new Set(["course_curriculum", "grading_system", "academic_regulations", "policies"]);
function publicPathFor(pageKey: string): string {
  return ACADEMIC_PAGE_KEYS.has(pageKey) ? `/academic/${pageKey}` : `/about/${pageKey}`;
}

pagesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const pages = await prisma.staticPage.findMany();
    const byKey = new Map(pages.map((p) => [p.page_key, p]));
    res.json({ success: true, data: PAGE_KEYS.map((key) => byKey.get(key) ?? { page_key: key, title_en: null, is_published: true }) });
  }),
);

pagesRouter.get(
  "/:page_key",
  asyncHandler(async (req, res) => {
    const pageKey = reqParam(req, "page_key");
    const page = await prisma.staticPage.findUnique({ where: { page_key: pageKey } });
    res.json({ success: true, data: page ?? { page_key: pageKey, title_en: null, content_en: null, is_published: true } });
  }),
);

pagesRouter.put(
  "/:page_key",
  authorize(WEBSITE_CONTENT_ROLES),
  asyncHandler(async (req, res) => {
    const pageKey = reqParam(req, "page_key");
    if (!(PAGE_KEYS as readonly string[]).includes(pageKey)) throw notFound("Unknown page key");

    const body = staticPageSchema.parse(req.body);
    if (body.content_en) body.content_en = sanitizeHtml(body.content_en);
    if (body.content_bn) body.content_bn = sanitizeHtml(body.content_bn);
    const page = await prisma.staticPage.upsert({
      where: { page_key: pageKey },
      create: { page_key: pageKey, ...body },
      update: body,
    });
    await triggerRevalidation([publicPathFor(pageKey)]);
    res.json({ success: true, data: page });
  }),
);
