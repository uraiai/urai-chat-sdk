# @uraiai/chat-widget-core

Framework-agnostic engine for the Urai chat widget. The React/Vue/Svelte
packages wrap this; use it directly for vanilla JS or other frameworks.

```bash
npm install @uraiai/chat-widget-core
```

```ts
import { createUraiChatWidget } from "@uraiai/chat-widget-core";

const widget = createUraiChatWidget({
  widgetToken: "<widget token>",
  userId: "<stable visitor id>",        // your app's identifier for the visitor
  vars: { plan: "pro" },                // optional context for the thread
  theme: { primaryColor: "#0ea5e9" },   // optional overrides
  // baseUrl defaults to https://chat.app.urai.dev — set it for self-hosted:
  // baseUrl: "https://chat.your-deployment.com",
});

widget.on("assistant-reply", (e) => console.log(e));
widget.open();

// later, e.g. on route teardown:
widget.destroy();
```

> **Allow your origin.** The server validates the `Origin` header of every
> widget request (including the SSE stream) against the widget's allowed
> origins. Add your app's origin in the Urai dashboard or all requests 403.

## Options

| Option | Required | Notes |
|---|---|---|
| `widgetToken` | yes | From the widget settings in the dashboard. |
| `userId` | yes | Stable, opaque visitor id. Threads are isolated per `(widget, userId)`. |
| `baseUrl` | no | Origin of your chat-service deployment. Defaults to `https://chat.app.urai.dev` (the hosted Urai deployment). |
| `vars` | no | Context object stored on the next created thread. |
| `collections` | no | Knowledge collection **ids** to scope the conversation to, on top of the assistant's own. See [Scoping knowledge](#scoping-knowledge-collections). |
| `threadId` | no | Open this thread instead of the visitor's last one. See [Saving and showing past conversations](#saving-and-showing-past-conversations). |
| `readOnly` | no | Transcript only: no composer, and nothing is written. Same section. |
| `theme` / `layout` / `behavior` | no | Override the server-configured appearance. Merge order: defaults → server config → these options → `configure()` calls. |
| `container` | no | An element to render into. Providing it switches the widget to inline mode; omitting it mounts a floating launcher on `document.body`. |
| `fetchServerConfig` | no | Set `false` to skip the `GET /config` call and use local options only. |

## Controller

`open() / close() / toggle()`, `sendMessage(content)`, `reset()`,
`setUser({ id, vars? })` (identity change resets the conversation),
`setVars(vars)`, `setCollections(ids)`, `startConversation({ vars?, collections? })`,
`openThread(id | null)`, `getThreadId()`, `getThreadSummary(id)`,
`configure(overrides)`,
`on(event, listener)` (returns an unsubscribe function), `ready`
(promise, resolves after config fetch + mount), `destroy()` (idempotent).

Events: `ready`, `opened`, `closed`, `user-message`, `assistant-reply`,
`command`, `thread-change`, `error`, `destroyed`.

Calls made before `ready` resolves are queued and replayed in order.

## Saving and showing past conversations

To list a visitor's conversations in your own app, save each thread id as it
is created, then open one later with `threadId` — usually `readOnly`, as a
transcript.

```ts
// 1. Save ids as conversations start
widget.on("thread-change", (e) => {
  if (e.type === "thread-change" && e.reason === "created") {
    void api.saveConversation({ userId: "user_42", threadId: e.threadId });
  }
});

// 2. Show one later, read-only, inside your page
const viewer = createUraiChatWidget({
  widgetToken: "<widget token>",
  userId: "user_42",          // the visitor who owns the thread
  threadId: saved.threadId,
  readOnly: true,
  container: document.querySelector("#transcript")!,
});
viewer.openThread(otherThreadId); // swap threads in place

// Titles for your list (the server names threads after the first reply)
const summary = await viewer.getThreadSummary(saved.threadId);
summary?.title; // also created_at, updated_at, last_message_at, last_message_preview
```

`thread-change` fires only when the id really changes, with a `reason`:

| `reason` | When |
|---|---|
| `created` | The first message of a new conversation created a thread. Fires **before** that message is sent, so the id is yours even if the send fails. |
| `restored` | The visitor's last thread was reloaded from `localStorage`. |
| `selected` | The visitor picked a thread in the switcher. |
| `opened` | You opened one (`threadId` / `openThread`). `threadId: null` means you cleared it, or it could not be opened — an `error` event says which. |
| `reset` | "New conversation" / `startConversation` / `reset()`. `threadId` is `null` until the next send. |
| `user-changed` | `setUser` switched visitor. `threadId` is `null`. |

**`readOnly`** shows the transcript and nothing else: no composer, no
switcher, no welcome message, and the header shows the thread's title. It is
enforced in the widget, not only hidden — `sendMessage`, `reset`,
`startConversation` and a component's `sendMessage` do nothing (with a
one-time console warning), `setVars` / `setCollections` never write to the
thread, and the visitor's saved thread in `localStorage` is left alone, so
viewing an old conversation never moves their live chat. Files, attachments
and "Download all files" still work. Without `readOnly`, `threadId` resumes
that conversation interactively.

**Whose thread?** Pass the `userId` of the visitor who **owns** the thread.
The server answers any other visitor's thread with a 404, shown as "This
conversation is unavailable." For a visitor looking at their own history
that is their own id; for, say, a support agent reading a customer's
conversation, it is the customer's. `userId` is an identity your app asserts
— the widget token and origin allowlist are what authorise the request — so
deciding who in your app may open whose conversations is your app's job.

## Passing context (vars)

