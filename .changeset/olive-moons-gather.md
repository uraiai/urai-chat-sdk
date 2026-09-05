---
"@uraiai/chat-widget-core": patch
---

Extract the widget's framework-agnostic models out of `ui.ts` into a new internal
`src/headless/` directory: tool-activity tracking (including `prettyToolName`),
reasoning accumulate/seal, thread filtering, recency grouping and relative time, the
theme-to-CSS-variable mapping, and the config layering order.

No behaviour change and no public API change. `ui.ts` keeps every line of its DOM and
now consumes these models instead of owning the state inline; `applyTheme` is rebuilt on
the extracted mapping so a non-DOM caller can produce the same variables. The existing
test suite passes unmodified, and every user-visible string literal in the built bundle
is unchanged from 0.1.10.

This is groundwork: it gives the imperative widget and the forthcoming React view one
implementation of each model, so they cannot drift.
