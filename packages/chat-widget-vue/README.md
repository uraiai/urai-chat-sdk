# @uraiai/chat-widget-vue

Vue 3 chat for Urai (Vue 3.3+). Two components ship from this package:

| | Import | Use it for |
|---|---|---|
| **`<UraiChat>`** | `@uraiai/chat-widget-vue/ui` | A chat **inside your product**, built from native Vue components you can replace one by one. Inline: it fills the box you give it. |
| **`<UraiChatWidget>`** | `@uraiai/chat-widget-vue` | The floating launcher + popup panel, sealed off in a shadow root. Unchanged, still supported. |

They are separate entry points, so using one costs you nothing for the
other. Pick `/ui` for new work. It is a port of the React package's `/ui`:
the same parts, slot names, class-name keys, `data-urai-part` hooks, CSS
variables and stylesheet, so the [React README](../chat-widget-react) and
this one describe the same chat.

```bash
npm install @uraiai/chat-widget-vue
```

> **Allow your origin first.** Every widget request — including the SSE
> stream — is checked against the widget's allowed origins. Add your app's
> origin in the Urai dashboard, or everything 403s. This is the most common
> setup failure by a wide margin.

---

# `<UraiChat>` — the modular chat

```vue
<script setup lang="ts">
import { UraiChat } from "@uraiai/chat-widget-vue/ui";
</script>

<template>
  <div style="height: 100dvh">
    <UraiChat widget-token="<widget token>" user-id="<stable visitor id>" />
  </div>
</template>
```

That is the whole drop-in. It renders a header, transcript, composer and
footer, streams replies, handles attachments and conversation history, and
follows your app's light/dark mode.

Everything it renders is an ordinary Vue component in your own tree — no
iframe, no shadow root. You can inspect it in Vue DevTools, your stylesheet
and Tailwind classes reach it, and any part of it can be swapped for a
component of your own.

## Styling, in increasing order of control

**1. Do nothing.** The stylesheet is injected automatically on first mount.
If you would rather import it (a stricter CSP, or you want it in your
bundle), do that instead and the injector stands down:

```ts
import "@uraiai/chat-widget-vue/styles.css";
```

It is the same stylesheet the React package ships (both come from
`@uraiai/chat-widget-core/theme`), so a page with both views injects it once.

**2. Theme tokens.** The server-side widget designer's theme applies as a
default layer; anything you pass in code wins over it.

```vue
<UraiChat :theme="{ primaryColor: '#0f766e', radius: '20px' }" … />
```

**3. Your own CSS.** Every part carries a stable `data-urai-part` attribute,
and stateful parts carry `data-state`. That attribute — not the class name —
is the styling contract.

```css
[data-urai-part="composer"]           { border-top: 2px solid #eee; }
[data-urai-part="assistant-message"]  { max-width: 70ch; }
[data-urai-part="thread-item"][data-state="active"] { background: #eef; }
```

Rules are scoped as `.urai-root :where(.urai-part)` — one class of
specificity. That clears a host's global `button {}` or `p {}` reset while
still losing to a single class of yours; the stylesheet is prepended to
`<head>`, so a Tailwind utility wins the tie without `!important`.

**4. `classNames`.** Appended to the defaults, never replacing them.
Stateful parts take a function.

```vue
<UraiChat
  :class-names="{
    composer: 'rounded-2xl shadow-sm',
    threadItem: ({ isActive }) => (isActive ? 'bg-brand-50' : undefined),
  }"
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
`fileAttachment`, `fileList`, `componentList`, `delegateList`, `delegate`,
`archiveButton`, `composer`, `composerInput`, `sendButton`, `stopButton`,
`attachButton`, `pendingAttachmentList`, `pendingAttachment`, `footer`.

A `class` and `style` on `<UraiChat>` land on the root element.

**5. `unstyled`.** Drops every default class in one go, keeping the
`data-urai-part` hooks and the behaviour. Bring your own CSS.

```vue
<UraiChat unstyled :class-names="{ root: 'flex flex-col h-full', … }" />
```

## Replacing parts

Two ways, with the same slot names and the same slot props.

**Named scoped slots** — the Vue-native way. The slot receives the part's
props:

```vue
<UraiChat widget-token="…" user-id="…">
  <template #SendButton="{ buttonProps, isStreaming }">
    <MyButton v-bind="buttonProps">{{ isStreaming ? "…" : "Send" }}</MyButton>
  </template>

  <template #EmptyState>
    <MyWelcomeScreen />
  </template>
