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
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!/^\s{0,3}```js-action[^\n]*$/.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    // Scan line-wise for a *bare* closing fence. A line like ```svg carries
    // an info string, so CommonMark treats it as opening a new block rather
    // than closing this one — matching the first ``` anywhere (as a regex
    // over the whole string does) ends the strip early and spills the rest
    // of the code action, SVG included, into the visible prose.
    let j = i + 1;
    while (j < lines.length && !/^\s{0,3}`{3,}\s*$/.test(lines[j])) j += 1;
    // Unterminated (still streaming): swallow to the end. The next render
    // arrives with the close fence and strips cleanly.
    i = j < lines.length ? j + 1 : lines.length;
  }
  return out.join("\n");
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

/**
 * True when a fenced block's body is an SVG document — same detection the
 * threads chat view uses: strip a BOM / XML declaration / doctype / leading
 * comments, then require the first tag to be `<svg`.
 */
function looksLikeSvg(raw: string): boolean {
  const stripped = raw
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[^?]*\?>/i, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trimStart();
  return /^<svg[\s>]/i.test(stripped);
}

/**
 * Sanitize an SVG document for inline rendering. Uses DOMPurify's SVG
 * profiles (the markdown pass runs the HTML profile, which would drop the
 * whole element), so scripts, event handlers and foreign objects are
 * stripped while shapes, gradients and filters survive. Returns null when
 * the input isn't an SVG or sanitizes down to nothing.
 */
function sanitizeSvg(raw: string): string | null {
  if (!/<svg[\s>]/i.test(raw)) return null;
  try {
    const clean = DOMPurify.sanitize(raw, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    return clean.trim() ? clean : null;
  } catch {
    return null;
  }
}

/** The placeholder a resolved SVG leaves behind, as a standalone block. */
function svgPlaceholder(index: number): string {
  return `\n\n<div class="ucw-svg" data-ucw-svg="${index}"></div>\n\n`;
}

/** The placeholder for an SVG that is still streaming or would not sanitize. */
function svgPendingPlaceholder(closed: boolean): string {
  const label = closed ? "Could not render SVG" : "Rendering SVG\u2026";
  return `\n\n<div class="ucw-svg ucw-svg-pending">${label}</div>\n\n`;
}

/**
 * Index just past the `</svg>` that closes the element opening at `start`,
 * or -1 if it never closes.
 *
 * Counts depth rather than taking the first `</svg>`, because nested `<svg>`
 * elements are legal and common in generated charts. A self-closing `<svg/>`
 * opens nothing.
 */
function findSvgEnd(text: string, start: number): number {
  const tag = /<svg\b|<\/svg\s*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(text))) {
    if (m[0].toLowerCase().startsWith("</")) {
      depth -= 1;
      if (depth === 0) return m.index + m[0].length;
    } else {
      // Find this start tag's own `>` to see whether it self-closes.
      const gt = text.indexOf(">", m.index);
      if (gt === -1) return -1;
      if (text[gt - 1] !== "/") depth += 1;
      tag.lastIndex = gt + 1;
    }
  }
  return -1;
}

/**
 * Pull raw, unfenced `<svg>…</svg>` documents out of prose.
 *
 * The agent writes charts as bare SVG in the message body, not inside a code
 * fence — so without this the markup reaches the markdown pass, whose
 * DOMPurify HTML profile drops the entire subtree and the visitor sees
 * nothing at all. The threads chat view renders it because react-markdown's
 * `rehype-raw` parses raw HTML straight into the tree; this is the widget's
 * equivalent, with the SVG profile doing the sanitizing.
 *
 * Only called on text outside code fences, so ```svg blocks keep their own
 * handling and a fence that *quotes* SVG source still renders as code.
 */
function extractRawSvg(text: string, svgs: string[]): string {
  if (!/<svg[\s>]/i.test(text)) return text;

  const open = /<svg[\s>]/gi;
  let out = "";
  let i = 0;
  for (;;) {
    open.lastIndex = i;
    const m = open.exec(text);
    if (!m) {
      out += text.slice(i);
      return out;
    }
    out += text.slice(i, m.index);

    const end = findSvgEnd(text, m.index);
    if (end === -1) {
      // Still streaming. Swallow the rest rather than letting half an SVG
      // document render as text; the next render closes the element.
      return out + svgPendingPlaceholder(false);
    }

    const clean = sanitizeSvg(text.slice(m.index, end));
    out += clean
      ? svgPlaceholder(svgs.push(clean) - 1)
      : svgPendingPlaceholder(true);
    i = end;
  }
}

/**
 * Pull SVG out of the prose and leave a placeholder `<div>` behind, so the
 * markdown pass never sees (and DOMPurify's HTML profile never strips) the
 * SVG markup. `injectSvgs` puts the sanitized documents back after the
 * markdown sanitize.
 *
 * Two shapes qualify. A **fence** counts as SVG when its info string is
 * `svg`, or when it is `xml`/`html`/absent and the body parses as an SVG
 * document — the same rule the threads chat view applies before swapping a
 * code block for a live preview. **Raw, unfenced** `<svg>` in the prose
 * counts too, which is how the agent actually emits charts.
 *
 * An unterminated fence or element (still streaming) becomes a pending
 * placeholder rather than half-rendered markup: partial SVG source flashing
 * into the bubble reads as garbage, and the next render closes it.
 */
function extractSvgs(text: string): { text: string; svgs: string[] } {
  const svgs: string[] = [];
  const lines = text.split("\n");
  const out: string[] = [];

  // Raw SVG is only extracted from the runs *between* fences, so that a
  // fence quoting SVG source still renders as code.
  let plain: string[] = [];
  const flushPlain = () => {
    if (!plain.length) return;
    out.push(extractRawSvg(plain.join("\n"), svgs));
    plain = [];
  };

  let i = 0;
  while (i < lines.length) {
    const open = /^(\s{0,3})(`{3,})([^`]*)$/.exec(lines[i]);
    if (!open) {
      plain.push(lines[i]);
      i += 1;
      continue;
    }
    flushPlain();
    const fence = open[2];
    const info = open[3].trim().split(/\s+/)[0].toLowerCase();
    const closeRe = new RegExp("^\\s{0,3}" + fence + "`*\\s*$");
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j += 1;
    const closed = j < lines.length;
    const body = lines.slice(i + 1, closed ? j : lines.length).join("\n");
    const isSvg =
      info === "svg" ||
      ((info === "" || info === "xml" || info === "html") && looksLikeSvg(body));
    if (!isSvg) {
      out.push(lines.slice(i, closed ? j + 1 : lines.length).join("\n"));
      i = closed ? j + 1 : lines.length;
      continue;
    }
    const clean = closed ? sanitizeSvg(body) : null;
    // Still streaming, or the block never sanitized down to a usable
    // document? Show a placeholder instead of the source.
    out.push(
      clean ? svgPlaceholder(svgs.push(clean) - 1) : svgPendingPlaceholder(closed),
    );
    i = closed ? j + 1 : lines.length;
  }
  flushPlain();
  return { text: out.join("\n"), svgs };
}

/** Fill the placeholders left by `extractSvgs` with the sanitized SVGs. */
function injectSvgs(html: string, svgs: string[]): string {
  if (!svgs.length) return html;
  return html.replace(
    /<div\b[^>]*\bdata-ucw-svg="(\d+)"[^>]*>\s*<\/div>/gi,
    (full, idx: string) => {
      const svg = svgs[Number(idx)];
      return svg === undefined ? full : `<div class="ucw-svg">${svg}</div>`;
    },
  );
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
  // SVG comes out before the markdown pass — its DOMPurify config runs the
  // HTML profile, which would drop the whole `<svg>` subtree. Fenced and raw
  // both, since the agent emits charts as bare `<svg>` in the prose.
  // They go back in (already sanitized with the SVG profile) afterwards.
  // Runs after the js-action strip so code actions that happen to embed
  // an SVG fence stay stripped rather than rendering.
  const { text: withoutSvg, svgs } = extractSvgs(prepared);
  const html = md.parse(withoutSvg, { async: false }) as string;
  const safe = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "data-ucw-svg"],
    ADD_ATTR: ["target"],
  });
  return injectSvgs(safe, svgs);
}
