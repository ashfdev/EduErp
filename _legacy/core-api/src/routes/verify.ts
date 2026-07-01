import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';

export const verifyRouter = Router();

// Public, no auth — this is the whole point of the Certificate Verification
// Portal (plan §2.2): anyone with the QR/code can confirm authenticity without
// logging in, and without seeing anything beyond the pre-approved publicPayload.
// Rate-limited (gap-fix, flagged when this shipped in Phase 3) — otherwise it's
// an open door to brute-force short verification codes.
verifyRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false }));

verifyRouter.get('/:code', async (req, res) => {
  const doc = await prisma.documentRegistry.findUnique({ where: { verificationCode: req.params.code as string } });
  if (!doc) {
    return res.status(404).json({ valid: false, error: 'No document found for this verification code' });
  }

  return res.json({
    valid: true,
    docType: doc.docType,
    issuedAt: doc.issuedAt,
    ...(doc.publicPayload as Record<string, unknown>),
  });
});