</UraiChat>
```

**The `components` prop** — a map of slot name → component, handy when the
override is defined in script or shared. Every default is exported, so
*wrapping* one is a one-liner: each default takes only its own slot props and
reads everything else from composables, so passing the props through keeps
it working.

```ts
import { h } from "vue";
import { DefaultHeader, type HeaderSlotProps } from "@uraiai/chat-widget-vue/ui";

const components = {
  // wrap
  Header: (p: HeaderSlotProps) =>
    h("div", { class: "border-b-2 border-brand" }, [h(DefaultHeader, { ...p, title: "Acme Support" })]),
  // replace
  Footer: () => h("small", "Powered by Acme"),
};
// <UraiChat :components="components" … />
```

A named slot wins over the same key in `components`.

**Pre-rendered children are VNodes.** Composite slots receive their
children already rendered (`content`, `attachments`, `input`, `sendButton`,
`threadTrigger`, `list`, …) as a `VNode`, or `null` when absent — where the
React view passes a `ReactNode`. Restyling a wrapper never means
reimplementing markdown. Render one with `<component :is>` in a template, or
put it straight into an `h()` children array:

```vue
<template #AssistantMessage="{ content, displayComponents, files }">
  <li class="my-bubble">
    <component :is="content" />
    <component :is="displayComponents" />
    <component :is="files" />
  </li>
</template>
```

Props objects (`buttonProps`, `itemProps`, `formProps`, `triggerProps`) carry
the ARIA attributes and listeners in Vue's `onClick` form — bind them with
`v-bind` and your replacement stays accessible.

A replacement written as a component should declare the props it reads (or
set `inheritAttrs: false`): slot props it does not declare fall through to
its root element as attributes, and `onClick`/`onPick`/`onRemove`/`onToggle`
as listeners.

Slot names: `Header`, `ArchiveButton`, `UserMessage`, `AssistantMessage`,
`ErrorMessage`, `StreamingMessage`, `Markdown`, `Reasoning`, `ToolActivity`,
`ToolCallCard`, `ThinkingIndicator`, `ScrollToBottomButton`, `EmptyState`,
`SuggestedQuestions`, `AttachmentList`, `FileList`, `ComponentList`,
`DelegateList`, `Composer`, `ComposerInput`, `SendButton`, `AttachButton`,
`PendingAttachment`, `ThreadSwitcher`, `ThreadItem`, `Footer`, `Fallback`.

`icons` takes components, so `lucide-vue-next` drops straight in:

```vue
<script setup lang="ts">
import { Send, Paperclip } from "lucide-vue-next";
</script>
<template><UraiChat :icons="{ send: Send, paperclip: Paperclip }" … /></template>
```

Keys: `chevron`, `plus`, `search`, `paperclip`, `file`, `download`,
`remove`, `send`, `stop`, `scrollDown`.

## Text

`labels` holds every user-visible string. Resolution is
`defaults < server behavior/layout strings < your labels prop`.

```vue
<UraiChat
  :labels="{
    placeholder: 'Ask the Acme team…',
    thinking: 'Thinking it through',
    relativeTime: (iso) => myFormatter(iso),
  }"
/>
```

Notable keys: `brandName`, `placeholder`, `send`, `composerHint`,
`thinking`, `thoughts`, `newConversation`, `searchConversations`,
`noThreads`, `attachFiles`, `messageRolePrefix`, `assistantResponding`,
`toolNames` (merged over the built-ins), `relativeTime`. The full list is on
`DEFAULT_LABELS`.

## Rebuilding the shell

When slots are not enough, drop to `ChatRoot` and compose it yourself. Every
part reads its state from `ChatRoot` (provide/inject) and takes no required
props.

```vue
<script setup lang="ts">
import { Chat } from "@uraiai/chat-widget-vue/ui";
</script>

