---
"@uraiai/chat-widget-core": minor
---

Add a headless entry point: `@uraiai/chat-widget-core/headless` exposes the conversation
state machine — threads, sending, streaming, uploads, identity and config layering — with
no DOM, no framework and no markdown dependencies. `@uraiai/chat-widget-core/markdown`
now exposes the renderer on its own subpath.

`marked` and `dompurify` become external rather than inlined, so an app that already uses
`marked` no longer ships it twice. Both remain in `dependencies`.

The existing `.` entry is unchanged, and the imperative widget, Vue and Svelte wrappers
are untouched. Separate entries rather than tree-shaking: a consumer of `./headless` gets
17KB with none of the imperative view or its 19KB stylesheet string.

Two behaviours are deliberately better than the imperative view's: waiting for in-flight
uploads is a promise fan-in rather than a 50ms poll, and it holds the composer disabled
through the transition instead of briefly re-enabling it.
