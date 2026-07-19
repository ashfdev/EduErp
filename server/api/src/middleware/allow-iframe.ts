import type { Request, Response, NextFunction } from "express";
import { env } from "../lib/env";

const FRAME_ANCESTORS = ["'self'", env.ADMIN_URL, env.PORTAL_URL, env.WEBSITE_URL, env.TEACHER_URL]
  .filter((v): v is string => !!v)
  .join(" ");

// helmet()'s default CSP sets `frame-ancestors 'self'` on every response,
// which silently blocks the browser from rendering PdfPreviewModal's
// <iframe> anywhere outside the API's own origin (ERR_BLOCKED_BY_RESPONSE,
// no JS-visible error) — exactly the gap that made every PDF preview modal
// render as a blank body. Apply this only to the specific document/PDF
// routes meant to be iframed by the known frontend apps; every other route
// keeps helmet's stricter same-origin-only default untouched. The rest of
// helmet's CSP directives (script-src, style-src, etc.) don't apply to a
// raw `application/pdf` response, so replacing the whole header here is
// safe, not just narrowly scoped to frame-ancestors.
export function allowIframeEmbed(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`);
  next();
}
