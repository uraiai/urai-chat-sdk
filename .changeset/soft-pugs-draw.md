---
"@uraiai/chat-widget-react": patch
---

Render SVG in the React view.

The agent draws charts as bare `<svg>` in the message body. The view runs
`rehype-raw` so the markup reached the tree, but then `rehype-sanitize` with
GitHub's `defaultSchema`, which has no SVG in it — so the whole subtree was
dropped and the visitor saw nothing, while the same message rendered in the
product's own chat view (which runs `rehype-raw` with no sanitizer, because it
trusts its own output inside its own authenticated app).

The schema now allows a shape-and-paint subset of SVG. Left out deliberately,
because the widget renders on a customer's page: `script`, SMIL animation
(`animate`, `animateTransform`, `set`), `foreignObject` (which exists to carry
HTML back in), the `style` *element* (a stylesheet inside an SVG is
document-scoped and could restyle the host page), and the remote-reference
elements `image`, `feImage` and `use`. No `href` is allowed on any SVG element,
so there is no url to filter. Anything not on the list is dropped, so a missing
entry means a chart that draws incompletely, never one that draws dangerously.

```svg fences are unwrapped to the same raw markup before parsing, so a fenced
drawing and one written into the prose take one path instead of two — a fenced
chart used to render as its own source code.
