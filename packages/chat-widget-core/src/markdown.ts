import { Marked } from "marked";
import DOMPurify from "dompurify";

// Instance-scoped Marked so we never mutate the global `marked` singleton —
// a host application may be using it with its own options.
const md = new Marked({ breaks: true, gfm: true });

/**
 * Strip fenced ```js-action``` blocks from agent-mode prose. The widget
 * surfaces those code actions via the activity pill + summary instead
 * of showing the raw code inline; visitors don't read code, and a
 * single agent step can run to hundreds of lines that would dominate
 * the bubble. The persisted message_content keeps the fences intact —
 * this is purely a render-time filter.
 *
 * Conservative matcher: only triple-backtick fences with the literal
 * `js-action` info string. Unterminated blocks (still streaming) get
 * swallowed from the opening fence onward; the next render with the
 * close fence re-strips cleanly. Avoids a flash of half-code mid-stream.
 */
export function stripJsActionFences(text: string): string {
  const re = /(^|\n)```js-action[^\n]*\n([\s\S]*?)(?:```|$)/g;
  return text.replace(re, (_full, lead: string) => lead);
}

/**
 * Replace `<urai-tool-call id="…"/>` markers with a visible "tool
 * action" chip in the rendered prose. Each marker becomes a
 * block-level `<div>` carrying the summary text (or a generic
 * placeholder while the async summarizer is still pending). Without
 * this the message would be just narration with no indication that
 * real work happened.
 *
 * Block-level (`<div>` wrapped in blank lines) so CommonMark parses
 * it as an HTML block rather than inline HTML inside a `<p>`. Handles
 * both self-closing and explicit-close marker forms.
 */
export function replaceUraiToolCallMarkers(
  text: string,
  summaries: Record<string, string> | undefined,
): string {
  const re = /<urai-tool-call\b([^>]*)>(?:\s*<\/urai-tool-call>)?/gi;
  return text.replace(re, (_full, attrs: string) => {
    const idMatch = /\bid\s*=\s*"([^"]*)"/i.exec(attrs);
    const id = idMatch ? idMatch[1] : "";
    const summary = id && summaries ? summaries[id] : undefined;
    const pendingCls = summary ? "" : " ucw-tool-summary-pending";
    const label = summary ?? "Code action";
    return `\n\n<div class="ucw-tool-summary${pendingCls}">${escapeHtml(label)}</div>\n\n`;
  });
}

/**
 * Same shape as `replaceUraiToolCallMarkers` but for dev mode: shows
 * a developer-friendly label (truncated id, falling back to ordinal)
 * alongside the summary when one exists.
 */
function devReplaceMarkers(
  text: string,
  summaries: Record<string, string> | undefined,
): string {
  const re = /<urai-tool-call\b([^>]*)>(?:\s*<\/urai-tool-call>)?/gi;
  return text.replace(re, (_full, attrs: string) => {
    const idMatch = /\bid\s*=\s*"([^"]*)"/i.exec(attrs);
    const ordMatch = /\bord\s*=\s*"([^"]*)"/i.exec(attrs);
    const id = idMatch ? idMatch[1] : "";
    const ordLabel = ordMatch ? `#${ordMatch[1]}` : "?";
    const idLabel = id ? id.slice(0, 8) : ordLabel;
    const summary = id && summaries ? summaries[id] : undefined;
    const display = summary ? `${idLabel} — ${summary}` : `${idLabel} — Code action`;
    return `\n\n<div class="ucw-tool-summary ucw-tool-summary-dev">${escapeHtml(display)}</div>\n\n`;
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

export interface RenderMarkdownOptions {
  /**
   * Dev mode — render fenced `js-action` blocks as code and show a
   * developer-friendly tool-call label that includes the row id.
   * Default false (strip fences, replace markers with a clean
   * summary-only chip).
   */
  dev?: boolean;
  /**
   * Map of `<urai-tool-call id="…"/>` ids to their async-generated
   * summaries. Populated from `ServerMessage.tool_call_summaries`
   * for history; undefined for live streams.
   */
  toolSummaries?: Record<string, string>;
}

export function renderMarkdown(
  text: string,
  opts: RenderMarkdownOptions = {},
): string {
  const dev = !!opts.dev;
  let prepared = text;
  if (!dev) {
    prepared = stripJsActionFences(prepared);
    prepared = replaceUraiToolCallMarkers(prepared, opts.toolSummaries);
  } else {
    prepared = devReplaceMarkers(prepared, opts.toolSummaries);
  }
  const html = md.parse(prepared, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
    ADD_ATTR: ["target"],
  });
}
