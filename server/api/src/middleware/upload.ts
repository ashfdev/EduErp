import multer from "multer";
// Pinned to the last CJS-compatible major (v16 — export API is
// fileType.fromBuffer, not fileTypeFromBuffer) — file-type dropped
// CommonJS support entirely from v17 onward, which this server (no
// "type": "module") can't require().
import fileType from "file-type";
import type { NextFunction, Request, Response } from "express";
import { badRequest } from "../lib/errors";

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Downloads-center / notice-attachment documents — office formats included
// since a school's forms/syllabus downloads are commonly Word/Excel, not
// just PDF. Two separate lists are needed: what a browser *claims* via
// Content-Type (used in multer's fileFilter, the cheap first pass) differs
// from what file-type actually *detects* from magic bytes (used in the real
// check below) — legacy .doc/.xls/.ppt all share the same OLE Compound File
// Binary signature, so file-type can only ever report the generic container
// type for those, never "application/msword" specifically.
const DOCUMENT_ACCEPT_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const DOCUMENT_DETECTED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/x-cfb",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

function mimeFileFilter(allowed: string[]) {
  return (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Fast, cheap reject on the client-claimed MIME type — not trusted on its
    // own (spoofable), just avoids buffering an obviously-wrong upload. The
    // real check is verifyMagicBytes() below, run after multer has the buffer.
    cb(null, allowed.includes(file.mimetype));
  };
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: mimeFileFilter(IMAGE_MIME_TYPES),
});

export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_MAX_BYTES },
  fileFilter: mimeFileFilter(DOCUMENT_ACCEPT_MIME_TYPES),
});

function collectFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === "object") return Object.values(req.files).flat();
  return [];
}

function verifyMagicBytes(allowed: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const files = collectFiles(req);
    for (const file of files) {
      const detected = await fileType.fromBuffer(file.buffer);
      // No detected type at all (e.g. a plain-text file with no magic
      // bytes) is rejected too — every type in our allowlists has a real
      // magic-byte signature, so "undetectable" means "not one of these".
      if (!detected || !allowed.includes(detected.mime)) {
        return next(badRequest(`File content doesn't match an allowed type (detected: ${detected?.mime ?? "unknown"})`));
      }
    }
    next();
  };
}

export const verifyImageMagicBytes = verifyMagicBytes(IMAGE_MIME_TYPES);
export const verifyDocumentMagicBytes = verifyMagicBytes(DOCUMENT_DETECTED_MIME_TYPES);

// CSV is plain text with no magic-byte signature, so file-type can't verify
// it — extension/claimed-MIME is the best available check here. The actual
// content validation happens downstream when csv-parse either produces
// sensible rows or the bulk-import preview surfaces per-row errors.
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || file.originalname.toLowerCase().endsWith(".csv"));
  },
});

// Document templates (HTML/CSS, read as text and stored directly in
// DocumentTemplate columns — never blob-stored, so no magic-byte check
// applies) get the spec's tighter 500KB cap, gated behind
// SETTINGS_ACADEMIC_ROLES authorization same as everything else in that module.
export const templateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, ["text/html", "text/css", "text/plain"].includes(file.mimetype));
  },
});
