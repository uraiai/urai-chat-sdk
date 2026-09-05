"use client";

import { createContext, memo, useContext, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { visit } from "unist-util-visit";
import { usePresentation } from "./context";
import { cx } from "./class-names";

/**
 * Markdown rendering, ported from the product's own chat view.
 *
 * The reason for react-markdown rather than the string renderer the
 * imperative widget uses: `<urai-tool-call>` markers and code fences
 * have to become **real React components** for them to be overridable
 * slots at all. A sanitized HTML string cannot be intercepted.
 */

/**
 * Any `<p>` whose only meaningful child is a `<urai-tool-call>` gets
 * unwrapped.
 *
 * CommonMark wraps inline raw HTML — including unknown custom elements
 * like ours — in a paragraph. That is fine for spans, but our card
 * renders a `<div>`, which is invalid inside a `<p>`; the browser's
 * silent fixup of that nesting remounts the card on every parent
 * re-render and resets its expanded state.
 *
 * Whitespace-only siblings are tolerated and dropped: the blank-line
 * padding around the marker often shows up as a stray empty text node.
 */
function rehypeUnwrapUraiToolCall() {
  const isWhitespace = (n: { type?: string; value?: string }) =>
    n && n.type === "text" && typeof n.value === "string" && n.value.trim() === "";
  const isMarker = (n: { type?: string; tagName?: string }) =>
    n && n.type === "element" && n.tagName === "urai-tool-call";
  return (tree: unknown) => {
    visit(tree as never, "element", (node: never, index, parent: never) => {
      const el = node as { tagName?: string; children?: unknown[] };
      if (!parent || index === undefined || el.tagName !== "p") return;
      const meaningful = (el.children ?? []).filter(
        (c) => !isWhitespace(c as never),
      );
      if (meaningful.length === 1 && isMarker(meaningful[0] as never)) {
        (parent as { children: unknown[] }).children[index] = meaningful[0];
      }
    });
  };
}

/**
 * SVG elements a drawing needs. Deliberately a shape-and-paint list: the
 * agent emits charts, not documents.
 *
 * What is left out matters more than what is in, so it is written down
 * rather than implied:
 *
 * - `script`, `animate`, `animateTransform`, `set` — execution, and SMIL
 *   animation has a history of being an attribute-rewriting vector.
 * - `foreignObject` — its whole purpose is to carry HTML back into the
 *   SVG, which would route around every rule above it.
 * - `style` (the element) — a stylesheet inside an SVG is scoped to the
 *   *document*, so it could restyle the customer's page around us.
 * - `image`, `feImage`, `use` — remote refs: a drawing that fetches.
 *
 * Anything absent from this list is dropped by rehype-sanitize, so the
 * failure mode of a missing tag is a chart that renders incompletely,
 * never one that renders dangerously.
 */
const svgTagNames = [
  "svg", "g", "defs", "symbol", "title", "desc",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "marker", "pattern", "clipPath", "mask",
  "linearGradient", "radialGradient", "stop",
  "filter", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite",
  "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
  "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feMerge", "feMergeNode", "feMorphology", "feOffset",
  "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
];

/**
 * Allowed attributes, as hast *property* names, not attribute names —
 * `stroke-width` arrives as `strokeWidth` and `stroke-dasharray` as
 * `strokeDashArray`, whose capitalization does not follow from the
 * attribute. Getting one wrong strips it silently and the chart still
 * "renders", just with no axes or labels, so these were resolved through
 * `property-information`'s `find(svg, attr).property` rather than guessed —
 * do the same when adding to this list, and check the result against a real
 * chart in the tests.
 *
 * No `href`/`xlinkHref` anywhere: nothing in the tag list above needs to
 * link, and leaving it out means there is no url to have to filter.
 */
const svgAttributes = [
  "id", "className", "style", "transform", "viewBox", "preserveAspectRatio",
  "xmlns", "width", "height", "x", "y", "dx", "dy",
  "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "d", "points",
  "pathLength", "overflow", "display", "visibility", "opacity", "color",
  "fill", "fillOpacity", "fillRule",
  "stroke", "strokeWidth", "strokeLineCap", "strokeLineJoin", "strokeDashArray",
  "strokeDashOffset", "strokeOpacity", "strokeMiterLimit",
  "vectorEffect", "shapeRendering", "textRendering", "paintOrder",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
  "textAnchor", "dominantBaseline", "alignmentBaseline", "baselineShift",
  "letterSpacing", "wordSpacing", "writingMode", "textDecoration", "startOffset",
  "offset", "stopColor", "stopOpacity", "gradientUnits", "gradientTransform",
  "spreadMethod", "fx", "fy",
  "clipPath", "clipRule", "mask", "filter",
  "markerStart", "markerMid", "markerEnd",
  "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
  "patternUnits", "patternContentUnits", "patternTransform",
  "clipPathUnits", "maskUnits", "maskContentUnits",
  "filterUnits", "primitiveUnits",
  "in", "in2", "result", "stdDeviation", "values", "type", "mode", "operator",
  "k1", "k2", "k3", "k4", "floodColor", "floodOpacity",
  "tableValues", "slope", "intercept", "amplitude", "exponent",
];

/**
 * The widget renders on a customer's page, so raw HTML passthrough is
 * not acceptable — the product's own chat view runs `rehype-raw` with no
 * sanitizer because it trusts its own model output inside its own
 * authenticated app. We keep the marker interception and add the
 * sanitizer back.
 *
 * SVG is allowed through because the agent draws charts as bare `<svg>` in
 * the message body; without these entries the sanitizer dropped the whole
 * subtree and the visitor saw nothing at all.
 */
const schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "urai-tool-call", ...svgTagNames],
  attributes: {
    ...defaultSchema.attributes,
    "urai-tool-call": ["id", "ord"],
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    ...Object.fromEntries(svgTagNames.map((tag) => [tag, svgAttributes])),
  },
};

