---
"@uraiai/chat-widget-react": minor
"@uraiai/chat-widget-core": minor
---

Add `@uraiai/chat-widget-react/ui` — a modular, inline chat you can restyle or rebuild
part by part. `<UraiChatWidget>` is untouched and keeps shipping from `.`; this is a new
component alongside it, and an existing consumer gains zero bytes.

```tsx
import { UraiChat } from "@uraiai/chat-widget-react/ui";
import "@uraiai/chat-widget-react/styles.css";

<UraiChat widgetToken={token} userId={userId} className="h-dvh" />
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
