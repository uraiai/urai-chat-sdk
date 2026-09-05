# @uraiai/chat-widget-react

React chat for Urai (React 18 / 19). Two components ship from this package:

| | Import | Use it for |
|---|---|---|
| **`<UraiChat>`** | `@uraiai/chat-widget-react/ui` | A chat **inside your product**, built from native React components you can replace one by one. Inline: it fills the box you give it. |
| **`<UraiChatWidget>`** | `@uraiai/chat-widget-react` | The original floating launcher + popup panel, sealed off in a shadow root. Unchanged, still supported. |

They are separate entry points, so using one costs you nothing for the
other. Pick `/ui` for new work.

```bash
npm install @uraiai/chat-widget-react
```

> **Allow your origin first.** Every widget request — including the SSE
> stream — is checked against the widget's allowed origins. Add your app's
> origin in the Urai dashboard, or everything 403s. This is the most common
> setup failure by a wide margin.

---

# `<UraiChat>` — the modular chat

```tsx
"use client";
import { UraiChat } from "@uraiai/chat-widget-react/ui";

export function Support() {
  return (
    <div className="h-dvh">
      <UraiChat widgetToken="<widget token>" userId="<stable visitor id>" />
    </div>
  );
}
```

That is the whole drop-in. It renders a header, transcript, composer and
footer, streams replies, handles attachments and conversation history, and
follows your app's light/dark mode.

Everything it renders is an ordinary React component in your own tree — no
iframe, no shadow root, nothing sealed off. You can inspect it in DevTools,
your stylesheet and Tailwind classes reach it, and any part of it can be
swapped for a component of your own.

## Styling, in increasing order of control

**1. Do nothing.** The stylesheet is injected automatically on first
mount. If you would rather import it (a stricter CSP, or you want it in
your bundle), do that instead and the injector stands down — a computed
custom property tells it the CSS already arrived:

```tsx
import "@uraiai/chat-widget-react/styles.css";
```

**2. Theme tokens.** The server-side widget designer's theme applies as a
default layer; anything you pass in code wins over it.

```tsx
<UraiChat theme={{ primaryColor: "#0f766e", radius: "20px" }} … />
```

**3. Your own CSS.** Every part carries a stable `data-urai-part`
attribute, and stateful parts carry `data-state`. That attribute — not
the class name — is the styling contract, so internal classes can change
without breaking you.

```css
[data-urai-part="composer"]           { border-top: 2px solid #eee; }
[data-urai-part="assistant-message"]  { max-width: 70ch; }
[data-urai-part="thread-item"][data-state="active"] { background: #eef; }
```

Rules are scoped as `.urai-root :where(.urai-part)` — one class of
specificity. That clears a host's global `button {}` or `p {}` reset,
which would otherwise repaint the chat's own controls, while still losing
to a single class of yours. The stylesheet is prepended to `<head>`, so a
Tailwind utility wins the tie without `!important`.

**4. `classNames`.** Appended to the defaults, never replacing them.
Stateful parts take a function.

```tsx
<UraiChat
  classNames={{
    composer: "rounded-2xl shadow-sm",
    threadItem: ({ isActive }) => (isActive ? "bg-brand-50" : undefined),
  }}
/>
```

Keys: `root`, `header`, `brandLogo`, `title`, `threadTrigger`,
`threadSwitcher`, `threadSearchInput`, `newConversationButton`,
`threadGroupLabel`, `threadItem`, `threadListEmpty`, `viewport`,
`messageList`, `message`, `userMessage`, `assistantMessage`,
`errorMessage`, `markdown`, `reasoning`, `reasoningTrigger`,
`reasoningBody`, `toolActivity`, `thinkingIndicator`,
`scrollToBottomButton`, `emptyState`, `suggestedQuestions`,
`suggestedQuestion`, `attachmentList`, `imageAttachment`,
`fileAttachment`, `composer`, `composerInput`, `sendButton`,
`stopButton`, `attachButton`, `pendingAttachmentList`,
`pendingAttachment`, `footer`.

**5. `unstyled`.** Drops every default class in one go, keeping the
`data-urai-part` hooks and the behaviour. Bring your own CSS.

