# @uraiai/chat-widget-svelte

Svelte 5 component for the Urai chat widget.

```bash
npm install @uraiai/chat-widget-svelte
```

```svelte
<script lang="ts">
  import { UraiChatWidget } from "@uraiai/chat-widget-svelte";

  let widget: UraiChatWidget;
</script>

<button onclick={() => widget.getController()?.open()}>Chat with us</button>

<UraiChatWidget
  bind:this={widget}
  widgetToken="<widget token>"
  userId="<stable visitor id>"
  theme={{ primaryColor: "#0ea5e9" }}
  onassistantreply={(content) => console.log(content)}
/>
```

> **Allow your origin.** The server validates the `Origin` header of every
> widget request (including the SSE stream) against the widget's allowed
> origins. Add your app's origin in the Urai dashboard or all requests 403.

## Props

Required: `widgetToken`, `userId`.
Optional: `baseUrl` (defaults to `https://chat.app.urai.dev`; set it for
self-hosted deployments), `vars`, `collections`, `theme`, `layout`, `behavior`,
`displayComponents`, `mode` (`"floating"` default | `"inline"`), `threadId`,
`readOnly`, and callback props `onready`, `onopened`, `onclosed`,
`onusermessage`, `onassistantreply`, `oncommand`, `onthreadchange`,
`onerror`.

`onthreadchange(threadId, { previousThreadId, reason })` fires whenever the
conversation moves to another thread. Save `threadId` when `reason` is
`"created"`, then show a saved conversation with `threadId` and `readOnly`:

```svelte
<UraiChatWidget widgetToken="…" userId={user.id} mode="inline" threadId={selectedThreadId} readOnly />
```

`readOnly` shows the transcript only (no composer or switcher) and writes
nothing. `userId` must be the visitor who owns the thread. See "Saving and
showing past conversations" in `@uraiai/chat-widget-core` for the details,
including who should be allowed to view what.

`oncommand` fires when a uraiJS tool calls
`meta.urai.sendCommand(meta.vars.thread_id, payload)` during the turn —
use it to react to tool-driven UI signals (e.g. navigation). The payload
is the tool author's JSON, verbatim: treat it as untrusted and validate
its shape before acting. Delivered only while the turn's stream is open;
each open widget instance receives its own copy.

`displayComponents` maps component names to renderers, for UI a tool
asks to show with `sendCommand(thread_id, { command: "displayComponent",
component, props })`. Each renderer is
`(element, props, { sendMessage }) => cleanup?`, and `element` is in your
page's DOM, so your styles apply and you can mount a component into it.
Components render below the reply text, live and from history. It is read
when the widget is created. See "Displaying rich components" in
`@uraiai/chat-widget-core` for the full contract.

```svelte
<script lang="ts">
  import { mount, unmount } from "svelte";
  import { UraiChatWidget, type ComponentRenderers } from "@uraiai/chat-widget-svelte";
  import OrderCard from "./OrderCard.svelte";

  const displayComponents: ComponentRenderers = {
    OrderCard: (element, props, { sendMessage }) => {
      const app = mount(OrderCard, { target: element, props: { ...props, sendMessage } });
      return () => unmount(app);
    },
  };
</script>

<UraiChatWidget widgetToken="…" userId="…" {displayComponents} />
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

`bind:this` gives you the component instance; call `getController()` on it
for the full `WidgetController` (`open`, `close`, `sendMessage`,
`startConversation`, `openThread`, `getThreadId`, `getThreadSummary`, `on`, …). It returns `null` until mounted.

## Passing context (vars)

Vars are a JSON object stored on the thread and made available to your
assistant (plan, locale, current route, …). The idiomatic way is the `vars`
prop — changing it calls `setVars()` on the active thread (deep-compared,
so inline literals are fine):

```svelte
<script lang="ts">
  import { page } from "$app/state";
  import { UraiChatWidget } from "@uraiai/chat-widget-svelte";
</script>

<UraiChatWidget
  widgetToken="<widget token>"
  userId="user_42"
  vars={{ plan: "pro", page: page.url.pathname }}
/>
```

Or imperatively through the controller:

```ts
widget.getController()?.setVars({ plan: "pro" });          // update active thread
widget.getController()?.setVars(null);                     // clear
widget.getController()?.setCollections(["9f1c…"]);         // scope knowledge
widget.getController()?.startConversation({                // seed a fresh thread
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

```svelte
<UraiChatWidget
  widgetToken="<widget token>"
  userId="user_42"
  collections={[billingCollectionId]}
/>
```
