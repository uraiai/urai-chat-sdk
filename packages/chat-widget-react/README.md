# @uraiai/chat-widget-react

React component for the Urai chat widget (React 18 / 19).

```bash
npm install @uraiai/chat-widget-react
```

```tsx
import { useRef } from "react";
import { UraiChatWidget, type WidgetController } from "@uraiai/chat-widget-react";

function App() {
  const widget = useRef<WidgetController>(null);

  return (
    <>
      <button onClick={() => widget.current?.open()}>Chat with us</button>
      <UraiChatWidget
        ref={widget}
        widgetToken="<widget token>"
        userId="<stable visitor id>"
        theme={{ primaryColor: "#0ea5e9" }}
        onAssistantReply={(content) => console.log(content)}
      />
    </>
  );
}
```

> **Allow your origin.** The server validates the `Origin` header of every
> widget request (including the SSE stream) against the widget's allowed
> origins. Add your app's origin in the Urai dashboard or all requests 403.

## Props

Required: `widgetToken`, `userId`.
Optional: `baseUrl` (defaults to `https://chat.app.urai.dev`; set it for
self-hosted deployments), `vars`, `theme`, `layout`, `behavior`, `mode`
(`"floating"` default | `"inline"`), `className`/`style` (inline container
div only), and
event callbacks `onReady`, `onOpened`, `onClosed`, `onUserMessage`,
`onAssistantReply`, `onError`.

In inline mode the component renders a `div` and the chat panel fills it —
give it a height via `style`/`className`.

## Prop changes: live vs. remount

| Prop | Effect |
|---|---|
| `theme`, `layout`, `behavior` | Applied live via `configure()` (deep-compared, so inline object literals are fine). Structural changes (mode/position/header/welcome/suggested) rebuild the panel and clear the visible conversation. |
| `userId` | `setUser()` — resets the conversation for the new visitor. |
| `vars` | `setVars()` — updates the current/next thread's context. |
| `widgetToken`, `baseUrl`, `mode` | Destroys and recreates the widget. |

The `ref` exposes the full `WidgetController` (`open`, `close`,
`sendMessage`, `startConversation`, `on`, …). Mount/unmount is idempotent
and StrictMode-safe.

## Passing context (vars)

Vars are a JSON object stored on the thread and made available to your
assistant (plan, locale, current route, …). The idiomatic way is the `vars`
prop — changing it calls `setVars()` on the active thread (deep-compared,
so inline literals are fine):

```tsx
function App() {
  const location = useLocation();
  const widget = useRef<WidgetController>(null);

  return (
    <UraiChatWidget
      ref={widget}
      widgetToken="<widget token>"
      userId="user_42"
      vars={{ plan: "pro", page: location.pathname }}
    />
  );
}
```

Or imperatively through the controller:

```tsx
widget.current?.setVars({ plan: "pro" });          // update active thread
widget.current?.setVars(null);                     // clear
widget.current?.startConversation({ topic: "billing" }); // seed a fresh thread
```