```tsx
<UraiChat unstyled classNames={{ root: "flex flex-col h-full", … }} />
```

## Replacing parts

`components` swaps any part for your own. Every default is exported, so
*wrapping* one is a one-liner — spread the props and the default keeps
working, because each default takes only its own slot props and reads
everything else from hooks.

```tsx
import { UraiChat, DefaultHeader } from "@uraiai/chat-widget-react/ui";

<UraiChat
  components={{
    // wrap
    Header: (p) => (
      <div className="border-b-2 border-brand">
        <DefaultHeader {...p} title="Acme Support" />
      </div>
    ),
    // replace
    SendButton: ({ buttonProps, isStreaming }) => (
      <MyButton {...buttonProps}>{isStreaming ? <Spinner /> : "Send"}</MyButton>
    ),
    EmptyState: () => <MyWelcomeScreen />,
  }}
/>;
```

Composite slots receive their children **pre-rendered** as `ReactNode`
(`content`, `attachments`, `input`, `sendButton`, …), so restyling a
wrapper never means reimplementing markdown. Props getters
(`buttonProps`, `itemProps`, `formProps`) carry the ARIA attributes and
handlers — spread them and your replacement stays accessible.

Slot names: `Header`, `UserMessage`, `AssistantMessage`, `ErrorMessage`,
`StreamingMessage`, `Markdown`, `Reasoning`, `ToolActivity`,
`ToolCallCard`, `ThinkingIndicator`, `ScrollToBottomButton`, `EmptyState`,
`SuggestedQuestions`, `AttachmentList`, `Composer`, `ComposerInput`,
`SendButton`, `AttachButton`, `PendingAttachment`, `ThreadSwitcher`,
`ThreadItem`, `Footer`, `Fallback`.

`icons` takes components, so `lucide-react` drops straight in:

```tsx
import { Send, Paperclip } from "lucide-react";
<UraiChat icons={{ send: Send, paperclip: Paperclip }} />;
```

Keys: `chevron`, `plus`, `search`, `paperclip`, `file`, `download`,
`remove`, `send`, `stop`, `scrollDown`.

## Text

`labels` holds every user-visible string. Resolution is
`defaults < server behavior/layout strings < your labels prop`, so the
dashboard stays useful for operators while code stays authoritative.

```tsx
<UraiChat
  labels={{
    placeholder: "Ask the Acme team…",
    thinking: "Thinking it through",
    relativeTime: (iso) => myFormatter(iso),
  }}
/>
```

Notable keys: `brandName`, `placeholder`, `send`, `composerHint`,
`thinking`, `thoughts`, `newConversation`, `searchConversations`,
`noThreads`, `attachFiles`, `messageRolePrefix`, `assistantResponding`,
`toolNames` (merged over the built-ins), `relativeTime`. The full list is
on `DEFAULT_LABELS`.

## Rebuilding the shell

When slots are not enough, drop to `Chat.Root` and compose it yourself.
Every part is context-driven with no required props.

```tsx
import { Chat } from "@uraiai/chat-widget-react/ui";

<Chat.Root widgetToken={token} userId={userId}>
  <div className="grid grid-cols-[280px_1fr] h-dvh">
    <aside className="border-r">
      <Chat.ThreadSwitcher />
    </aside>
    <main className="flex flex-col min-h-0">
      <MyOwnHeader />
      <Chat.Viewport className="flex-1">
        <Chat.EmptyState />
        <Chat.MessageList />
      </Chat.Viewport>
      <Chat.Composer />
    </main>
  </div>
  <Chat.LiveRegion />
</Chat.Root>;
```

Parts: `Root`, `Header`, `ThreadTrigger`, `ThreadSwitcher`, `Viewport`,
`MessageList`, `Message`, `StreamingMessage`, `Markdown`, `EmptyState`,
`Composer`, `Footer`, `LiveRegion`. Each is also exported flat
(`ChatRoot`, `ChatComposer`, …); the `Chat` namespace reads better but
defeats tree-shaking, so reach for the flat names if bundle size matters.

## Hooks

The same contract the default components consume, so anything they can do,
you can do.