/**
 * Tool-call summaries for the message being rendered, read from context
 * rather than closed over.
 *
 * The marker component is defined once at module scope for the same
 * reason: a fresh component identity per render remounts every card and
 * throws away the reader's expand/collapse choice.
 */
const ToolSummaryContext = createContext<Record<string, string>>({});

function UraiToolCallMarker(props: { id?: string }) {
  const summaries = useContext(ToolSummaryContext);
  const { components, classNames, unstyled } = usePresentation();
  const summary = props.id ? summaries[props.id] : undefined;
  const Slot = components.ToolCallCard;
  return <Slot id={props.id} summary={summary} classNames={classNames} unstyled={unstyled} />;
}

export interface MarkdownProps {
  text: string;
  /** False while the turn is still streaming. */
  isComplete?: boolean;
  toolSummaries?: Record<string, string>;
  className?: string;
}

/**
 * Split the text at the last blank line that is not inside an open code
 * fence. The prefix is append-only, so it can be memoized and re-parsed
 * only when that boundary moves; only the small tail is re-parsed each
 * frame. Without this, a long message re-parses in full on every token.
 */
/**
 * True when a fenced block's body is an SVG document — strip a BOM, XML
 * declaration, doctype and leading comments, then require the first tag to
 * be `<svg`. Same rule the imperative widget and the product's chat view
 * apply; duplicated rather than imported because the core package's
 * markdown entry pulls in `marked` and `dompurify`, neither of which this
 * view needs.
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
 * Unwrap ```svg fences into the bare SVG they contain, so a fenced drawing
 * and one written straight into the prose take the same path: raw markup
 * that `rehype-raw` parses and the schema above sanitizes. Without this a
 * fenced chart renders as its own source code.
 *
 * A fence qualifies when its info string is `svg`, or when it is
 * `xml`/`html`/absent and the body is an SVG document — the same rule the
 * other two renderers use before swapping a code block for a drawing.
 *
 * An unterminated fence is left alone: it is still streaming, and half an
 * SVG document unwrapped into the prose renders as garbage, where left
 * fenced it is merely code that has not finished arriving.
 */
export function unfenceSvg(text: string): string {
  if (!text.includes("```")) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^(\s{0,3})(`{3,})([^`]*)$/.exec(lines[i]);
    if (!open) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const fence = open[2];
    const info = open[3].trim().split(/\s+/)[0].toLowerCase();
    const closeRe = new RegExp("^\\s{0,3}" + fence + "`*\\s*$");
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j])) j += 1;
    const closed = j < lines.length;
    const body = lines.slice(i + 1, closed ? j : lines.length).join("\n");
    const isSvg =
      closed &&
      (info === "svg" ||
        ((info === "" || info === "xml" || info === "html") && looksLikeSvg(body)));
    if (!isSvg) {
      out.push(...lines.slice(i, closed ? j + 1 : lines.length));
      i = closed ? j + 1 : lines.length;
      continue;
    }
    // Blank lines around it so CommonMark reads the markup as an HTML
    // block rather than inline HTML inside a paragraph.
    out.push("", body, "");
    i = j + 1;
  }
  return out.join("\n");
}

export function splitStableTail(text: string): { stable: string; tail: string } {
  let inFence = false;
  let lastBoundary = 0;
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s{0,3}(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && line.trim() === "") lastBoundary = offset + line.length + 1;
    offset += line.length + 1;
  }
  return { stable: text.slice(0, lastBoundary), tail: text.slice(lastBoundary) };
}

const MarkdownBlock = memo(function MarkdownBlock({ text }: { text: string }) {
  const plugins = useMemo(
    () => [rehypeRaw, rehypeUnwrapUraiToolCall, [rehypeSanitize, schema]],
    [],
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={plugins as never}
      components={{
        ...({ "urai-tool-call": UraiToolCallMarker } as unknown as Record<string, never>),
      }}
      // eslint-disable-next-line react/no-children-prop
      children={text}
    />
  );
});

export function Markdown({
  text,
  isComplete = true,
  toolSummaries,
  className,
}: MarkdownProps) {
  const { classNames, unstyled } = usePresentation();
  const summaries = useMemo(() => toolSummaries ?? {}, [toolSummaries]);
  const cls = cx(unstyled ? undefined : "urai-markdown", classNames.markdown, className);

  // Unwrap SVG fences before the split, so the two SVG shapes converge on
  // one path and a fence can never be cut in half by it.
  const source = useMemo(() => unfenceSvg(text), [text]);

  // A finished message never needs the split — memoize the whole thing.
  const { stable, tail } = useMemo(
    () => (isComplete ? { stable: source, tail: "" } : splitStableTail(source)),
    [source, isComplete],
  );

  return (
    <ToolSummaryContext.Provider value={summaries}>
      <div className={cls} data-urai-part="markdown">
        {stable && <MarkdownBlock text={stable} />}
        {tail && <MarkdownBlock text={tail} />}
      </div>
    </ToolSummaryContext.Provider>
  );
}
