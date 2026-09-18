# @uraiai/chat-widget-vue

Vue 3 component for the Urai chat widget.

```bash
npm install @uraiai/chat-widget-vue
```

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

> **Allow your origin.** The server validates the `Origin` header of every
> widget request (including the SSE stream) against the widget's allowed
> origins. Add your app's origin in the Urai dashboard or all requests 403.

## Props & events

Required props: `widgetToken`, `userId`.
Optional: `baseUrl` (defaults to `https://chat.app.urai.dev`; set it for
self-hosted deployments), `vars`, `collections`, `theme`, `layout`, `behavior`, `displayComponents`, `mode`
(`"floating"` default | `"inline"`).
Emits: `ready`, `opened`, `closed`, `user-message`, `assistant-reply`,
`command`, `error`.

`@command` fires when a uraiJS tool calls
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

```ts
import { createApp, h } from "vue";
import type { ComponentRenderers } from "@uraiai/chat-widget-vue";
import OrderCard from "./OrderCard.vue";

const displayComponents: ComponentRenderers = {
  OrderCard(element, props, { sendMessage }) {
    const app = createApp({ render: () => h(OrderCard, { ...props, sendMessage }) });
    app.mount(element);
    return () => app.unmount();
  },
};
// <UraiChatWidget widget-token="…" user-id="…" :display-components="displayComponents" />
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
| `widgetToken`, `baseUrl`, `mode` | Destroys and recreates the widget. |

The template ref exposes `controller` (a `WidgetController` with `open`,
`close`, `sendMessage`, `startConversation`, `on`, …); it is `null` until
mounted.

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