<template>
  <Chat.Root :widget-token="token" :user-id="userId">
    <div class="grid grid-cols-[280px_1fr] h-dvh">
      <aside class="border-r"><Chat.ThreadSwitcher /></aside>
      <main class="flex flex-col min-h-0">
        <MyOwnHeader />
        <Chat.Viewport class="flex-1">
          <Chat.EmptyState />
          <Chat.MessageList />
        </Chat.Viewport>
        <Chat.Composer />
      </main>
    </div>
    <Chat.LiveRegion />
  </Chat.Root>
</template>
```

Parts: `Root`, `Header`, `ThreadTrigger`, `ArchiveButton`, `ThreadSwitcher`,
`Viewport`, `MessageList`, `Message`, `StreamingMessage`, `Markdown`,
`EmptyState`, `Composer`, `Footer`, `LiveRegion`. Each is also exported flat
(`ChatRoot`, `ChatComposer`, `ChatViewport`, …); the `Chat` namespace reads
better but defeats tree-shaking, so reach for the flat names if bundle size
matters.

## Composables

The same contract the default components consume, under the React hooks'
names. Call them in `setup` of a component inside `ChatRoot`/`UraiChat`.

| Composable | Gives you |
|---|---|
| `useChatStatus()` | ref of `{ status, isStreaming, canSend, isEmpty, threadId }` |
| `useThreadId()` | ref of the conversation's thread id, or `null` before the first message |
| `useThread()` | ref of `{ threadId, summary, load, readOnly }` |
| `useMessages()` | ref of the settled transcript (stable across streamed tokens) |
| `useMessage(id?)` | ref of one message (by id, or the enclosing `Chat.Message`) |
| `useStream()` | ref of the in-flight turn, or `null` |
| `useComposer()` | `value`, `submit()`, and `getFormProps`/`getInputProps`/`getSendButtonProps` |
| `useThreads()` | grouped + filtered history, `select`, `create`, `setQuery` |
| `useAttachments()` | pending uploads, `add`, `remove`, `getInputProps`, `getTriggerProps` |
| `useThreadArchive()` | whether the zip is on offer, `isDownloading`, `download`, `buttonProps` |
| `useChatActions()` | every action; never changes |
| `useChatSelector(fn, eq?)` | ref of any slice of state, written only when `eq` says it changed |
| `useStickToBottom()` | follow-the-bottom without fighting the reader (function refs + `isPinned`) |
| `useLabels()`, `useIcons()`, `useChatConfig()`, `usePresentation()`, `useChatStore()` | resolved presentation and the store |

Single values come back as read-only refs. `useComposer`, `useAttachments`,
`useThreads` and `useThreadArchive` return an object whose state properties
are getters: read them in a template, render function or `computed` and they
are tracked — destructuring them in `setup` takes a snapshot.

```vue
<script setup lang="ts">
import { useComposer } from "@uraiai/chat-widget-vue/ui";
const composer = useComposer();
</script>
<template><span>{{ composer.value.length }} / 2000</span></template>
```

## Passing context (vars)

`vars` is a JSON object stored on the thread and handed to your assistant —
plan, locale, current route, account id. It reaches the server in the body
of the thread-create call, and as a PATCH to an existing thread.

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const vars = computed(() => ({ plan: "pro", page: route.path }));
</script>

<template>
  <UraiChat :widget-token="token" user-id="user_42" :vars="vars" />
</template>
```

Changing the prop updates the live thread and carries into the next one. The
comparison is by value, so an inline object literal is fine — it does not
become a request per render. `collections` works the same way.

Imperatively, through a template ref — it is a `UraiChatHandle`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { UraiChat, type UraiChatHandle } from "@uraiai/chat-widget-vue/ui";
const chat = ref<UraiChatHandle | null>(null);

