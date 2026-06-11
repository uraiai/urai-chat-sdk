import { Marked } from "marked";
import DOMPurify from "dompurify";

// Instance-scoped Marked so we never mutate the global `marked` singleton —
// a host application may be using it with its own options.
const md = new Marked({ breaks: true, gfm: true });

export function renderMarkdown(text: string): string {
  const html = md.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
    ADD_ATTR: ["target"],
  });
}
