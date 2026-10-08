import { computed, defineComponent, h, type PropType, type VNode } from "vue";
import { renderMarkdown } from "@uraiai/chat-widget-core/markdown";
import { cx, splitStableTail } from "@uraiai/chat-widget-core/headless";
import { usePresentation } from "./context";
import { useChatConfig } from "./composables";

/**
 * Markdown rendering for the Vue view.
 *
 * Unlike the React view (react-markdown + rehype), this reuses the core
 * pipeline the imperative widget runs: `marked`, sanitized with DOMPurify,
 * SVG charts sanitized with DOMPurify's SVG profile, and math typeset by
 * KaTeX as MathML. The result is a sanitized HTML string rendered with
 * `innerHTML` — safe because nothing reaches the DOM without passing the
 * sanitizer first.
 *
 * `<urai-tool-call>` markers are the one thing a string cannot express as a
 * replaceable slot, so they are cut out of the text before the markdown
 * pass and rendered as the real `ToolCallCard` slot between the blocks.
 */

const MARKER = /<urai-tool-call\b([^>]*)>(?:\s*<\/urai-tool-call>)?/gi;

type Segment = { kind: "markdown"; html: string } | { kind: "tool"; id?: string };

function segmentsOf(text: string, opts: { cards: boolean; dev: boolean }): Segment[] {
  if (!opts.cards) {
    // Markers stripped, `js-action` fences stripped unless `dev`.
    const html = renderMarkdown(text, { dev: false });
    return html.trim() ? [{ kind: "markdown", html }] : [];
  }
  const out: Segment[] = [];
  const push = (chunk: string) => {
    if (!chunk.trim()) return;
    // No markers left in `chunk`, so `dev` only decides whether code
    // actions show as code.
    const html = renderMarkdown(chunk, { dev: opts.dev });
    if (html.trim()) out.push({ kind: "markdown", html });
  };
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    push(text.slice(last, m.index));
    const id = /\bid\s*=\s*"([^"]*)"/i.exec(m[1] ?? "")?.[1];
    out.push({ kind: "tool", id: id || undefined });
    last = (m.index ?? 0) + m[0].length;
  }
  push(text.slice(last));
  return out;
}

/**
 * One block of markdown. A component of its own so the settled prefix of a
 * streaming reply is a child whose props do not change — Vue skips it, and
 * only the tail is re-parsed per frame.
 */
const MarkdownBlock = defineComponent({
  name: "UraiMarkdownBlock",
  props: {
    text: { type: String, required: true },
    toolSummaries: { type: Object as PropType<Record<string, string>>, default: undefined },
    cards: { type: Boolean, default: false },
    dev: { type: Boolean, default: false },
  },
  setup(props) {
    const presentation = usePresentation();
    const segments = computed(() =>
      segmentsOf(props.text, { cards: props.cards, dev: props.dev }),
    );
    return () =>
      segments.value.map((seg, i): VNode => {
        if (seg.kind === "markdown") {
          return h("div", {
            key: `m${i}`,
            class: "urai-markdown-block",
            // Inline, so it holds in `unstyled` mode too: the wrapper must
            // not add a box between the bubble and the paragraphs.
            style: { display: "contents" },
            innerHTML: seg.html,
          });
        }
        return h(presentation.components.ToolCallCard, {
          key: `t${i}`,
          id: seg.id,
          summary: seg.id ? props.toolSummaries?.[seg.id] : undefined,
          classNames: presentation.classNames,
          unstyled: presentation.unstyled,
        });
      });
  },
});

/**
 * The markdown renderer the default `Markdown` slot uses, exported as
 * `MarkdownRenderer`. `isComplete: false` (a streaming turn) re-parses only
 * the text after the last blank line outside a code fence.
 */
export const Markdown = defineComponent({
  name: "UraiMarkdownRenderer",
  inheritAttrs: false,
  props: {
    text: { type: String, required: true },
    /** False while the turn is still streaming. */
    isComplete: { type: Boolean, default: true },
    toolSummaries: { type: Object as PropType<Record<string, string>>, default: undefined },
  },
  setup(props, { attrs }) {
    const presentation = usePresentation();
    const config = useChatConfig();
    const parts = computed(() =>
      // A finished message never needs the split.
      props.isComplete ? { stable: props.text, tail: "" } : splitStableTail(props.text),
    );
    return () => {
      const { behavior } = config.value;
      // Off unless the embedder opts in: a turn that calls tools several
      // times would otherwise stack up a column of near-identical chips.
      // Gated here rather than inside the default card so an override slot
      // obeys the same switch. The live activity row is separate.
      const cards = !!(behavior.showToolCalls || behavior.dev);
      const dev = !!behavior.dev;
      const { stable, tail } = parts.value;
      const block = (text: string, key: string) =>
        h(MarkdownBlock, { key, text, toolSummaries: props.toolSummaries, cards, dev });
      return h(
        "div",
        {
          ...attrs,
          class: [
            cx(
              presentation.unstyled ? undefined : "urai-markdown",
              presentation.classNames.markdown,
            ),
            attrs.class,
          ],
          "data-urai-part": "markdown",
        },
        [stable ? block(stable, "stable") : null, tail ? block(tail, "tail") : null],
      );
    };
  },
});
