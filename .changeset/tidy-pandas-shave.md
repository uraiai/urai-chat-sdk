---
"@uraiai/chat-widget-svelte": patch
"@uraiai/chat-widget-react": patch
"@uraiai/chat-widget-core": patch
"@uraiai/chat-widget-vue": patch
---

Tighten markdown rendering inside message bubbles so the widget uses its
horizontal and vertical space well at embedded widths. Markdown elements
previously ran on browser defaults tuned for a full-page document: lists
indented 40px (17% of a 380px panel), loose-list items paid a 28px gap
between one-line bullets, and headings rendered at the full UA scale.
Tables and images had no rules at all and could overflow the panel.

Body text stays at 14px — the density comes from margins and indents, not
from a smaller type scale. Bubbles now cap at 98% rather than 85%, which
returns ~52px per message.

The floating panel is also anchored flush to its 20px viewport offset instead
of clearing 64px for the launcher. Opening the panel always hides the
launcher, so that gap only ever pushed the panel up the page for no one —
worth 64px of screen height on short viewports.

Inline mode is unchanged: the host container still drives the size, and the
rule now documents that contract explicitly.
