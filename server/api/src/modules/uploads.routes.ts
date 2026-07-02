import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/async-handler";
import { localFilePath, verifyLocalToken } from "../services/storage.service";
import { forbidden, badRequest } from "../lib/errors";

export const uploadsRouter = Router();

uploadsRouter.get(
  "/local-file",
  asyncHandler(async (req, res) => {
    const query = z
      .object({ blobKey: z.string().min(1), expiresAt: z.coerce.number(), token: z.string().min(1) })
      .safeParse(req.query);
    if (!query.success) throw badRequest("Invalid download link");

    const { blobKey, expiresAt, token } = query.data;
    if (!verifyLocalToken(blobKey, expiresAt, token)) throw forbidden("Download link expired or invalid");

    res.sendFile(localFilePath(blobKey));
  }),
);

// Unsigned direct access — mirrors how the Azure path's blob URL is also
// unsigned unless a SAS is requested. Used for public assets (logos, etc.).
uploadsRouter.get(
  "/local-file/direct",
  asyncHandler(async (req, res) => {
    const query = z.object({ blobKey: z.string().min(1) }).safeParse(req.query);
    if (!query.success) throw badRequest("Invalid file reference");
    res.sendFile(localFilePath(query.data.blobKey));
  }),
);