| Hook | Gives you |
|---|---|
| `useChatStatus()` | `status`, `isStreaming`, `canSend`, `isEmpty`, `threadId` |
| `useMessages()` | the settled transcript (stable across streamed tokens) |
| `useStream()` | the in-flight turn, or `null` |
| `useComposer()` | value, `submit()`, and `getFormProps`/`getInputProps`/`getSendButtonProps` |
| `useThreads()` | grouped + filtered history, `select`, `create`, `setQuery` |
| `useAttachments()` | pending uploads, `add`, `remove`, `getInputProps`, `getTriggerProps` |
| `useChatActions()` | every action; never re-renders |
| `useChatSelector(fn, eq?)` | any slice of state, with a bail-out comparator |
| `useStickToBottom()` | follow-the-bottom without fighting the reader |
| `useLabels()`, `useIcons()`, `useChatConfig()` | resolved presentation |

```tsx
function CharacterCount() {
  const { value } = useComposer();
  return <span>{value.length} / 2000</span>;
}
```

## Passing context (vars)

`vars` is a JSON object stored on the thread and handed to your assistant
— plan, locale, current route, account id. It reaches the server two ways:
in the body of the thread-create call, and as a PATCH to an existing
thread.

```tsx
const location = useLocation();

<UraiChat
  widgetToken={token}
  userId="user_42"
  vars={{ plan: "pro", page: location.pathname }}
/>;
```

Changing the prop updates the live thread and carries into the next one.
The comparison is by value, so an inline object literal is fine — it does
not become a request per render.

Imperatively, through the ref:

```tsx
const chat = useRef<UraiChatHandle>(null);

chat.current?.setVars({ plan: "pro" });                  // update active thread
chat.current?.setVars(null);                             // clear
chat.current?.startConversation({ topic: "billing" });   // seed a fresh thread
chat.current?.setUser({ id: "user_43", vars: { … } });   // switch visitor
chat.current?.sendMessage("Where is my order?");
```

`startConversation` is lazy: it buffers the vars and issues no request
until the visitor actually sends something, so calling it on every
navigation is free.

The handle also exposes `newConversation`, `selectThread`, `configure`,
`on`, `getState` and `ready`.

## Props

Required: `widgetToken`, `userId`.

| Prop | |
|---|---|
| `baseUrl` | Defaults to `https://chat.app.urai.dev`; set it for self-hosted. |
| `vars` | Thread context (above). |
| `theme`, `layout`, `behavior` | Config overrides; applied live, above the server's. |
| `fetchServerConfig` | `false` skips `GET /config` entirely. |
| `components`, `classNames`, `labels`, `icons`, `unstyled` | Presentation. |
| `colorScheme` | `"host"` (default), `"light"`, `"dark"`, `"system"`. |
| `className`, `style` | On the root element. |
| `onReady`, `onUserMessage`, `onAssistantReply`, `onCommand`, `onError` | Events. |

`onCommand` fires when a uraiJS tool calls
`meta.urai.sendCommand(meta.vars.thread_id, payload)` during a turn — use
it for tool-driven UI signals such as navigation. The payload is the tool
author's JSON, verbatim: treat it as untrusted and validate its shape
before acting.

Changing `widgetToken` or `baseUrl` rebuilds the client. `userId` and
`vars` apply live, without tearing the chat down.

## Light and dark

`colorScheme` defaults to `"host"`: the chat inherits your app's
`color-scheme`, because a chat inside someone's product should follow that
product. If your app toggles dark mode, make sure it declares it —

```css
.dark { color-scheme: dark; }
:root:not(.dark) { color-scheme: light; }
```

— and the chat follows with no JS and no prop. Most `next-themes` setups
already emit this. Pin it with `colorScheme="dark"`, or let the OS decide
with `"system"`.

Colours come from a seed/semantic token split resolved through
`light-dark()`, so a customized brand colour gets a derived dark palette
rather than being ignored, and foregrounds that fail WCAG AA against their
own fill are corrected automatically.

## Rendering: markdown, SVG and tool calls

Assistant messages render through `react-markdown` with GFM, sanitized
with `rehype-sanitize`.

