/**
 * Find the math in model output without turning prices into formulas.
 *
 * Models write inline math as `$O(\log N)$`, and `\(…\)` / `\[…\]` too
 * (Gemini and OpenAI especially). A bare `$…$` rule would also typeset
 * "costs $5 and $10", so single dollars follow Pandoc's rule: the opening
 * `$` is followed by a non-space, the closing `$` is preceded by a non-space
 * and not followed by a digit. "$5 to $10" and "$5-$10" stay prose.
 *
 * Fenced code blocks and inline code spans are never scanned. Pure text in,
 * text out — no DOM, no renderer — so every renderer shares one rule.
 */

export interface MathSpan {
  /** The TeX between the delimiters. */
  tex: string;
  /** Block (display) math rather than inline. */
  display: boolean;
  /** Which delimiter it was written with. */
  delimiter: "$" | "$$" | "\\(" | "\\[";
  /** The span exactly as written, delimiters included. */
  source: string;
}

// One pass over the prose so no span is ever seen by two rules:
// `$$…$$`, `\[…\]`, `\(…\)`, then `$…$` under the Pandoc rule. A single-dollar
// body stays on one line and ends on an escape pair or a non-space, so a
// `\$` inside the formula never closes it.
const MATH_RE =
  /(?<!\\)\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\$)(?=\S)((?:\\.|[^$\\\n])*?(?:\\.|[^\s$\\]))\$(?![$\d])/g;

/**
 * Replace every math span in the prose with `render(span)`. Code — fenced or
 * inline — is passed through untouched.
 */
export function replaceMath(text: string, render: (span: MathSpan) => string): string {
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) return text;
  return splitFences(text)
    .map((part) =>
      part.code
        ? part.text
        : splitCodeSpans(part.text)
            .map((segment, i) => (i % 2 === 1 ? segment : replaceInProse(segment, render)))
            .join(""),
    )
    .join("");
}

/**
 * Rewrite the delimiters `remark-math` cannot parse on its own (with
 * `singleDollarTextMath: false`) into ones it can: `$x$` and `\(x\)` become
 * `$$x$$` — still inline math inside a paragraph — and `\[x\]` becomes a
 * display block. `$$…$$` is already understood and left exactly as written.
 */
export function normalizeMathDelimiters(text: string): string {
  return replaceMath(text, (span) => {
    if (span.delimiter === "$$") return span.source;
    return span.display ? `\n$$\n${span.tex}\n$$\n` : `$$${span.tex}$$`;
  });
}

function replaceInProse(prose: string, render: (span: MathSpan) => string): string {
  return prose.replace(
    MATH_RE,
    (source, dd: string | undefined, bracket: string | undefined, paren: string | undefined, single: string | undefined, offset: number) => {
      if (dd !== undefined) {
        // `$$` on a line of its own (or spanning lines) is a display block;
        // inside a sentence it is inline.
        const lineStart = offset === 0 || /\n[ \t]*$/.test(prose.slice(0, offset));
        const after = prose.slice(offset + source.length);
        const lineEnd = after === "" || /^[ \t]*(\n|$)/.test(after);
        const display = dd.includes("\n") || (lineStart && lineEnd);
        return render({ tex: dd.trim(), display, delimiter: "$$", source });
      }
      if (bracket !== undefined) return render({ tex: bracket.trim(), display: true, delimiter: "\\[", source });
      if (paren !== undefined) return render({ tex: paren.trim(), display: false, delimiter: "\\(", source });
      return render({ tex: single ?? "", display: false, delimiter: "$", source });
    },
  );
}

type Part = { text: string; code: boolean };

/** Split out fenced code blocks (``` or ~~~, 3+), including unterminated ones. */
function splitFences(text: string): Part[] {
  const parts: Part[] = [];
  const lines = text.split(/(?<=\n)/);
  let buf = "";
  let fence: string | null = null;
  for (const line of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence === null && marker) {
      if (buf) parts.push({ text: buf, code: false });
      buf = line;
      fence = marker;
    } else if (
      fence !== null &&
      marker &&
      marker[0] === fence[0] &&
      marker.length >= fence.length &&
      line.trim() === marker
    ) {
      parts.push({ text: buf + line, code: true });
      buf = "";
      fence = null;
    } else {
      buf += line;
    }
  }
  // A fence still open at the end (mid-stream) is code until it closes.
  if (buf) parts.push({ text: buf, code: fence !== null });
  return parts;
}

/**
 * Alternate prose / inline-code segments (even indexes are prose). A code span
 * closes on a backtick run of the same length; an unmatched run is literal.
 */
function splitCodeSpans(text: string): string[] {
  const out: string[] = [];
  let prose = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "`") {
      prose += text[i++];
      continue;
    }
    let run = 0;
    while (text[i + run] === "`") run++;
    const ticks = "`".repeat(run);
    let close = text.indexOf(ticks, i + run);
    // Skip longer runs that merely contain ours.
    while (close !== -1 && text[close + run] === "`") {
      let end = close;
      while (text[end] === "`") end++;
      close = text.indexOf(ticks, end);
    }
    if (close === -1) {
      prose += ticks;
      i += run;
      continue;
    }
    out.push(prose, text.slice(i, close + run));
    prose = "";
    i = close + run;
  }
  out.push(prose);
  return out;
}