chat.value?.setVars({ plan: "pro" });                  // update active thread
chat.value?.setVars(null);                             // clear
chat.value?.setCollections(["9f1c…"]);                 // scope knowledge
chat.value?.startConversation({ vars: { topic: "billing" }, collections: ["9f1c…"] });
chat.value?.setUser({ id: "user_43", vars: { … } });   // switch visitor
chat.value?.sendMessage("Where is my order?");
</script>
<template><UraiChat ref="chat" … /></template>
```

`startConversation` is lazy: it buffers the vars and issues no request until
the visitor actually sends something.

The handle also exposes `newConversation`, `selectThread`, `openThread`,
`getThreadId`, `getThreadSummary`, `configure`, `on`, `getState` and `ready`.

## Props and events

Required: `widgetToken`, `userId`.

| Prop | |
|---|---|
| `baseUrl` | Defaults to `https://chat.app.urai.dev`; set it for self-hosted. |
| `vars`, `collections` | Thread context and knowledge scope (above); live, compared by value. |
| `threadId` | Open this thread instead of the visitor's last one; live (below). |
| `readOnly` | Transcript only; changing it rebuilds the client (below). |
| `theme`, `layout`, `behavior` | Config overrides; applied live, above the server's. |
| `fetchServerConfig` | `false` skips `GET /config` entirely. |
| `components`, `classNames`, `labels`, `icons`, `unstyled` | Presentation. |
| `displayComponents` | Rich components tools can show (below). |
| `colorScheme` | `"host"` (default), `"light"`, `"dark"`, `"system"`. |
| `disableStyleInjection` | You import `styles.css` yourself. |

Events: `@ready`, `@user-message` `(content)`, `@assistant-reply` `(content)`,
`@command` `(payload)`, `@error` `(message)`, `@thread-change`
`(threadId, { previousThreadId, reason })`.

`@command` fires when a uraiJS tool calls
`meta.urai.sendCommand(meta.vars.thread_id, payload)` during a turn. The
payload is the tool author's JSON, verbatim: treat it as untrusted and
validate its shape before acting.

Changing `widgetToken`, `baseUrl` or `readOnly` rebuilds the client.
`userId`, `vars`, `collections`, `threadId` and `theme`/`layout`/`behavior`
apply live, without tearing the chat down.

## Past conversations

Save thread ids from `@thread-change`, then show one with `thread-id` and
`read-only`:

```vue
<UraiChat
  :widget-token="token"
  :user-id="user.id"
  @thread-change="(id, { reason }) => reason === 'created' && saveConversation(user.id, id)"
/>

<!-- Elsewhere — a history page -->
<UraiChat :widget-token="token" :user-id="user.id" :thread-id="selectedId" read-only />
```

`read-only` drops the composer, the thread switcher and the welcome, names
the thread in the header, and refuses every write in the store itself — so a
custom tree that still renders `<Chat.Composer />`, or a display component
calling `sendMessage`, cannot post into the thread. Files and "Download all
files" still work, and the visitor's saved thread is left alone. A thread
that is not this visitor's shows "This conversation is unavailable."
(`labels.conversationUnavailable`) and emits `error`.

`chat.value.getThreadSummary(id)` returns a thread's `title` and timestamps,
and `useThread()` gives a custom header the open thread's `summary`, its
`load` state and `readOnly`. `userId` must be the thread's owner: see
"Saving and showing past conversations" in `@uraiai/chat-widget-core`.

## Rich components from tools

A tool can put UI in the reply by naming a component and passing props:

```ts
// In a uraiJS tool
await meta.urai.sendCommand(meta.vars.thread_id, {
  command: "displayComponent",
  component: "OrderCard",
  props: { orderId: "o-1", status: "shipped" },
});
```

