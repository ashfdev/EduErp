import { Router } from 'express';
import multer from 'multer';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { requireAuth } from '../middleware/auth.js';
import { requireTenant } from '../middleware/tenant.js';
import { uploadBuffer, getSignedDownloadUrl, localFilePath, verifyLocalToken } from '../lib/blob.js';
import { scanBuffer } from '../lib/scanner.js';

export const uploadsRouter = Router();

// Local-storage file serving (dev fallback when Azure isn't configured — see
// lib/blob.ts). Mounted before requireAuth/requireTenant: the "direct" route is
// unsigned by design (mirrors a public Azure blob), the "signed" route enforces
// its own HMAC+expiry check instead of a login session.
uploadsRouter.get('/local-file/direct', async (req, res) => {
  const blobKey = typeof req.query.blobKey === 'string' ? req.query.blobKey : undefined;
  if (!blobKey) return res.status(400).json({ error: 'blobKey is required' });

  const filePath = localFilePath(blobKey);
  try {
    await stat(filePath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  return createReadStream(filePath).pipe(res);
});

uploadsRouter.get('/local-file', async (req, res) => {
  const { blobKey, expiresAt, token } = req.query as Record<string, string | undefined>;
  if (!blobKey || !expiresAt || !token || !verifyLocalToken(blobKey, Number(expiresAt), token)) {
    return res.status(403).json({ error: 'Invalid or expired link' });
  }

  const filePath = localFilePath(blobKey);
  try {
    await stat(filePath);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  return createReadStream(filePath).pipe(res);
});

uploadsRouter.use(requireAuth, requireTenant);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
});

// Generic upload endpoint used by student/staff photos, document vault, homework
// attachments, etc. entityType/entityId let the caller tag what the file belongs to.
uploadsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required (field name "file"), or file type not allowed' });
  }

  const scanResult = await scanBuffer(req.file.buffer);
  if (scanResult === 'INFECTED') {
    return res.status(422).json({ error: 'File failed malware scan' });
  }

  const { blobKey, url } = await uploadBuffer(req.tenantId!, req.file.originalname, req.file.buffer, req.file.mimetype);

  const record = await req.db!.uploadedFile.create({
    data: {
      blobKey,
      url,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedBy: req.user!.sub,
      entityType: typeof req.body.entityType === 'string' ? req.body.entityType : undefined,
      entityId: typeof req.body.entityId === 'string' ? req.body.entityId : undefined,
      scanStatus: 'CLEAN',
      tenantId: req.tenantId!,
    },
  });

  return res.status(201).json(record);
});

// Gap-fix: there was no way to list a person's uploaded files (document vault).
uploadsRouter.get('/', async (req, res) => {
  const { entityType, entityId } = req.query as Record<string, string | undefined>;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });

  const files = await req.db!.uploadedFile.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(files);
});

// Private files (NID copies, appointment letters, ...) are never served from their
// direct blob URL — callers fetch a short-lived signed URL here instead.
uploadsRouter.get('/:id/signed-url', async (req, res) => {
  const file = await req.db!.uploadedFile.findUnique({ where: { id: req.params.id as string } });
  if (!file) return res.status(404).json({ error: 'File not found' });

  const url = await getSignedDownloadUrl(file.blobKey);
  return res.json({ url, expiresInMinutes: 15 });
});
