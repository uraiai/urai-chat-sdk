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
| `theme` / `layout` / `behavior` | no | Override the server-configured appearance. Merge order: defaults → server config → these options → `configure()` calls. |
| `container` | no | An element to render into. Providing it switches the widget to inline mode; omitting it mounts a floating launcher on `document.body`. |
| `fetchServerConfig` | no | Set `false` to skip the `GET /config` call and use local options only. |

## Controller

`open() / close() / toggle()`, `sendMessage(content)`, `reset()`,
`setUser({ id, vars? })` (identity change resets the conversation),
`setVars(vars)`, `startConversation(vars?)`, `configure(overrides)`,
`on(event, listener)` (returns an unsubscribe function), `ready`
(promise, resolves after config fetch + mount), `destroy()` (idempotent).

Events: `ready`, `opened`, `closed`, `user-message`, `assistant-reply`,
`error`, `destroyed`.

Calls made before `ready` resolves are queued and replayed in order.

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

## Notes

- The widget renders into a closed shadow root; host-page CSS cannot leak in.
- Multiple instances per page are supported. Two instances with the same
  `(widgetToken, userId)` intentionally share the persisted thread.
- `configure()` with structural changes (mode, position, header visibility,
  welcome message, suggested questions) rebuilds the panel and clears the
  visible conversation; cosmetic changes (colors, labels) apply in place.
- SSR-safe to import; `createUraiChatWidget` itself must run in the browser
  (call it from an effect/`onMount`).
