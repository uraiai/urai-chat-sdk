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
self-hosted deployments), `vars`, `theme`, `layout`, `behavior`, `mode`
(`"floating"` default | `"inline"`), and callback props `onready`,
`onopened`, `onclosed`, `onusermessage`, `onassistantreply`, `oncommand`,
`onerror`.

`oncommand` fires when a uraiJS tool calls
`meta.urai.sendCommand(meta.vars.thread_id, payload)` during the turn —
use it to react to tool-driven UI signals (e.g. navigation). The payload
is the tool author's JSON, verbatim: treat it as untrusted and validate
its shape before acting. Delivered only while the turn's stream is open;
each open widget instance receives its own copy.

In inline mode the component renders a `div` and the chat panel fills it —
size it via the parent element.

## Prop changes: live vs. remount

| Prop | Effect |
|---|---|
| `theme`, `layout`, `behavior` | Applied live via `configure()` (deep-compared). Structural changes (mode/position/header/welcome/suggested) rebuild the panel and clear the visible conversation. |
| `userId` | `setUser()` — resets the conversation for the new visitor. |
| `vars` | `setVars()` — updates the current/next thread's context. |
| `widgetToken`, `baseUrl`, `mode` | Destroys and recreates the widget. |

`bind:this` gives you the component instance; call `getController()` on it
for the full `WidgetController` (`open`, `close`, `sendMessage`,
`startConversation`, `on`, …). It returns `null` until mounted.

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
widget.getController()?.startConversation({ topic: "billing" }); // seed a fresh thread
```
