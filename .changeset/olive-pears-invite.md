---
"@uraiai/chat-widget-react": patch
---

Two fixes found by running the new `react-ui-demo` against a real service.

The inline chat now follows the embedding app's `color-scheme` by default. It was pinned
to light, because `DEFAULT_THEME.dark` is `false` and that is indistinguishable from "no
preference" — so a host toggling dark mode left the chat white. `colorScheme` is now an
explicit prop defaulting to `"host"`; `theme.dark` of `true` or `"system"` still wins.

Component rules are scoped as `.urai-root :where(.urai-x)` rather than bare `:where()`.
At zero specificity a host's global `button { background: … }` reset — which almost every
app has — repainted the widget's own controls and rendered its icons white on white. One
class of specificity clears element selectors while still tying with a host class or
Tailwind utility, and since the stylesheet is prepended to `<head>`, the host still wins
that tie on source order.