Register Vue components under those names. Each one receives three props:
`props` — the tool's props as **one** object, never spread, so a tool cannot
set `key`, `ref`, `class`, `style` or a listener on your component —
`component` (the name), and `sendMessage` to reply as the visitor. Declare
them with `displayComponentPropsOptions` so they do not fall through to your
root element:

```vue
<!-- OrderCard.vue -->
<script setup lang="ts">
import { displayComponentPropsOptions } from "@uraiai/chat-widget-vue/ui";
const p = defineProps(displayComponentPropsOptions);
// `props` is tool output — validate it.
const orderId = typeof p.props.orderId === "string" ? p.props.orderId : null;
</script>

<template>
  <div v-if="orderId" class="order-card">
    Order {{ orderId }}
    <button @click="sendMessage(`Cancel order ${orderId}`)">Cancel</button>
  </div>
</template>
```

```vue
<UraiChat widget-token="…" user-id="…" :display-components="{ OrderCard }" />
```

(`DisplayComponentProps<P>` is the matching TypeScript type, for render
functions and functional components.)

Components render inside the assistant bubble, below the text and above any
files. They show live while the reply streams and again from history (the
server saves them on the message). Names are looked up as own properties
only — a tool naming `constructor` finds nothing — and a name with no entry
is skipped with a one-time console warning. Each component sits inside an
error boundary (`onErrorCaptured`): one that throws in setup, render or a
hook is logged and disappears without taking the conversation with it.

`component` must start with a letter and contain only letters, digits and
`_ . : -` (at most 100 characters); `props`, when given, must be an object.
Anything else is not drawn. The payload is capped at 64 KB like every
command, and it still reaches `@command` either way.

To restyle or reorder them, replace the `ComponentList` slot (wrap
`DefaultComponentList`, or render `DisplayComponent` per item). A replacement
`AssistantMessage` or `StreamingMessage` must render its `displayComponents`
child or no components are shown. The class-name key is `componentList` and
the part is `[data-urai-part="component-list"]`.

The same `OrderCard.vue` works in the floating widget through
`vueComponentRenderer` — see below.

## Light and dark

`colorScheme` defaults to `"host"`: the chat inherits your app's
`color-scheme`. If your app toggles dark mode, make sure it declares it —

```css
.dark { color-scheme: dark; }
:root:not(.dark) { color-scheme: light; }
```

— and the chat follows with no JS and no prop. Pin it with
`color-scheme="dark"`, or let the OS decide with `"system"`.

## Rendering: markdown, SVG, math, files and tool calls

Assistant messages render through the **core** markdown pipeline — the same
one the floating widget uses: `marked` (GFM, line breaks), sanitized with
DOMPurify, and rendered with `innerHTML` only after sanitizing. This differs
from the React view, which uses `react-markdown`; the output is equivalent
but not byte-identical (for one, single newlines become `<br>` here).

