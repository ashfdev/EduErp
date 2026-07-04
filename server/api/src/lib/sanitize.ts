import DOMPurify from "isomorphic-dompurify";

// Applied to any rich-text field an admin authors that later gets rendered
// as raw HTML on the public website (notice body, static page content) —
// strips <script>/event-handlers/etc. while keeping ordinary formatting
// markup (Tiptap/rich-text editor output) intact.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// InstitutionProfile.map_embed_code holds a Google Maps <iframe> snippet and
// is rendered via dangerouslySetInnerHTML on the public homepage and contact
// page — the default HTML profile above strips iframes entirely, so this
// field needs its own allowlist rather than going unsanitized.
export function sanitizeEmbedCode(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "loading", "referrerpolicy", "frameborder", "width", "height", "src", "style"],
  });
}
