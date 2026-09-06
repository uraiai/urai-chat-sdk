# @uraiai/chat-widget-react

## 0.2.0

### Minor Changes

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

- a41f280: Rewrite the README for the modular `/ui` chat: styling in five increasing levels
  (defaults, theme tokens, `data-urai-part` CSS, `classNames`, `unstyled`), replacing and
  wrapping parts, the compound `Chat.*` API, the hooks table, vars, and how SVG, markdown
  and tool calls render. The floating `<UraiChatWidget>` keeps its own section and a
  "which one?" note — there is no deprecation.
- a41f280: Two fixes found by running the new `react-ui-demo` against a real service.

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

- a41f280: Render SVG in the React view.

  The agent draws charts as bare `<svg>` in the message body. The view runs
  `rehype-raw` so the markup reached the tree, but then `rehype-sanitize` with
  GitHub's `defaultSchema`, which has no SVG in it — so the whole subtree was
  dropped and the visitor saw nothing, while the same message rendered in the
  product's own chat view (which runs `rehype-raw` with no sanitizer, because it
  trusts its own output inside its own authenticated app).

  The schema now allows a shape-and-paint subset of SVG. Left out deliberately,
  because the widget renders on a customer's page: `script`, SMIL animation
  (`animate`, `animateTransform`, `set`), `foreignObject` (which exists to carry
  HTML back in), the `style` _element_ (a stylesheet inside an SVG is
  document-scoped and could restyle the host page), and the remote-reference
  elements `image`, `feImage` and `use`. No `href` is allowed on any SVG element,
  so there is no url to filter. Anything not on the list is dropped, so a missing
  entry means a chart that draws incompletely, never one that draws dangerously.

  ```svg fences are unwrapped to the same raw markup before parsing, so a fenced
  drawing and one written into the prose take one path instead of two — a fenced
  chart used to render as its own source code.
  ```

- Updated dependencies [a41f280]
- Updated dependencies [a41f280]
- Updated dependencies [a41f280]
- Updated dependencies [a41f280]
- Updated dependencies [02cef1f]
- Updated dependencies [a41f280]
  - @uraiai/chat-widget-core@0.2.0

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