Charts render too: the agent writes SVG either as a ```svg fence or as bare
`<svg>` in the prose, and both are sanitized with DOMPurify's SVG profile —
no `script`, no event handlers, no `foreignObject`, no `javascript:` links.
Math (`$…$` the way models write it, `$$…$$`, `\(…\)`, `\[…\]`) is typeset by
KaTeX as MathML, so the page needs no KaTeX stylesheet or fonts; prices like
"$5 and $10" stay prose. `js-action` code fences are hidden unless
`behavior.dev` is on.

While a turn streams, only the text after the last blank line outside a code
fence is re-parsed (`splitStableTail`); the settled prefix is a separate
block Vue does not re-render. Combined with per-frame coalescing in the
store, a long reply costs a bounded amount of work per frame.

Files the assistant writes to the conversation's workspace — a chart, a CSV,
a report — show on the turn that made them, through the `FileList` slot:
images inline, anything else as a download link with its size. Bytes are
fetched through the store (`useChatActions().fetchFileBlob(path)`) with the
visitor header and shown via object URLs. An SVG **downloads** rather than
opening in a tab, because an object URL has your page's origin
(`isScriptableFile` from `@uraiai/chat-widget-core/headless`). Once a file
has been shown, the header offers **Download all files** (`ArchiveButton`
slot, `useThreadArchive()`).

`<urai-tool-call>` markers become the `ToolCallCard` slot — hidden by
default; turn them on with `:behavior="{ showToolCalls: true }"`
(`behavior.dev` implies it). They are cut out of the text before the
markdown pass and rendered between the blocks as real components. The live
`ToolActivity` row on a streaming bubble always shows.

## Accessibility

The defaults ship with: the transcript as `role="log"` with
`aria-live="off"` and a separate visually-hidden announcer
(`Chat.LiveRegion`) that speaks once per turn; a real `<form>` composer; an
`isComposing` guard so Enter does not send mid-IME-composition; a composer
that is never disabled while sending; `role="alert"` on errors;
`aria-expanded`/`aria-controls` on the reasoning disclosure; and a visible
focus ring that survives a host's `outline: none` reset.

## Server rendering

The chat is **client-only by construction**: widget auth is
`(token, Origin ∈ allowed_origins)` and a server-side fetch carries no
`Origin`. The client is created in `onMounted`, so under Nuxt or any SSR the
server output is only the sized fallback (`Fallback` slot) and nothing is
fetched. No `<ClientOnly>` needed.

---

# `<UraiChatWidget>` — the floating widget

```vue
<script setup lang="ts">
import { ref } from "vue";
import { UraiChatWidget, type WidgetController } from "@uraiai/chat-widget-vue";

const widget = ref<{ controller: WidgetController | null } | null>(null);
</script>

<template>
  <button @click="widget?.controller?.open()">Chat with us</button>
  <UraiChatWidget
    ref="widget"
    widget-token="<widget token>"
    user-id="<stable visitor id>"
    :theme="{ primaryColor: '#0ea5e9' }"
    @assistant-reply="(content) => console.log(content)"
  />
</template>
```

Unchanged, and still the right choice for a launcher bubble on a marketing
site, or when you want the shadow root's isolation from host CSS.

## Props & events

Required props: `widgetToken`, `userId`.
Optional: `baseUrl` (defaults to `https://chat.app.urai.dev`; set it for
self-hosted deployments), `vars`, `collections`, `theme`, `layout`, `behavior`, `displayComponents`, `mode`
(`"floating"` default | `"inline"`), `threadId`, `readOnly`.
Emits: `ready`, `opened`, `closed`, `user-message`, `assistant-reply`,
`command`, `thread-change`, `error`.

`@thread-change` gives `(threadId, { previousThreadId, reason })` whenever the
conversation moves to another thread. Save `threadId` when `reason` is
`"created"`, then show a saved conversation with `thread-id` and `read-only`:

```vue
<UraiChatWidget
  widget-token="…"
  :user-id="user.id"
  mode="inline"
  :thread-id="selectedThreadId"
  read-only
/>
```

`read-only` shows the transcript only (no composer or switcher) and writes
nothing. `user-id` must be the visitor who owns the thread. See "Saving and
showing past conversations" in `@uraiai/chat-widget-core` for the details,
including who should be allowed to view what.

`@command` fires when a uraiJS tool calls
`meta.urai.sendCommand(meta.vars.thread_id, payload)` during the turn —
use it to react to tool-driven UI signals (e.g. navigation). The payload
is the tool author's JSON, verbatim: treat it as untrusted and validate
its shape before acting. Delivered only while the turn's stream is open;
each open widget instance receives its own copy.

`displayComponents` maps component names to renderers, for UI a tool
asks to show with `sendCommand(thread_id, { command: "displayComponent",
component, props })`. Each renderer is
`(element, props, { component, sendMessage }) => cleanup?`, and `element` is in
your page's DOM, so your styles apply and you can mount a component into it.
Components render below the reply text, live and from history. It is read
when the widget is created. See "Displaying rich components" in
`@uraiai/chat-widget-core` for the full contract.

To use a **Vue component**, wrap it with `vueComponentRenderer`. It mounts the
component into `element` with the same props a `displayComponents` entry on
`<UraiChat>` gets — `{ props, component, sendMessage }`, the tool's props as
one object — and unmounts it when the message leaves the transcript. So one
`OrderCard.vue` works in both the floating widget and the modular chat.

