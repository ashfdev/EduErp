import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { localFilePath, verifyLocalToken } from "../services/storage.service";
import { forbidden, badRequest, notFound } from "../lib/errors";
import { allowIframeEmbed } from "../middleware/allow-iframe";
import { fileServingLimiter } from "../middleware/rate-limit";

export const uploadsRouter = Router();

// blobKey is `${category}/${uuid}-${sanitizedOriginalName}` (see uploadBuffer()
// in storage.service.ts) — recover the original filename by stripping the
// 36-char UUID + separating hyphen, so a browser's "Save As"/PDF-viewer
// download button shows the file's real name instead of falling back to
// whatever the PDF's own internal metadata happens to contain (which can be
// the original uploader's local filename — the exact "shows a file from
// another PC" symptom this fixes).
function suggestedFilename(blobKey: string): string {
  const basename = blobKey.split("/").pop() ?? blobKey;
  const uuidPrefixLength = 37; // 36-char UUID + "-"
  return /^[0-9a-f-]{36}-/i.test(basename) ? basename.slice(uuidPrefixLength) : basename;
}

uploadsRouter.get(
  "/local-file",
  fileServingLimiter,
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const query = z
      .object({ blobKey: z.string().min(1), expiresAt: z.coerce.number(), token: z.string().min(1) })
      .safeParse(req.query);
    if (!query.success) throw badRequest("Invalid download link");

    const { blobKey, expiresAt, token } = query.data;
    if (!verifyLocalToken(blobKey, expiresAt, token)) throw forbidden("Download link expired or invalid");

    res.setHeader("Content-Disposition", `inline; filename="${suggestedFilename(blobKey)}"`);
    res.sendFile(localFilePath(blobKey));
  }),
);

// Upload categories whose links are stored as plain direct URLs and shown
// in pages and PDFs: branding and website content, people's photos,
// signature/seal images, asset QR codes. Everything else (student and staff
// documents, admission documents, bank slips, CVs, payslips, generated
// documents, teaching resources, submissions) is reachable only through a
// signed, expiring link from /local-file above. Before this list existed,
// any blobKey taken from an old signed link opened here forever.
const DIRECT_ACCESS_CATEGORIES = new Set([
  "branding",
  "downloads",
  "gallery",
  "governing-body",
  "notices",
  "sliders",
  "students",
  "staff",
  "admission-photos",
  "signatures",
  "assets",
]);

// Unsigned direct access — mirrors how the Azure path's blob URL is also
// unsigned unless a SAS is requested. Limited to the categories above.
uploadsRouter.get(
  "/local-file/direct",
  fileServingLimiter,
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const query = z.object({ blobKey: z.string().min(1) }).safeParse(req.query);
    if (!query.success) throw badRequest("Invalid file reference");
    const category = query.data.blobKey.split("/")[0] ?? "";
    if (!DIRECT_ACCESS_CATEGORIES.has(category)) throw notFound("File not found");
    res.setHeader("Content-Disposition", `inline; filename="${suggestedFilename(query.data.blobKey)}"`);
    res.sendFile(localFilePath(query.data.blobKey));
  }),
);
