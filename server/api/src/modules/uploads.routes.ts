import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { localFilePath, verifyLocalToken } from "../services/storage.service";
import { forbidden, badRequest } from "../lib/errors";
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

// Unsigned direct access — mirrors how the Azure path's blob URL is also
// unsigned unless a SAS is requested. Used for public assets (logos, etc.).
uploadsRouter.get(
  "/local-file/direct",
  fileServingLimiter,
  allowIframeEmbed,
  asyncHandler(async (req, res) => {
    const query = z.object({ blobKey: z.string().min(1) }).safeParse(req.query);
    if (!query.success) throw badRequest("Invalid file reference");
    res.setHeader("Content-Disposition", `inline; filename="${suggestedFilename(query.data.blobKey)}"`);
    res.sendFile(localFilePath(query.data.blobKey));
  }),
);
