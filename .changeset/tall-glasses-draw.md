---
"@uraiai/chat-widget-svelte": patch
"@uraiai/chat-widget-react": patch
"@uraiai/chat-widget-core": patch
"@uraiai/chat-widget-vue": patch
---

Render SVG code fences as inline drawings in the message bubble, matching the
threads chat view. A fence qualifies when its info string is `svg`, or when it
is `xml`/`html`/absent and the body parses as an SVG document (leading BOM, XML
declaration, doctype and comments are tolerated) — the same rule the chat view
applies before swapping a code block for a live preview. Everything else still
renders as a code block.

The SVG is pulled out before the markdown pass and sanitized on its own with
DOMPurify's SVG profiles, so scripts, event handlers and foreign objects are
stripped while shapes, gradients and filters survive. It could not simply ride
along with the markdown sanitize: that pass runs the HTML profile, which drops
the whole `<svg>` subtree.

A fence that is still streaming shows a "Rendering SVG…" placeholder rather
than flashing half-written markup into the bubble.