```ts
import { getCurrentInstance } from "vue";
import { vueComponentRenderer, vueComponentRenderers } from "@uraiai/chat-widget-vue";
import OrderCard from "./OrderCard.vue";

// Each card is its own small app; install what it needs in `setup`.
const displayComponents = {
  OrderCard: vueComponentRenderer(OrderCard, { setup: (app) => app.use(i18n) }),
};

// Or render into your app's context — router, pinia, i18n, provides and
// global components all available — from inside a component's setup:
const appContext = getCurrentInstance()!.appContext;
const renderers = vueComponentRenderers({ OrderCard }, { appContext });
// <UraiChatWidget widget-token="…" user-id="…" :display-components="renderers" />
```

In inline mode the component renders a `div` and the chat panel fills it —
size it via the parent element.

## Prop changes: live vs. remount

| Prop | Effect |
|---|---|
| `theme`, `layout`, `behavior` | Applied live via `configure()` (deep-compared). Structural changes (mode/position/header/welcome/suggested) rebuild the panel and clear the visible conversation. |
| `userId` | `setUser()` — resets the conversation for the new visitor. |
| `vars` | `setVars()` — updates the current/next thread's context. |
| `collections` | `setCollections()` — knowledge collection **ids** scoping the conversation, on top of the assistant's own. |
| `threadId` | `openThread()` — opens the new thread in place. |
| `widgetToken`, `baseUrl`, `mode`, `readOnly` | Destroys and recreates the widget. |

The template ref exposes `controller` (a `WidgetController` with `open`,
`close`, `sendMessage`, `startConversation`, `openThread`, `getThreadId`,
`getThreadSummary`, `on`, …); it is `null` until mounted.

## Passing context (vars)

Vars are a JSON object stored on the thread and made available to your
assistant (plan, locale, current route, …). The idiomatic way is the `vars`
prop — changing it calls `setVars()` on the active thread (deep-compared,
so inline literals are fine):

```vue
<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const vars = computed(() => ({ plan: "pro", page: route.path }));
</script>

<template>
  <UraiChatWidget
    widget-token="<widget token>"
    user-id="user_42"
    :vars="vars"
  />
</template>
```

Or imperatively through the exposed controller:

```ts
widget.value?.controller?.setVars({ plan: "pro" });          // update active thread
widget.value?.controller?.setVars(null);                     // clear
widget.value?.controller?.setCollections(["9f1c…"]);         // scope knowledge
widget.value?.controller?.startConversation({                // seed a fresh thread
  vars: { topic: "billing" },
  collections: ["9f1c…"],
});
```

## Scoping knowledge (collections)

An assistant can have knowledge collections attached at definition time. The
`collections` prop lets the host add more for one conversation — the product
area the visitor is in, say. The two are **unioned**: the assistant's own
collections are a floor this can add to and never narrow.

Pass collection **ids**, not slugs. A widget token lives in your page source,
so the unguessable id is what keeps the rest of your organization's
collections out of reach; the server checks each id against the organization
that owns the widget and rejects the call if one doesn't belong (surfaced as
an `error` event, panel still usable).

Scope is per conversation — every turn of a thread inherits it.

```vue
<UraiChatWidget
  widget-token="<widget token>"
  user-id="user_42"
  :collections="[billingCollectionId]"
/>
```

---

## Which one?

Use **`<UraiChat>`** when the chat lives inside your product and should look
like it: your header, your tokens, your dark mode, parts you can replace. It
is native Vue, so it behaves like the rest of your app.

Use **`<UraiChatWidget>`** when you want a floating launcher, or when the
page is out of your control and you need the shadow root to keep its CSS
from leaking in.

See [`examples/vue-ui-demo`](../../examples/vue-ui-demo) for a harness that
exercises vars, identity switching, the three styling levels, display
components and host dark mode against a live service.
