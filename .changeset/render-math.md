---
"@uraiai/chat-widget-core": minor
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-vue": minor
"@uraiai/chat-widget-svelte": minor
---

Render math in replies.

Models write formulas as `$O(\log N)$`, `\(…\)`, `\[…\]` and `$$…$$`; these used to reach
the visitor as raw TeX. They now render with KaTeX, as MathML, which every current browser
draws natively — no KaTeX stylesheet or fonts to load into your page.

Prices stay prose: a single `$` only opens math when followed by a non-space, and only
closes it when preceded by one and not followed by a digit, so "costs $5 and $10" is
untouched. Code spans and fenced blocks are never treated as math.

`katex` is a new dependency of `@uraiai/chat-widget-core` (and `remark-math` /
`rehype-katex` of `@uraiai/chat-widget-react`), about 76 KB gzipped.
