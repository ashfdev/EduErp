import DOMPurify from "isomorphic-dompurify";

// Applied to any rich-text field an admin authors that later gets rendered
// as raw HTML on the public website (notice body, static page content) —
// strips <script>/event-handlers/etc. while keeping ordinary formatting
// markup (Tiptap/rich-text editor output) intact.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
