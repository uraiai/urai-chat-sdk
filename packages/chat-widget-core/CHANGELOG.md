# @uraiai/chat-widget-core

## 0.2.0

### Minor Changes

- a41f280: Add a headless entry point: `@uraiai/chat-widget-core/headless` exposes the conversation
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

- a41f280: Add `@uraiai/chat-widget-react/ui` — a modular, inline chat you can restyle or rebuild
  part by part. `<UraiChatWidget>` is untouched and keeps shipping from `.`; this is a new
  component alongside it, and an existing consumer gains zero bytes.

  ```tsx
  import { UraiChat } from "@uraiai/chat-widget-react/ui";
  import "@uraiai/chat-widget-react/styles.css";

  <UraiChat widgetToken={token} userId={userId} className="h-dvh" />;
  ```

  Three levels of customization: swap any part with `components={{ SendButton, Header }}`
  (every default is exported, so wrapping is a one-liner); restyle with `classNames`, plain
  CSS on `[data-urai-part]`, or design tokens; or drop to `<Chat.Root>` and compose the
  shell yourself. Hooks — `useComposer`, `useThreads`, `useAttachments`, `useChatStatus`,
  `useStickToBottom` — are the same contract the defaults consume.

  It is built from native React components in your own tree — no iframe, no shadow root —
  so your stylesheet, Tailwind classes and design tokens reach it, and it is
  **client-only by construction**: widget auth is `(token, Origin ∈ allowed_origins)` and a
  server-side fetch carries no `Origin`, so the tree waits for mount behind a sized
  fallback rather than 403-ing during SSR.

  `vars` — the per-thread context an embedder attaches to a conversation — works through
  every path: the initial prop lands in the thread-create body, prop changes patch the live
  thread (compared by value, so a fresh object literal per render is not a request per
  render), and updated vars carry into the next thread created. `userId` changes apply as a
  live `setUser` rather than remounting the widget. A `ref` exposes `setVars`, `setUser`,
  `startConversation`, `sendMessage`, `selectThread` and `configure` for host code outside
  the tree, mirroring the legacy widget's controller.

  Also new in core: `@uraiai/chat-widget-core/theme`, a design-token layer that fixes dark
  mode. Today `applyTheme` writes `--ucw-background` as an inline style while the
  stylesheet's `[data-theme="dark"]` block tries to override the same property on the same
  element — inline wins across origins, so the dark block is dead code. Tokens now resolve
  through `light-dark()` from seed variables, and JS never writes a semantic token. A
  customized brand colour gets a derived dark palette instead of being ignored, and
  foregrounds that fail WCAG AA against their own fill are flipped and reported.

### Patch Changes

- a41f280: Extract the widget's framework-agnostic models out of `ui.ts` into a new internal
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

- a41f280: Add a `ChatTransport` port — the interface the headless models depend on, which the
  concrete `Transport` satisfies structurally. A constrained type alias asserts that at
  compile time, so adding a method to `Transport` without updating the port (or letting a
  signature drift) fails `tsc` rather than surfacing later as a confusing test failure.

  Internal only; no runtime code and no public API change.

- 02cef1f: Fix "new conversation" resuming the conversation it was meant to leave.

  `newConversation()` cleared the thread id from state but not from storage. `ensureThread`
  consults the persisted id before it considers creating anything, so the next message
  resumed the old thread and re-hydrated its transcript — the visitor pressed the button,
  watched the panel clear, typed, and saw the old conversation come back. The imperative
  widget clears storage in `reset()`; that step was missed when the store was extracted.

  A pending reset now also skips the cached thread outright in `ensureThread`, so clearing
  storage is not the only thing standing between the visitor and their old conversation.

  Only the new React `/ui` chat was affected; `<UraiChatWidget>`, Vue and Svelte go through
  `ui.ts`, which always cleared storage.

- a41f280: Render raw, unfenced `<svg>` in assistant messages.

  The agent writes charts as bare `<svg>` in the message body rather than inside a

  ````svg fence. Only fenced SVG was lifted out ahead of the markdown pass, so raw
  markup reached DOMPurify's HTML profile, which drops the whole subtree — the
  widget showed nothing at all, while the same message rendered fine in the chat
  app (react-markdown parses raw HTML straight into the tree). Raw `<svg>` is now
  extracted and sanitized with the SVG profile alongside fenced blocks, with the
  same pending placeholder while a document is still streaming. Nested `<svg>`
  elements close correctly, and SVG quoted inside a non-SVG fence still renders as
  code.

  Also fixes `stripJsActionFences` ending a code action at the first ``` it finds
  anywhere. A line like ```svg carries an info string, so CommonMark treats it as
  opening a block rather than closing the fence; the strip now scans line-wise for
  a bare closing fence. Previously a code action containing its own fence spilled
  its tail into the visible prose, where the sanitizer happened to hide it — with
  raw SVG rendering, it would have become visible.
  ````

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