Vars are a JSON object stored on the thread (`widget_vars`) and made
available to your assistant — use them for anything the conversation should
know about the visitor or the page (plan, locale, current route, …).

```ts
// 1. At creation — used for the first thread this visitor creates
const widget = createUraiChatWidget({
  widgetToken: "<widget token>",
  userId: "user_42",
  vars: { plan: "pro", page: "/pricing" },
});

// 2. Live — updates the active thread server-side, or is buffered for the
// next thread if none exists yet (e.g. before the first message)
widget.setVars({ plan: "pro", page: "/account" });
widget.setVars(null); // clear

// 3. Seeding a fresh conversation (thread is created lazily on the first
// message, so calling this on every route change is cheap)
widget.startConversation({ topic: "billing" });

// 4. Alongside an identity change
widget.setUser({ id: "user_43", vars: { plan: "enterprise" } });
```


## Scoping knowledge (collections)

An assistant can have knowledge collections attached to it at definition time.
`collections` lets the **host** add more for one conversation — the product
area a visitor is currently in, say — without touching the assistant.

The two are **unioned**: the assistant's own collections are a floor this can
add to and never narrow, so scoping a thread can widen what the assistant
reaches but never take away what its author gave it.

```ts
// 1. At creation — applies to the first thread this visitor creates
const widget = createUraiChatWidget({
  widgetToken: "<widget token>",
  userId: "user_42",
  collections: ["9f1c…", "4b7e…"],
});

// 2. Live — patches the active thread, or is buffered for the next one
widget.setCollections(["9f1c…"]);
widget.setCollections(null); // clear the extra scope

// 3. Seeding a fresh conversation
widget.startConversation({ vars: { topic: "billing" }, collections: ["9f1c…"] });
```

**Pass collection ids, not slugs.** A widget token lives in your page source,
so the unguessable id is what keeps the rest of your organization's
collections out of reach. The server checks every id against the organization
that owns the widget and rejects the whole call if one doesn't belong — you'll
see that as an `error` event (the panel stays usable), which is deliberate: a
scope that silently isn't what you asked for produces confident answers drawn
from the wrong documents.

Scope is per conversation, not per message — every turn of a thread inherits
it, and it survives a page reload with the thread.

## Receiving commands from tools

A uraiJS tool can signal the host page during a turn by calling
`meta.urai.sendCommand(meta.vars.thread_id, payload)` — e.g. to navigate
the app to a relevant view. The widget surfaces it as a `command` event:

```ts
widget.on("command", (e) => {
  if (e.type !== "command") return;
  const cmd = e.command as { command?: string; url?: string };
  // The payload is whatever the tool author sent — treat it as untrusted
  // input and validate before acting.
  if (cmd.command === "navigate" && typeof cmd.url === "string") {
    router.push(cmd.url);
  }
});
```

Caveats: commands are delivered only while the assistant turn's stream is
open (a command fired long after the tool returns may be dropped), and
every open widget for the conversation (e.g. multiple tabs) receives its
own copy.

## Displaying rich components

A tool can put UI in the reply — an order card, a map, a confirm button —
by naming a component and passing props:

```ts
// In a uraiJS tool
await meta.urai.sendCommand(meta.vars.thread_id, {
  command: "displayComponent",
  component: "OrderCard",
  props: { orderId: "o-1", status: "shipped" },
});
```

The widget never runs code from the tool. It looks the name up in the
renderers you register and calls that renderer:

```ts
const widget = createUraiChatWidget({
  widgetToken: "<widget token>",
  userId: "user_42",
  displayComponents: {
    OrderCard(element, props, { sendMessage }) {
      // `props` is tool output: check it, and never put it in innerHTML.
      const id = typeof props.orderId === "string" ? props.orderId : "?";
      const title = document.createElement("strong");
      title.textContent = `Order ${id}`;
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel order";
      cancel.onclick = () => sendMessage(`Cancel order ${id}`);
      element.append(title, cancel);
      return () => { /* optional cleanup */ };
    },
  },
});
```

Components render below the reply text, in the order they were sent, both
while the reply streams in and when the conversation is loaded again from
history (the server saves them on the message). Names with no renderer are
skipped with a one-time console warning. A renderer that throws is logged
and dropped without breaking the reply.

`element` sits in **your page's DOM** and is slotted into the widget's
shadow root. That means your stylesheets apply to it and you can mount a
React, Vue or Svelte app into it. Tear that app down in the cleanup
function, which runs when the message leaves the transcript (new
conversation, thread switch, `destroy()`).

`component` must start with a letter and contain only letters, digits and
`_ . : -` (at most 100 characters); `props`, when given, must be an object.
Anything else is not drawn. The payload is capped at 64 KB like every
command, and it still reaches `command` listeners either way.

Renderers are read when the widget is created.

## Notes

- The widget renders into a closed shadow root; host-page CSS cannot leak in.
- Files the assistant writes to the conversation's workspace (charts, CSVs,
  reports) show on the reply that made them — images inline, SVG included,
  anything else as a download — and the header offers the whole workspace
  as one zip once a file has been shown. They are fetched with the visitor header, so
  they need a chat-service with the thread filesystem enabled and the
  `files` field on widget messages.
- Multiple instances per page are supported. Two instances with the same
  `(widgetToken, userId)` intentionally share the persisted thread.
- `configure()` with structural changes (mode, position, header visibility,
  welcome message, suggested questions) rebuilds the panel and clears the
  visible conversation; cosmetic changes (colors, labels) apply in place.
- SSR-safe to import; `createUraiChatWidget` itself must run in the browser
  (call it from an effect/`onMount`).