Charts render too. The agent writes SVG either as a ```svg fence or as
bare `<svg>` in the prose; both take the same path, and the sanitizer
allows a shape-and-paint subset. Deliberately excluded, because this runs
on your page: `script`, SMIL animation, `foreignObject`, the `style`
element, and the remote-reference elements `image`, `feImage` and `use`.
No `href` is allowed on any SVG element. Anything unlisted is dropped, so
a gap means a chart that draws incompletely, never one that draws
dangerously.

While a turn streams, only the text after the last blank line is
re-parsed; the settled prefix is memoized. Combined with per-frame
coalescing in the store, a long reply costs a bounded amount of work per
frame instead of re-parsing the whole message per token.

`<urai-tool-call>` markers become a real `ToolCallCard` component you can
replace. It shows the server's summary and nothing more: arguments and
output stay on the authenticated channel the widget does not subscribe to,
which is the correct privacy posture for an embedded chat.

## Accessibility

The defaults ship with: the transcript as `role="log"` with
`aria-live="off"` (a polite region over streaming markdown re-announces on
every token and is unusable) and a separate visually-hidden announcer that
speaks once per turn; a real `<form>` composer so Enter works natively and
mobile keyboards show "Go"; an `isComposing` guard so Enter does not send
mid-IME-composition; a composer that is never disabled while sending, so
focus is not stolen and you can type ahead; `role="alert"` on errors;
`aria-expanded`/`aria-controls` on the reasoning disclosure; and a visible
focus ring that survives a host's `outline: none` reset.

## Server rendering

The chat is **client-only by construction**. Widget auth is
`(token, Origin ∈ allowed_origins)` and a server-side fetch carries no
`Origin`, so there is no useful server render to have. `"use client"` is
not enough on its own — Next still prerenders client components — so the
tree waits for mount behind a sized fallback (replaceable via the
`Fallback` slot). You do not need `next/dynamic({ ssr: false })`.

---

# `<UraiChatWidget>` — the floating widget

Unchanged, and still the right choice for a launcher bubble on a marketing
site, or when you want the shadow root's isolation from host CSS.

```tsx
import { useRef } from "react";
import { UraiChatWidget, type WidgetController } from "@uraiai/chat-widget-react";

const widget = useRef<WidgetController>(null);

<button onClick={() => widget.current?.open()}>Chat with us</button>
<UraiChatWidget
  ref={widget}
  widgetToken="<widget token>"
  userId="<stable visitor id>"
  theme={{ primaryColor: "#0ea5e9" }}
  onAssistantReply={(content) => console.log(content)}
/>;
```

Required: `widgetToken`, `userId`. Optional: `baseUrl`, `vars`, `theme`,
`layout`, `behavior`, `mode` (`"floating"` default | `"inline"`),
`className`/`style` (inline container only), and `onReady`, `onOpened`,
`onClosed`, `onUserMessage`, `onAssistantReply`, `onCommand`, `onError`.

| Prop | Effect |
|---|---|
| `theme`, `layout`, `behavior` | Applied live via `configure()` (deep-compared). Structural changes (mode/position/header/welcome/suggested) rebuild the panel and clear the visible conversation. |
| `userId` | `setUser()` — resets the conversation for the new visitor. |
| `vars` | `setVars()` — updates the current/next thread's context. |
| `widgetToken`, `baseUrl`, `mode` | Destroys and recreates the widget. |

The `ref` exposes the full `WidgetController` (`open`, `close`,
`sendMessage`, `startConversation`, `on`, …). Mount/unmount is idempotent
and StrictMode-safe. In inline mode it renders a `div` the panel fills —
give it a height.

---

## Which one?

Use **`<UraiChat>`** when the chat lives inside your product and should
look like it: your header, your tokens, your dark mode, parts you can
replace. It is native React, so it behaves like the rest of your app.

Use **`<UraiChatWidget>`** when you want a floating launcher, or when the
page is out of your control and you need the shadow root to keep its CSS
from leaking in.

There is no deprecation and no migration deadline. See
[`examples/react-ui-demo`](../../examples/react-ui-demo) for a harness
that exercises vars, identity switching, the three styling levels and host
dark mode against a live service.
