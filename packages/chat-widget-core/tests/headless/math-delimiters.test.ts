import { describe, it, expect } from "vitest";
import { normalizeMathDelimiters, replaceMath, type MathSpan } from "../../src/headless/math-delimiters";

const spans = (text: string): MathSpan[] => {
  const out: MathSpan[] = [];
  replaceMath(text, (s) => (out.push(s), ""));
  return out;
};

describe("replaceMath — what counts as math", () => {
  it("finds single-dollar inline math the way models write it", () => {
    expect(spans("Indexing: $O(1)$, insertion $O(\\log N)$.").map((s) => s.tex)).toEqual([
      "O(1)",
      "O(\\log N)",
    ]);
  });

  it.each([
    "costs $5 and $10",
    "between $5-$10 a month",
    "US$5 or $6.",
    "price is $5.",
    "$ 5 $ is spaced",
    "a lone $ at the end $",
    "escaped \\$5 and \\$6",
  ])("leaves prices and stray dollars alone: %s", (text) => {
    expect(spans(text)).toEqual([]);
  });

  it("keeps an escaped dollar inside the formula", () => {
    expect(spans("set $A \\$ B$ ok")[0].tex).toBe("A \\$ B");
  });

  it("reads \\(…\\) as inline and \\[…\\] as display", () => {
    const [inline, display] = spans("inline \\(a+b\\) and \\[ \\sum_i x_i \\]");
    expect(inline).toMatchObject({ tex: "a+b", display: false, delimiter: "\\(" });
    expect(display).toMatchObject({ tex: "\\sum_i x_i", display: true, delimiter: "\\[" });
  });

  it("reads $$ on its own lines as display and inside a sentence as inline", () => {
    expect(spans("before\n$$\na = b\n$$\nafter")[0]).toMatchObject({ tex: "a = b", display: true });
    expect(spans("$$E = mc^2$$")[0]).toMatchObject({ display: true });
    expect(spans("so $$E = mc^2$$ holds")[0]).toMatchObject({ tex: "E = mc^2", display: false });
  });

  it("never scans code", () => {
    expect(spans("code `$x$` and ``a ` $y$ b``")).toEqual([]);
    expect(spans("```js\nconst s = `$x$`;\n```\nthen $z$").map((s) => s.tex)).toEqual(["z"]);
    // A fence still streaming is code until it closes.
    expect(spans("text\n```py\nx = '$a$'")).toEqual([]);
  });
});

describe("normalizeMathDelimiters", () => {
  it("rewrites into what remark-math parses, leaving $$ as written", () => {
    expect(normalizeMathDelimiters("a $x$ b \\(y\\) c $$z$$")).toBe("a $$x$$ b $$y$$ c $$z$$");
    expect(normalizeMathDelimiters("\\[x^2\\]")).toBe("\n$$\nx^2\n$$\n");
    expect(normalizeMathDelimiters("costs $5 and $10")).toBe("costs $5 and $10");
  });
});
