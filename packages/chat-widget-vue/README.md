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
self-hosted deployments), `vars`, `theme`, `layout`, `behavior`, `mode`
(`"floating"` default | `"inline"`).
Emits: `ready`, `opened`, `closed`, `user-message`, `assistant-reply`,
`error`.

In inline mode the component renders a `div` and the chat panel fills it —
size it via the parent element.

## Prop changes: live vs. remount

| Prop | Effect |
|---|---|
| `theme`, `layout`, `behavior` | Applied live via `configure()` (deep-compared). Structural changes (mode/position/header/welcome/suggested) rebuild the panel and clear the visible conversation. |
| `userId` | `setUser()` — resets the conversation for the new visitor. |
| `vars` | `setVars()` — updates the current/next thread's context. |
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
widget.value?.controller?.startConversation({ topic: "billing" }); // seed a fresh thread
```
