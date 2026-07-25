import type { Request, Response, NextFunction } from "express";
import { env } from "../lib/env";

const FRAME_ANCESTORS = ["'self'", env.ADMIN_URL, env.PORTAL_URL, env.WEBSITE_URL, env.TEACHER_URL]
  .filter((v): v is string => !!v)
  .join(" ");

// helmet()'s defaults set two separate headers that both silently block
// cross-origin embedding, on every response:
//   - CSP `frame-ancestors 'self'` — blocks PdfPreviewModal's <iframe>
//     anywhere outside the API's own origin.
//   - `Cross-Origin-Resource-Policy: same-origin` — blocks a cross-origin
//     <img>/fetch/iframe load of the resource as a sub-resource at all,
//     confirmed the hard way via Puppeteer (`net::ERR_BLOCKED_BY_RESPONSE.
//     NotSameOrigin`) when a PDF template's <img> pointed at a locally-
//     stored institution logo/student photo — the same class of gap as the
//     frame-ancestors one below, just for a different helmet default.
// Both are set together here since every route that needs one has always
// needed the other too (a document meant to be iframed by a known frontend
// app, or a locally-stored image meant to be loaded by Puppeteer or by any
// of the 4 separate frontend-app origins). Apply only to the specific
// document/PDF/upload routes meant to be embedded/loaded cross-origin;
// every other route keeps helmet's stricter same-origin-only defaults
// untouched. The rest of helmet's CSP directives (script-src, style-src,
// etc.) don't apply to a raw `application/pdf` or image response, so
// replacing the whole CSP header here is safe, not just narrowly scoped to
// frame-ancestors.
export function allowIframeEmbed(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Content-Security-Policy", `frame-ancestors ${FRAME_ANCESTORS}`);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}
