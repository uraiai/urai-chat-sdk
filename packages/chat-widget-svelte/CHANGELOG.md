# @uraiai/chat-widget-svelte

## 0.1.10

Versions 0.1.0 – 0.1.10 predate changeset-managed releases in this repo: they were
versioned and published by hand, so this entry summarizes the whole 0.1.x line rather
than breaking it down per release. See the git history and the per-package tags
(`@uraiai/chat-widget-*@0.1.x`) for the detail.

- **First public release of the Urai chat widget SDK** — a framework-agnostic engine
  plus React, Vue and Svelte wrappers.
- **Commands from UraiJS.** Commands sent by a tool via `meta.urai.sendCommand` bubble
  up to the host as a `command` event, with the developer's JSON passed through verbatim.
- **Inline tool-call traces.** `<urai-tool-call>` markers in assistant prose render as
  activity chips, backed by the async-generated summaries the server returns on history.
- **File attachments** — upload from the composer, pending-state chips, and image and
  file rendering inside message bubbles.
- **Markdown density inside message bubbles.** Markdown elements previously ran on
  browser defaults tuned for a full-page document: lists indented 40px (17% of a 380px
  panel), loose-list items paid a 28px gap between one-line bullets, and headings
  rendered at the full UA scale; tables and images had no rules at all and could
  overflow the panel. Body text stays at 14px — the density comes from margins and
  indents, not a smaller type scale. Bubbles now cap at 98% rather than 85%. The
  floating panel is anchored flush to its 20px viewport offset instead of clearing 64px
  for the launcher, which only ever pushed the panel up the page for no one. Inline
  mode is unchanged.
- **Inline SVG.** SVG code fences render as drawings rather than code, matching the
  threads chat view. A fence qualifies when its info string is `svg`, or when it is
  `xml`/`html`/absent and the body parses as an SVG document. The SVG is pulled out
  before the markdown pass and sanitized on its own with DOMPurify's SVG profiles, so
  scripts, event handlers and foreign objects are stripped while shapes, gradients and
  filters survive. A fence that is still streaming shows a placeholder rather than
  flashing half-written markup into the bubble.
